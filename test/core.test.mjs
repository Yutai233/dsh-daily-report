import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const dir = mkdtempSync(path.join(tmpdir(), 'ddr-core-'))
process.env.DSH_DAILY_REPORT_DIR = dir
const { foldSession, collectDay, commandFamily } = await import('../lib/collect/sessions.js')
const { summarizeDay, createCompleter, templateSummary } = await import('../lib/summarize.js')
const { buildDailyReport, delta } = await import('../lib/analyze/report.js')
const { normalizeConfig, DEFAULTS } = await import('../lib/config.js')
const { dayRange, isoWeek } = await import('../lib/util.js')

const D = '2026-11-10'
const { start } = dayRange(D)
const at = (h, m = 0) => start + h * 3600000 + m * 60000

function events() {
  let seq = 0
  const e = (type, time, data) => ({ type, seq: seq++, time, data })
  return [
    e('turn/start', at(9), { turn: 1 }),
    e('step/start', at(9), { turn: 1, step: 1 }),
    e('user/message', at(9), { content: [{ type: 'text', text: '帮我修复 src/index.js 的 bug' }], source: { kind: 'user' } }),
    e('user/message', at(9), { content: [{ type: 'text', text: 'system injected' }], source: { kind: 'system-prompt' } }),
    e('assistant/message', at(9, 1), { turn: 1, message: { content: [{ type: 'text', text: '先看看文件' }] }, usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 5000, cacheWriteTokens: 0, totalTokens: 6200 }, stream: [{ type: 'chunk', time: at(9, 0) + 1500 }, { type: 'chunk', time: at(9, 0) + 6500 }] }),
    e('tool/call', at(9, 1), { turn: 1, callId: 'c1', name: 'edit', arguments: JSON.stringify({ file_path: 'E:\\proj\\src\\index.js', old_string: 'a', new_string: 'b' }) }),
    e('tool/result', at(9, 2), { message: { toolCallId: 'c1', isError: false, content: [] } }),
    e('tool/call', at(9, 2), { turn: 1, callId: 'c2', name: 'pwsh', arguments: '{"command":"npm test"}' }),
    e('job/registered', at(9, 2), { label: 'npm test', kind: 'pwsh' }),
    e('job/settled', at(9, 3), { label: 'npm test', status: 'completed', detail: 'exit code: 1' }),
    e('tool/result', at(9, 3), { message: { toolCallId: 'c2', isError: true, content: [{ type: 'text', text: 'exit code: 1' }] } }),
    e('tool/call', at(9, 3), { turn: 1, callId: 'c3', name: 'web_fetch', arguments: '{"url":"https://www.github.com/x"}' }),
    e('tool/result', at(9, 4), { message: { toolCallId: 'c3', isError: false, content: [] } }),
    e('approval/asked', at(9, 4), { id: 'a1' }),
    e('approval/decided', at(9, 4) + 1500, { id: 'a1', outcome: 'allowed-once' }),
    e('llm/retry', at(9, 5), { failure: { code: 'SERVER' } }),
    e('todo/write', at(9, 5), { todos: [{ content: '补测试', status: 'pending' }, { content: '修 bug', status: 'completed' }] }),
    e('assistant/message', at(9, 6), { turn: 1, message: { content: [{ type: 'text', text: '已修复 index.js 的空指针，测试仍有 1 个失败。' }] } }),
    e('deliverables/presented', at(9, 6), { files: [{ path: 'E:\\proj\\README.md', description: '说明' }] }),
    e('turn/end', at(9, 6), { turn: 1, reason: { kind: 'completed' } }),
    e('turn/start', at(10), { turn: 2 }),
    e('user/message', at(10), { content: [{ type: 'text', text: '不对，重来' }], source: { kind: 'user' } }),
    e('turn/end', at(10, 1), { turn: 2, reason: { kind: 'interrupted' } }),
    e('user/message', at(30), { content: [{ type: 'text', text: '次日消息不应计入' }], source: { kind: 'user' } }),
  ]
}

test('foldSession extracts the design-doc facts', () => {
  const r = foldSession({ id: 's1', cwd: 'E:\\proj', title: '修 bug' }, events(), start, start + 86400000)
  const s = r.session
  assert.equal(s.userMessages, 2, 'only human messages inside the day')
  assert.equal(s.turns, 2)
  assert.equal(s.toolCalls, 3)
  assert.deepEqual(s.filesChanged, [{ path: 'src/index.js', count: 1 }])
  assert.equal(s.tokens.total, 6200)
  assert.ok(s.costCny > 0)
  assert.deepEqual(s.openTodos, ['补测试'])
  assert.equal(s.interruptedTurns, 1)
  assert.equal(s.retries, 1)
  assert.equal(s.deliverables.length, 1)
  assert.ok(s.failures.some((f) => f.kind === 'tool' && f.name === 'pwsh'))
  assert.ok(s.failures.some((f) => f.kind === 'job'))
  assert.equal(r.acc.approvals.count, 1)
  assert.equal(r.acc.approvals.waitMs, 1500)
  assert.deepEqual(r.acc.domains, { 'github.com': 1 })
  assert.equal(r.acc.reworkCount, 1)
  assert.equal(r.acc.tools.pwsh.durations[0], 60000)
  assert.ok(r.acc.finalReplies[0].includes('已修复'))
  assert.equal(r.acc.outputTokens, 200)
})

test('collectDay aggregates and builds fact packs', async () => {
  const src = {
    list: async () => [{ id: 's1', createdAt: start, cwd: 'E:\\proj' }, { id: 'sub', createdAt: start, cwd: 'E:\\proj', origin: 'subagent' }],
    read: async () => events(),
    titles: async () => ({ s1: '修 bug' }),
  }
  const f = await collectDay(src, D)
  assert.equal(f.totals.sessions, 1, 'subagents excluded by default')
  assert.equal(f.tools.top[0].count >= 1, true)
  assert.equal(f.tools.commands.npm, 1)
  assert.equal(f.carryOver[0].text, '补测试')
  assert.equal(f.rework.count, 1)
  assert.ok(f._packs.s1.includes('【用户消息】'))
  assert.ok(f._packs.s1.includes('已修复'))
  assert.ok(!JSON.stringify(f).includes('_packs'), 'packs are not persisted')
  const withSub = await collectDay(src, D, { includeSubagents: true })
  assert.equal(withSub.totals.sessions, 2)
})

test('commandFamily', () => {
  assert.equal(commandFamily('git status'), 'git')
  assert.equal(commandFamily('pnpm run build'), 'npm')
  assert.equal(commandFamily('& "C:\\x\\node.exe" a.js'), 'node')
  assert.equal(commandFamily('Get-ChildItem -Recurse'), 'pwsh')
  assert.equal(commandFamily('python -m pytest'), 'python')
  assert.equal(commandFamily('cargo build'), 'other')
})

test('summaries: local-only never calls a model; cloud uses llm.stream and caches', async () => {
  const src = { list: async () => [{ id: 's1', createdAt: start, cwd: 'E:\\proj' }], read: async () => events(), titles: async () => ({ s1: '修 bug' }) }
  let f = await collectDay(src, D)
  let calls = 0
  const llm = { async *stream(opts) { calls++; assert.equal(opts.provider, 'p'); yield { type: 'text-delta', text: '修复了 index.js 的空指针；测试仍有 1 个失败。' } } }
  const b = await summarizeDay(f, normalizeConfig({}), { llm })
  assert.equal(b.llmCalls, 0)
  assert.equal(calls, 0)
  assert.equal(f.sessions[0].summarySource, 'template')

  const cfgA = normalizeConfig({ privacy: 'cloud', cloudRoute: { provider: 'p', model: 'm' } })
  const a = await summarizeDay(f, cfgA, { llm })
  assert.equal(f.sessions[0].summarySource, 'llm')
  assert.equal(a.llmCalls, 2, 'one per session + one-liner')
  f = await collectDay(src, D)
  calls = 0
  await summarizeDay(f, cfgA, { llm })
  assert.equal(f.sessions[0].summarySource, 'cache')
  assert.equal(calls, 1, 'only the day one-liner is recomputed')
})

test('local-model mode refuses non-loopback hosts and never falls back to cloud', async () => {
  const c1 = createCompleter(normalizeConfig({ privacy: 'local-model', localModel: { baseUrl: 'https://api.example.com/v1', model: 'x' } }), {})
  assert.equal(c1, null)
  let url = null
  const fetchImpl = async (u, init) => { url = u; return { ok: true, json: async () => ({ choices: [{ message: { content: '本地摘要。' } }] }) } }
  const c2 = createCompleter(normalizeConfig({ privacy: 'local-model', localModel: { baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen' } }), { fetchImpl })
  assert.equal(await c2('s', 'p', 10), '本地摘要。')
  assert.equal(url, 'http://127.0.0.1:11434/v1/chat/completions')
})

test('report: only-what-changed sections and 7-day deltas', async () => {
  const src = { list: async () => [{ id: 's1', createdAt: start, cwd: 'E:\\proj' }], read: async () => events(), titles: async () => ({}) }
  const f = await collectDay(src, D)
  await summarizeDay(f, normalizeConfig({}), {})
  const hist = [{ date: '2026-11-09', totals: { ...f.totals, sessions: 1, tokens: { ...f.totals.tokens, total: 3100 }, costCny: f.totals.costCny / 2 } }]
  const r = buildDailyReport(f, hist, normalizeConfig({}))
  assert.equal(r.sections.usage.rows[0].delta, '+100%')
  assert.equal(r.sections.usage.rows[0].trend, 'up')
  assert.ok(r.sections.blockers.items.some((x) => x.includes('LLM 重试')))
  assert.equal(r.sections.carryOver[0].text, '补测试')
  const quiet = { ...f, sessions: [], tools: { ...f.tools, top: [], failures: [], hotFiles: [] }, totals: { ...f.totals, sessions: 0, retries: 0, turnEnds: {} }, carryOver: [], rework: { count: 0, ratio: 0 } }
  const rq = buildDailyReport(quiet, [], normalizeConfig({}))
  assert.equal(rq.sections.blockers, null)
  assert.equal(rq.sections.carryOver, null)
  assert.equal(rq.sections.usage, null)
  assert.equal(delta(5, 0), null)
})

test('config defaults encode the three decisions as user settings', () => {
  assert.equal(DEFAULTS.privacy, 'local-only')
  assert.equal(DEFAULTS.inputSampling, false)
  assert.equal(DEFAULTS.delivery, 'both')
  const c = normalizeConfig({ privacy: 'cloud', inputSampling: true, delivery: 'fixed', deliveryTime: '7:05' })
  assert.equal(c.deliveryTime, '07:05')
  assert.equal(normalizeConfig({ deliveryTime: '25:00' }).deliveryTime, '09:00')
})

test('isoWeek', () => {
  assert.equal(isoWeek('2026-11-12').key, '2026-W46')
  assert.equal(isoWeek('2026-01-01').key, '2026-W01')
  assert.equal(isoWeek('2027-01-01').key, '2026-W53')
  assert.equal(isoWeek('2026-11-12').start, '2026-11-09')
})

test.after(() => rmSync(dir, { recursive: true, force: true }))
