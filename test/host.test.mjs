// Host-entry integration test with a mocked cordis ctx (no DSH needed).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const dir = mkdtempSync(path.join(tmpdir(), 'ddr-host-'))
process.env.DSH_DAILY_REPORT_DIR = dir
const { apply, inject } = await import('../lib/index.js')
const { summarizeDay } = await import('../lib/summarize.js')
const pendingTodos = Array.from({ length: 6 }, (_, i) => ({ content: '待续事项 ' + (i + 1), status: i === 0 ? 'in_progress' : 'pending' }))

function mockCtx(raw = {
  list: async () => [{ id: 'synthetic', createdAt: new Date('2026-11-10T00:00:00').getTime() }],
  read: async () => [
    { type: 'user/message', seq: 1, time: new Date('2026-11-10T10:00:00').getTime(), data: { source: { kind: 'user' }, content: '合成测试消息' } },
    { type: 'todo/write', seq: 2, time: new Date('2026-11-10T10:01:00').getTime(), data: { todos: pendingTodos } },
  ],
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

for (const length of [90, 300]) {
  test('day summary preserves complete model output of ' + length + ' characters', async () => {
    const expected = '今'.repeat(length - 5) + '完整结尾。'
    const sessionSummary = '已完成后端修改并通过回归验证。'
    const facts = {
      date: '2026-11-10',
      sessions: [{ id: 'long-day-summary-' + length, title: '摘要回归', lastSeq: 1 }],
      _packs: { ['long-day-summary-' + length]: '完成后端修改与验证。' },
    }
    let calls = 0
    const result = await summarizeDay(facts, {
      privacy: 'cloud', cloudRoute: { provider: 'mock', model: 'mock' },
    }, {
      llm: {
        async *stream() {
          calls++
          yield { type: 'text-delta', text: calls === 1 ? sessionSummary : expected }
        },
      },
    })
    assert.equal(calls, 2, 'session and day both use the model')
    assert.equal(facts.sessions[0].summary, sessionSummary)
    assert.equal(result.oneLiner, expected, 'day summary retains every model character and its ending')
    assert.equal(result.oneLiner.length, length)
    assert.equal(result.oneLiner.includes('…'), false, 'no truncation ellipsis is inserted')
  })
}

test('host entry: RPC round trip, generation, dispose', { timeout: 240000 }, async (t) => {
  const { ctx, routes, effects, registeredTools } = mockCtx()
  apply(ctx, {})
  t.after(async () => {
    for (const e of effects) if (typeof e === 'function') await e()
    assert.equal(routes.size, 0, 'routes removed on dispose')
  })
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
  const expectedCarryOver = pendingTodos.map((todo) => ({ text: todo.content, title: '合成测试', kind: 'todo', sessionId: 'synthetic' }))
  assert.ok(g.value.sessionIds.includes('synthetic'))
  assert.equal((g.value.html.match(/data-ddr-session="synthetic"/g) || []).length, 6)
  assert.equal(g.value.card.layer1.discovery, null, 'local-only never invents discoveries')
  assert.deepEqual(g.value.card.carryOver, expectedCarryOver, 'generated card contains all six pending items')
  assert.equal(Object.hasOwn(g.value.card, 'mainline'), false, 'card omits the removed mainline section')
  assert.equal(g.value.card.gen, null, 'local-only generation spends no model tokens, so there is nothing to report')
  assert.equal(g.value.card.layer1.usage.cost, g.value.card.usage.rows[1].value, 'structured usage mirrors the report usage rows')
  assert.equal(g.value.card.layer1.usage.tokens, g.value.card.usage.rows[0].value)

  const w = await rpc(routes, 'generate', { kind: 'weekly', date: '2026-11-12' })
  assert.equal(w.ok, true, JSON.stringify(w.error))
  assert.equal(w.value.key, '2026-W45')

  const r = await rpc(routes, 'report', { kind: 'daily', key: '2026-11-10' })
  assert.equal(r.value.report.kind, 'daily')
  assert.deepEqual(r.value.report.sections.carryOver, expectedCarryOver, 'full report retains all six pending items')
  assert.deepEqual(g.value.card.carryOver, r.value.report.sections.carryOver, 'generated card matches full report')
  assert.deepEqual(r.value.card.carryOver, r.value.report.sections.carryOver, 'saved-report card matches full report')
  assert.equal(Object.hasOwn(r.value.card, 'mainline'), false)
  assert.deepEqual(r.value.report.meta, { gen: { calls: 0, tokens: 0, inputTokens: 0, outputTokens: 0, costCny: 0, estimated: false } }, 'generation meta survives the JSON round trip')
  const bad = await rpc(routes, 'report', { kind: 'daily', key: '../../x' })
  assert.equal(bad.ok, false)

  s = await rpc(routes, 'state')
  assert.ok(s.value.reports.daily.includes('2026-11-10'))
  assert.ok(s.value.reports.weekly.includes('2026-W45'))
  assert.equal(s.value.generating, false, 'queue is released after generation')
  assert.deepEqual(s.value.card.carryOver, r.value.report.sections.carryOver, 'popup state card matches full report')
  assert.equal(Object.hasOwn(s.value.card, 'mainline'), false)
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

})

test.after(() => rmSync(dir, { recursive: true, force: true }))
