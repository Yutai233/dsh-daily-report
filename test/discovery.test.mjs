import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Set the root before importing modules: never read or write real user history.
const dir = mkdtempSync(path.join(tmpdir(), 'ddr-discovery-'))
process.env.DSH_DAILY_REPORT_DIR = dir
const { summarizeDay, templateOneLiner } = await import('../lib/summarize.js')
const { collectDay } = await import('../lib/collect/sessions.js')
const { generateDaily, generatePeriod } = await import('../lib/engine.js')
const { buildDailyReport, buildPeriodReport } = await import('../lib/analyze/report.js')
const { normalizeConfig } = await import('../lib/config.js')
const { loadFacts, loadReport, saveFacts } = await import('../lib/store.js')
const { dayRange, fmtDate, addDays } = await import('../lib/util.js')

const date = '2026-11-10'
const { start } = dayRange(date)
const sessionSummary = '修复了两处导出失败；两个项目都重复手工补上同一份字体配置。'
const oneLiner = '修复了两个项目的导出失败。'
const discovery = '两个独立项目都靠手工补字体配置恢复导出，重复步骤可能适合收敛成共享的导出前检查。'
const cfg = normalizeConfig({ privacy: 'cloud', cloudRoute: { provider: 'test', model: 'synthetic' }, weather: { enabled: false }, heartbeat: false, health: { enabled: false } })
let nextId = 0
function source({ withTodo = true } = {}) {
  const id = 'discovery-' + ++nextId
  const events = [
    { seq: 1, type: 'user/message', time: start + 36000000, data: { source: { kind: 'user' }, content: '两个项目导出都要手工补字体配置。' } },
    { seq: 2, type: 'todo/write', time: start + 36001000, data: { todos: [{ content: '补齐导出回归测试', status: 'pending' }] } },
    { seq: 3, type: 'turn/end', time: start + 36002000, data: { reason: { kind: 'interrupted' } } },
  ]
  return {
    list: async () => [{ id, createdAt: start, cwd: 'E:\\synthetic-project' }],
    read: async () => events.filter((e) => withTodo || e.type !== 'todo/write'),
    titles: async () => ({ [id]: '修复导出' }),
  }
}
function model(dayReply, sessionReply = sessionSummary) {
  const calls = []
  const llm = {
    async *stream(opts) {
      calls.push(opts)
      const reply = opts.system.includes('discovery') ? dayReply : sessionReply
      if (reply instanceof Error) throw reply
      if (reply !== null) yield { type: 'text-delta', text: reply }
    },
  }
  return { llm, calls }
}
async function summarize(reply, options = {}) {
  const facts = await collectDay(source(), date)
  const mock = model(reply, options.sessionReply)
  const result = await summarizeDay(facts, cfg, { llm: mock.llm })
  return { facts, result, ...mock }
}

test('DAY judges optional discovery in the existing call, with explicit evidence and nonduplication rules', async () => {
  const { result, calls } = await summarize(JSON.stringify({ oneLiner, discovery }))
  assert.equal(result.oneLiner, oneLiner)
  assert.equal(result.discovery, discovery)
  assert.equal(result.llmCalls, 2)
  assert.equal(calls.length, 2, 'one session + one DAY call; never a separate discovery call')
  const day = calls[1]
  assert.match(day.system, /证据不足.*null/)
  assert.match(day.system, /泛泛建议/)
  assert.match(day.system, /不要只是复述.*待办.*成本建议.*健康提醒/)
  assert.match(day.messages[0].content[0].text, /手工补上同一份字体配置/)
  assert.match(day.messages[0].content[0].text, /已有待办，不要重复.*\n- 补齐导出回归测试/)
  assert.ok(day.maxTokens >= 400, 'the structured reply has room for both fields')
})

test('fenced JSON, surrounding prose, think blocks and multiline discoveries are parsed without leaking markup', async () => {
  const reply = '<think>不显示推理</think>\n结果：\n```json\n' + JSON.stringify({ oneLiner, discovery: '两个项目重复配置字体。\n可共用导出检查。' }) + '\n```'
  const { result } = await summarize(reply)
  assert.equal(result.oneLiner, oneLiner)
  assert.equal(result.discovery, '两个项目重复配置字体。 可共用导出检查。')
  assert.doesNotMatch(result.oneLiner + result.discovery, /```|think|oneLiner|discovery/)
})

test('no evidence is represented by null, including empty, literal and non-string model values', async () => {
  for (const value of [null, '', '   ', 'null', ' NULL ', 'none', 'None.', 'undefined', 'n/a', 4, false, {}, []]) {
    const { result } = await summarize(JSON.stringify({ oneLiner, discovery: value }))
    assert.equal(result.oneLiner, oneLiner)
    assert.equal(result.discovery, null, 'reject ' + JSON.stringify(value))
  }
  const { result } = await summarize(JSON.stringify({ oneLiner }))
  assert.equal(result.discovery, null)
})

test('discovery keeps a complete explanation instead of the old 60-character cut', async () => {
  const longOneLiner = '这是旧模型返回的完整日总结。'.repeat(30)
  // The sentence that used to be cut to 60 characters and lost its reason.
  const fullDiscovery = '弹窗定位引发的 React 更新循环会触发 Host 停用整个槽位，因此鲸鱼和日报会一起消失；加错误隔离后回归通过，这类问题现在会先降级成一条可见告警。'
  const { result } = await summarize(JSON.stringify({ oneLiner: longOneLiner, discovery: fullDiscovery }))
  assert.equal(result.oneLiner, longOneLiner)
  assert.equal(result.discovery, fullDiscovery, 'a complete 79-character finding must survive intact')
  const runaway = (await summarize(JSON.stringify({ oneLiner: longOneLiner, discovery: '两个项目共享同一套字体检查流程。'.repeat(30) }))).result
  assert.equal(runaway.discovery.length, 240, 'only runaway output is trimmed, as a guard')
  assert.ok(runaway.discovery.endsWith('…'))
})

test('exact summary and todo repetitions are suppressed rather than displayed as discoveries', async () => {
  for (const repeated of [oneLiner, sessionSummary, '补齐导出回归测试']) {
    const { result } = await summarize(JSON.stringify({ oneLiner, discovery: repeated }))
    assert.equal(result.discovery, null)
  }
})

test('legacy plain-sentence reply is kept only as oneLiner, never invented into a discovery', async () => {
  for (const reply of ['今日一句话：' + oneLiner, JSON.stringify(oneLiner), '“' + oneLiner + '”']) {
    const { result } = await summarize(reply)
    assert.equal(result.oneLiner, oneLiner)
    assert.equal(result.discovery, null)
  }
})

test('malformed structured replies and invalid JSON shapes never leak raw JSON into the report sentence', async () => {
  const badReplies = [
    '{"oneLiner":"损坏的回复","discovery":',
    '```json\n{"oneLiner":"损坏的回复",}\n```',
    '```json\n{"oneLiner":"未闭合围栏"}',
    '这里是结果：{"oneLiner":"损坏的回复","discovery":}',
    'oneLiner: 不是有效 JSON, discovery: none',
    '[{"oneLiner":"数组不是协议"}]',
    '{"oneLiner":{},"discovery":42}',
    'null',
    '',
  ]
  for (const reply of badReplies) {
    const { facts, result } = await summarize(reply)
    assert.equal(result.oneLiner, templateOneLiner(facts), reply)
    assert.equal(result.discovery, null, reply)
    assert.doesNotMatch(result.oneLiner, /oneLiner|discovery|```|损坏的回复/)
  }
})

test('cached session summaries still use only one DAY call and reevaluate discovery instead of caching it', async () => {
  const src = source()
  const first = await collectDay(src, date)
  const yes = model(JSON.stringify({ oneLiner, discovery }))
  await summarizeDay(first, cfg, { llm: yes.llm })
  const second = await collectDay(src, date)
  const no = model(JSON.stringify({ oneLiner, discovery: null }))
  const result = await summarizeDay(second, cfg, { llm: no.llm })
  assert.equal(second.sessions[0].summarySource, 'cache')
  assert.equal(no.calls.length, 1)
  assert.equal(result.llmCalls, 1)
  assert.equal(result.discovery, null)
})

test('local-only, unavailable routes and empty activity cannot produce template discoveries or network calls', async () => {
  let calls = 0
  const llm = { stream() { calls++; throw new Error('unexpected cloud call') } }
  const fetchImpl = async () => { calls++; throw new Error('unexpected network call') }
  for (const config of [
    { ...cfg, privacy: 'local-only' },
    { ...cfg, cloudRoute: null },
    { ...cfg, privacy: 'local-model', localModel: { baseUrl: 'https://external.example/v1', model: 'x' } },
    { ...cfg, privacy: 'local-model', localModel: { baseUrl: 'http://127.0.0.1:1/v1', model: '' } },
  ]) {
    const facts = await collectDay(source(), date)
    const result = await summarizeDay(facts, config, { llm, fetchImpl })
    assert.equal(result.discovery, null)
    assert.equal(facts.sessions[0].summarySource, 'template')
  }
  const unavailable = await summarizeDay(await collectDay(source(), date), cfg, {})
  assert.equal(unavailable.discovery, null)
  const empty = await summarizeDay({ date, sessions: [] }, cfg, { llm, fetchImpl })
  assert.equal(empty.discovery, null)
  assert.equal(empty.oneLiner, null)
  assert.equal(empty.llmCalls, 0)
  assert.equal(calls, 0)
})

test('failed SESSION skips DAY, while failed DAY leaves a template oneLiner and null discovery', async () => {
  const failedSession = await summarize(JSON.stringify({ oneLiner, discovery }), { sessionReply: new Error('session unavailable') })
  assert.equal(failedSession.calls.length, 1)
  assert.equal(failedSession.result.discovery, null)
  const failedDay = await summarize(new Error('DAY unavailable'))
  assert.equal(failedDay.calls.length, 2)
  assert.equal(failedDay.result.oneLiner, templateOneLiner(failedDay.facts))
  assert.equal(failedDay.result.discovery, null)
})

test('generateDaily persists discovery in facts and layer1 without dropping daily carryOver session IDs', async () => {
  const src = source()
  const mock = model(JSON.stringify({ oneLiner, discovery }))
  const out = await generateDaily({ source: src, cfg, llm: mock.llm }, date)
  assert.equal(out.facts.discovery, discovery)
  assert.equal(out.report.layer1.discovery, discovery)
  assert.equal((await loadFacts(date)).discovery, discovery)
  assert.equal((await loadReport('daily', date)).layer1.discovery, discovery)
  assert.ok(out.report.sections.carryOver.some((c) => c.kind === 'todo'))
  assert.deepEqual(out.report.sections.carryOver, out.facts.carryOver)
  assert.ok(out.report.sections.carryOver.every((c) => typeof c.sessionId === 'string'))
  assert.equal(out.llmCalls, 2)
  const interrupted = await generateDaily({ source: source({ withTodo: false }), cfg, llm: mock.llm }, date)
  assert.ok(interrupted.report.sections.carryOver.some((c) => c.kind === 'interrupted'))
  assert.deepEqual(interrupted.report.sections.carryOver, interrupted.facts.carryOver)
})

test('buildDailyReport reads persisted discovery, defaults missing legacy fields to null, and honors explicit null', async () => {
  const facts = await collectDay(source(), date)
  const legacy = buildDailyReport(facts, [], cfg)
  assert.equal(legacy.layer1.discovery, null)
  facts.discovery = discovery
  assert.equal(buildDailyReport(facts, [], cfg).layer1.discovery, discovery)
  assert.equal(buildDailyReport(facts, [], cfg, { discovery: null }).layer1.discovery, null)
  assert.equal(buildDailyReport(facts, [], cfg, { discovery: {} }).layer1.discovery, null)
})

test('local-model DAY works through generateDaily without any cloud fallback, and a failed rerun keeps the stored finding', async () => {
  let localCalls = 0
  let cloudCalls = 0
  const localCfg = { ...cfg, privacy: 'local-model', localModel: { baseUrl: 'http://127.0.0.1:1/v1', model: 'synthetic' } }
  const llm = { stream() { cloudCalls++; throw new Error('no cloud fallback') } }
  const fetchImpl = async (url, init) => {
    localCalls++
    assert.equal(url, 'http://127.0.0.1:1/v1/chat/completions')
    assert.equal(init.redirect, 'error')
    const body = JSON.parse(init.body)
    const content = body.messages[0].content.includes('discovery') ? JSON.stringify({ oneLiner, discovery }) : sessionSummary
    return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) }
  }
  const out = await generateDaily({ source: source(), cfg: localCfg, llm, fetchImpl }, date)
  assert.equal(out.report.layer1.discovery, discovery)
  assert.equal(localCalls, 2)
  // The failed call judges nothing, so it must not erase the finding already on disk.
  const failed = await generateDaily({ source: source(), cfg: localCfg, llm, fetchImpl: async () => { throw new Error('offline') } }, date)
  assert.equal(failed.facts.discovery, discovery)
  assert.equal(failed.report.layer1.discovery, discovery)
  assert.equal((await loadFacts(date)).discovery, discovery)
  assert.equal(cloudCalls, 0)
})

test('daily local-only regeneration keeps an old discovery without spending tokens', async () => {
  const mock = model(JSON.stringify({ oneLiner, discovery }))
  await generateDaily({ source: source(), cfg, llm: mock.llm }, date)
  const local = await generateDaily({ source: source(), cfg: { ...cfg, privacy: 'local-only' }, llm: mock.llm }, date)
  assert.equal(local.llmCalls, 0)
  assert.equal(mock.calls.length, 2)
  assert.equal(local.report.layer1.discovery, discovery)
  assert.equal(local.facts.discovery, discovery)
  assert.equal((await loadFacts(date)).discovery, discovery)
})

test('a rerun that returns null discovery keeps the stored one, and a new finding replaces it', async () => {
  const first = model(JSON.stringify({ oneLiner, discovery }))
  await generateDaily({ source: source(), cfg, llm: first.llm }, date)
  assert.equal((await loadFacts(date)).discovery, discovery)

  const empty = model(JSON.stringify({ oneLiner, discovery: null }))
  const rerun = await generateDaily({ source: source(), cfg, llm: empty.llm }, date)
  assert.equal(rerun.facts.discovery, discovery, 'an empty rerun must not erase the stored finding')
  assert.equal(rerun.report.layer1.discovery, discovery)
  assert.equal((await loadFacts(date)).discovery, discovery)
  assert.equal((await loadReport('daily', date)).layer1.discovery, discovery)

  const replacement = '新的发现：同一份导出检查今天重复执行两次，说明可以合并成一条固定命令。'
  const fresh = model(JSON.stringify({ oneLiner: '又修了一次导出。', discovery: replacement }))
  const updated = await generateDaily({ source: source(), cfg, llm: fresh.llm }, date)
  assert.equal(updated.facts.discovery, replacement)
  assert.equal((await loadFacts(date)).discovery, replacement)
})

test('weekly and monthly carryOver preserve IDs from the latest day, retain cap, and add no discovery judgment', async () => {  const facts = await collectDay(source(), date)
  facts.discovery = discovery
  facts.carryOver = Array.from({ length: 15 }, (_, i) => ({ text: '合成待办 ' + i, sessionId: 'carry-' + i, title: '合成会话', kind: 'todo' }))
  const previous = { ...facts, date: '2026-11-09', carryOver: [{ text: '旧待办', sessionId: 'older', title: '旧会话', kind: 'todo' }] }
  const range = { start: '2026-11-09', end: date }
  for (const kind of ['weekly', 'monthly']) {
    const report = buildPeriodReport(kind, range, [facts, previous], [], cfg)
    assert.deepEqual(report.sections.carryOver, facts.carryOver.slice(0, 12))
    assert.equal(report.layer1.discovery ?? null, null, 'discovery is daily-only')
  }
  let calls = 0
  const localDate = '2026-11-08'
  const local = await generatePeriod({ source: source(), cfg, llm: { stream() { calls++; throw new Error('unexpected model') } } }, 'weekly', { start: localDate, end: localDate })
  assert.equal((await loadFacts(localDate)).discovery, null)
  assert.equal(local.report.layer1.discovery ?? null, null)
  assert.equal(calls, 0)
})

test('weekly backfill keeps the discovery already stored for today instead of blanking it', async () => {
  const today = fmtDate(Date.now())
  const facts = await collectDay(source(), today)
  facts.discovery = discovery
  facts.discoveryLinked = false
  await saveFacts(facts)
  let calls = 0
  await generatePeriod({ source: source(), cfg, llm: { stream() { calls++; throw new Error('unexpected model') } } }, 'weekly', { start: addDays(today, -2), end: today })
  assert.equal(calls, 0)
  assert.equal((await loadFacts(today)).discovery, discovery, 'a token-free today refresh must not erase the finding')
})

test.after(() => rmSync(dir, { recursive: true, force: true }))
