import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'

const dir = mkdtempSync(path.join(tmpdir(), 'ddr-engine-'))
process.env.DSH_DAILY_REPORT_DIR = dir
const { resolveReportTarget, targetDate, generatePeriod, notify } = await import('../lib/engine.js')
const { normalizeConfig } = await import('../lib/config.js')
const { collectDay } = await import('../lib/collect/sessions.js')
const { createCompleter } = await import('../lib/summarize.js')
const { saveFacts, loadFacts } = await import('../lib/store.js')
const { fmtDate, isoWeek } = await import('../lib/util.js')

function source(rows) {
  let reads = 0
  return {
    get reads() { return reads },
    list: async () => rows.map((r) => ({ id: r.id, createdAt: 0, origin: r.origin })),
    read: async (id) => { reads++; return rows.find((r) => r.id === id).events },
    titles: async () => ({}),
  }
}
const human = (date, seq = 1) => ({ seq, type: 'user/message', time: new Date(date + 'T10:00:00').getTime(), data: { source: { kind: 'user' }, content: '合成验收消息' } })
const cfg = normalizeConfig({ weather: { enabled: false }, heartbeat: false, health: { enabled: false } })

test('automatic date respects 18:00, explicit range setting and year rollover', () => {
  assert.equal(targetDate(cfg, new Date('2027-01-01T17:59:00').getTime()), '2026-12-31')
  assert.equal(targetDate(cfg, new Date('2027-01-01T18:00:00').getTime()), '2027-01-01')
  assert.equal(targetDate({ ...cfg, reportRange: 'today' }, new Date('2027-01-01T09:00:00').getTime()), '2027-01-01')
})

test('automatic date falls back across empty days, excludes subagents and blank sessions, reads once', async () => {
  const src = source([
    { id: 'main', events: [human('2026-11-10'), human('2026-11-12', 2)] },
    { id: 'sub', origin: 'subagent', events: [human('2026-11-11')] },
    { id: 'blank', events: [{ type: 'turn/start', time: new Date('2026-11-11T12:00:00').getTime(), data: {} }] },
  ])
  const out = await resolveReportTarget(src, cfg, new Date('2026-11-12T09:00:00').getTime())
  assert.equal(out.requestedDate, '2026-11-11')
  assert.equal(out.date, '2026-11-10')
  assert.match(out.fallbackNote, /11-11.*11-10/)
  const f = await collectDay(out.source, out.date)
  assert.equal(f.totals.sessions, 1)
  assert.equal(src.reads, 2, 'generation reuses the resolved snapshot')
  const withSub = await resolveReportTarget(src, { ...cfg, includeSubagents: true }, new Date('2026-11-12T09:00:00').getTime())
  assert.equal(withSub.date, '2026-11-11')
})

test('no activity stays on requested date; retention bounds and read failures are explicit', async () => {
  const now = new Date('2026-11-12T09:00:00').getTime()
  const empty = await resolveReportTarget(source([]), cfg, now)
  assert.equal(empty.date, '2026-11-11')
  assert.equal(empty.fallbackNote, null)
  const stale = await resolveReportTarget(source([{ id: 'old', events: [human('2025-01-01')] }]), cfg, now)
  assert.equal(stale.date, '2026-11-11')
  await assert.rejects(resolveReportTarget({ list: async () => [{ id: 'bad', createdAt: 0 }], read: async () => { throw new Error('locked') } }, cfg, now), /读取失败/)
})

test('current period refreshes today even if stale facts already exist, never uses LLM', async () => {
  const today = fmtDate(Date.now())
  const src = source([{ id: 'today', events: [human(today)] }])
  const old = await collectDay(source([]), today)
  await saveFacts(old)
  let calls = 0
  const deps = { cfg, source: src, llm: { stream() { calls++; throw new Error('unexpected cloud call') } } }
  const w = isoWeek(today)
  const out = await generatePeriod(deps, 'weekly', { start: w.start, end: w.end })
  const row = out.report.sections.weekly.days.find((d) => d.date === today.slice(5))
  assert.equal(row.sessions, 1)
  assert.equal((await loadFacts(today)).totals.sessions, 1)
  assert.equal(calls, 0)
  src.read = async () => [human(today), { seq: 2, type: 'tool/call', time: new Date(today + 'T11:00:00').getTime(), data: { name: 'read', callId: 'c' } }]
  await generatePeriod(deps, 'monthly', { start: today.slice(0, 8) + '01', end: today })
  assert.equal((await loadFacts(today)).totals.toolCalls, 1)
})

test('local-model refuses lookalike loopback names and follows no redirects', async () => {
  for (const baseUrl of ['http://127.evil.example/v1', 'file://localhost/v1', 'http://user:secret@localhost/v1']) {
    assert.equal(createCompleter({ privacy: 'local-model', localModel: { baseUrl, model: 'test' } }), null)
  }
  let init
  const c = createCompleter({ privacy: 'local-model', localModel: { baseUrl: 'http://127.0.0.1:1/v1', model: 'test' } }, {
    fetchImpl: async (_url, opts) => { init = opts; return { ok: true, json: async () => ({ choices: [{ message: { content: '合成本地回复' } }] }) } },
  })
  assert.equal(await c('test', 'synthetic only', 8), '合成本地回复')
  assert.equal(init.redirect, 'error')
})

test('Windows toast submits escaped XML and exposes errors without unhandled rejection', async () => {
  let command
  const fake = (code) => (cmd, args) => {
    command = { cmd, args }
    const child = new EventEmitter()
    child.kill = () => {}
    queueMicrotask(() => child.emit('exit', code))
    return child
  }
  const good = await notify("测试 ' < &", '仅合成内容', () => {}, { platform: 'win32', spawnImpl: fake(0) })
  assert.equal(good.status, 'submitted')
  const ps = Buffer.from(command.args.at(-1), 'base64').toString('utf16le')
  assert.match(ps, /&apos;.*&lt;.*&amp;/)
  assert.match(ps, /ErrorActionPreference="Stop"/)
  const bad = await notify('test', 'test', () => {}, { platform: 'win32', spawnImpl: fake(1) })
  assert.equal(bad.ok, false)
  assert.match(bad.error, /exit code: 1/)
})

test.after(() => rmSync(dir, { recursive: true, force: true }))
