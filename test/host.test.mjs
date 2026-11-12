// Host-entry integration test with a mocked cordis ctx (no DSH needed).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const dir = mkdtempSync(path.join(tmpdir(), 'ddr-host-'))
process.env.DSH_DAILY_REPORT_DIR = dir
const { apply, inject } = await import('../lib/index.js')

function mockCtx(raw = {
  list: async () => [{ id: 'synthetic', createdAt: new Date('2026-11-10T00:00:00').getTime() }],
  read: async () => [{ type: 'user/message', seq: 1, time: new Date('2026-11-10T10:00:00').getTime(), data: { source: { kind: 'user' }, content: '合成测试消息' } }],
  titles: async () => ({ synthetic: '合成测试' }),
}) {
  const routes = new Map()
  const effects = []
  const registeredTools = []
  const services = {
    sessionQuery: {
      // Shape of @deepseek-ai/dsh-session-query on 0.2.2.
      async listSessions() { return (await raw.list()).map((r) => ({ header: { id: r.id, createdAt: r.createdAt, cwd: r.cwd, origin: r.origin }, live: false, persisted: true })) },
      async readSession(id) { return { session: {}, events: await raw.read(id) } },
      async readTitleSnapshots(ids) { const t = await raw.titles(ids); return ids.map((id) => ({ status: 'fulfilled', sessionId: id, value: t[id] ? { title: { title: t[id] } } : {} })) },
    },
    connection: {
      admit: () => ({ peer: { principal: { kind: 'owner' }, interactions: 'answer', signal: new AbortController().signal } }),
      fetch: { register: (r) => { routes.set(r.path, r.fetch); return async () => routes.delete(r.path) } },
    },
    tools: { register: (t) => { registeredTools.push(t); return () => {} } },
    systemPrompt: { section: () => () => {} },
  }
  const ctx = {
    ...services,
    get: (n) => services[n],
    effect: (fn) => effects.push(fn()),
    logger: { info: () => {} },
  }
  return { ctx, routes, effects, registeredTools }
}

async function rpc(routes, method, payload = {}) {
  const fetch = routes.get('/api/daily-report/' + method)
  assert.ok(fetch, 'route registered: ' + method)
  const res = await fetch(new Request('http://127.0.0.1/api/daily-report/' + method, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: 'r1', method: 'daily-report/' + method, payload }),
  }))
  const j = await res.json()
  assert.equal(j.rpcId, 'r1')
  return j.result
}

test('inject declares only always-present services', () => {
  assert.deepEqual(inject, ['sessionQuery', 'connection', 'tools', 'systemPrompt'])
})

test('host entry: RPC round trip, generation, dispose', { timeout: 240000 }, async () => {
  const { ctx, routes, effects, registeredTools } = mockCtx()
  apply(ctx, {})
  assert.equal(routes.size, 10)
  assert.equal(registeredTools.length, 1, 'link-independent ToolDefinition is always registered')
  assert.equal(registeredTools[0].parameters.type, 'object')
  assert.deepEqual(registeredTools[0].output.schema.required, ['ok'])

  let s = await rpc(routes, 'state', { withSize: true })
  assert.equal(s.ok, true)
  assert.equal(s.value.config.privacy, 'local-only', 'privacy defaults to B (local-only)')
  assert.equal(s.value.config.inputSampling, false, 'input sampling is opt-in')
  assert.equal(s.value.config.delivery, 'both')

  const c = await rpc(routes, 'config', { delivery: 'first-open', privacy: 'bogus', health: { sitLimitMin: 5 } })
  assert.equal(c.value.config.delivery, 'first-open')
  assert.equal(c.value.config.privacy, 'local-only', 'invalid enum ignored')
  assert.equal(c.value.config.health.sitLimitMin, 20, 'clamped')

  const g = await rpc(routes, 'generate', { kind: 'daily', date: '2026-11-10' })
  assert.equal(g.ok, true, JSON.stringify(g.error))
  assert.match(g.value.html, /DSH 每日简报/)
  assert.ok(g.value.card.layer1.headline.includes('会话'))

  const w = await rpc(routes, 'generate', { kind: 'weekly', date: '2026-11-12' })
  assert.equal(w.ok, true, JSON.stringify(w.error))
  assert.equal(w.value.key, '2026-W45')

  const r = await rpc(routes, 'report', { kind: 'daily', key: '2026-11-10' })
  assert.equal(r.value.report.kind, 'daily')
  const bad = await rpc(routes, 'report', { kind: 'daily', key: '../../x' })
  assert.equal(bad.ok, false)

  s = await rpc(routes, 'state')
  assert.ok(s.value.reports.daily.includes('2026-11-10'))
  assert.ok(s.value.reports.weekly.includes('2026-W45'))
  assert.equal(s.value.generating, false, 'queue is released after generation')
  assert.equal(s.value.toolAvailable, true)
  for (const payload of [{ kind: 'invalid' }, { date: '2026-02-30' }, { current: 'yes' }]) {
    assert.equal((await rpc(routes, 'generate', payload)).ok, false)
  }
  assert.equal((await rpc(routes, 'config', { reportsDir: 'relative/path' })).ok, false)
  const custom = path.join(dir, 'custom reports 中文')
  const switched = await rpc(routes, 'config', { reportsDir: custom })
  assert.equal(switched.ok, true)
  s = await rpc(routes, 'state')
  assert.equal(s.value.reportsDir, custom)
  assert.deepEqual(s.value.reports.daily, [], 'old reports remain in old root')
  const moved = await rpc(routes, 'generate', { kind: 'daily', date: '2026-11-10' })
  assert.equal(moved.ok, true, JSON.stringify(moved.error))
  assert.equal(moved.value.files.md, path.join(custom, 'daily', '2026-11-10.md'))
  const customRead = await rpc(routes, 'report', { kind: 'daily', key: '2026-11-10' })
  assert.match(customRead.value.html, /DSH 每日简报/)
  assert.equal(customRead.value.card.htmlPath, moved.value.files.html)
  const missing = await rpc(routes, 'open', { kind: 'daily', key: '1999-01-01' })
  assert.equal(missing.ok, false, 'missing report cannot claim successful open')
  await rpc(routes, 'config', { reportsDir: '' })
  s = await rpc(routes, 'state')
  assert.ok(s.value.reports.daily.includes('2026-11-10'), 'restoring default finds old files')

  const tool = registeredTools[0]
  if (tool) {
    const out = await tool.execute({ kind: 'daily', date: '2026-11-10' }, {})
    assert.equal(out.ok, true)
    assert.match(out.markdown, /^# DSH 每日简报/)
  }

  const { createServer } = await import('node:http')
  let probeBody = null
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk
    probeBody = JSON.parse(body)
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ choices: [{ message: { content: '好' } }] }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const probe = await rpc(routes, 'probe', { localModel: { baseUrl: 'http://127.0.0.1:' + server.address().port + '/v1', model: 'synthetic-only' } })
    assert.equal(probe.value.ok, true)
    assert.equal(probe.value.sample, '好')
    assert.equal(probeBody.messages[1].content, '测试')
    assert.equal((await rpc(routes, 'state')).value.config.privacy, 'local-only', 'probe never changes privacy')
  } finally { await new Promise((resolve) => server.close(resolve)) }

  const d = await rpc(routes, 'dismiss')
  assert.equal(d.ok, true)

  for (const e of effects) if (typeof e === 'function') await e()
  assert.equal(routes.size, 0, 'routes removed on dispose')
})

test.after(() => rmSync(dir, { recursive: true, force: true }))
