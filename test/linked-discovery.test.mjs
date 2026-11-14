import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const dir = mkdtempSync(path.join(tmpdir(), 'ddr-linked-discovery-'))
process.env.DSH_DAILY_REPORT_DIR = dir
const { summarizeDay } = await import('../lib/summarize.js')
const { collectDay } = await import('../lib/collect/sessions.js')
const { generateDaily, enrichDailyBili } = await import('../lib/engine.js')
const { buildDailyReport } = await import('../lib/analyze/report.js')
const { normalizeConfig } = await import('../lib/config.js')
const { loadFacts, loadReport } = await import('../lib/store.js')
const { dayRange } = await import('../lib/util.js')
const date = '2026-11-10'
const { start } = dayRange(date)
const cfg = normalizeConfig({ privacy: 'cloud', cloudRoute: { provider: 'test', model: 'synthetic' }, weather: { enabled: false }, heartbeat: false, health: { enabled: false } })
const ordinary = '两个项目的回归检查可共用一份配置，避免重复维护。'
const linked = '压缩后本日尚未回本，工具失败也仍在发生，不能把窗口回收当作实际节约。'
let seq = 0
const bili = () => ({ source: 'billion-context', date, compressionCount: 2, reclaimedTokens: 20000, inputTokens: 100000, cachedTokens: 20000, cacheHitRate: .2, netSavedTokens: -3000, estimated: true, status: 'warning', anomalies: ['正文秘密不得上传'], coverage: 'SECRET-PRIVATE-PATH' })
function source() {
  const id = 'linked-' + ++seq
  return { list: async () => [{ id, createdAt: start }], titles: async () => ({ [id]: '校验导出' }), read: async () => [{ seq: 1, type: 'user/message', time: start + 36000000, data: { source: { kind: 'user' }, content: '检查导出失败及重复操作。' } }] }
}
function model(reply) {
  const calls = []
  return { calls, llm: { async *stream(opts) { calls.push(opts); yield { type: 'text-delta', text: opts.system.includes('discovery') ? JSON.stringify(reply) : '导出检查发现了重复操作，失败仍需排查。' } } } }
}
async function run(reply, value = bili(), config = cfg) {
  const facts = await collectDay(source(), date)
  facts.bili = value
  const mock = model(reply)
  return { facts, ...mock, result: await summarizeDay(facts, config, { llm: mock.llm }) }
}

test('same DAY request judges ordinary and cross-plugin discovery using whitelisted numbers', async () => {
  const { result, calls } = await run({ oneLiner: '检查了导出失败。', discovery: linked, discoveryLinked: true })
  assert.equal(result.discovery, linked)
  assert.equal(result.discoveryLinked, true)
  assert.equal(result.llmCalls, 2)
  assert.equal(calls.length, 2, 'one SESSION and one DAY, not a separate linked call')
  const day = calls[1]
  const prompt = day.messages[0].content[0].text
  assert.match(prompt, /插件联动数值证据/)
  assert.match(prompt, /"netSavedTokens":-3000/)
  assert.match(prompt, /"estimated":true/)
  assert.doesNotMatch(prompt, /SECRET-PRIVATE-PATH|正文秘密不得上传/)
  assert.match(day.system, /40~60 字即可/)
  assert.match(day.system, /最长 200 字/)
  assert.match(day.system, /不足以断言.*由压缩导致/)
  assert.match(day.system, /不强制写联动/)
  assert.doesNotMatch(calls[0].system, /插件联动/)
})

test('available plugins do not force a badge or replace an ordinary model discovery', async () => {
  for (const flag of [false, undefined, 'true', 1]) {
    const { result } = await run({ oneLiner: '修复配置。', discovery: ordinary, discoveryLinked: flag })
    assert.equal(result.discovery, ordinary)
    assert.equal(result.discoveryLinked, false)
  }
  const { result } = await run({ oneLiner: '修复配置。', discovery: null, discoveryLinked: true })
  assert.equal(result.discovery, null)
  assert.equal(result.discoveryLinked, false)
})

test('missing, unmeasured or wrong-day plugin data cannot enable linked discoveries', async () => {
  for (const value of [null, {}, { ...bili(), date: '2026-11-09' }, { source: 'billion-context', date, status: 'unknown', coverage: '尚无映射' }]) {
    const { result, calls } = await run({ oneLiner: '继续检查。', discovery: linked, discoveryLinked: true }, value)
    assert.equal(result.discovery, null)
    assert.equal(result.discoveryLinked, false)
    assert.doesNotMatch(calls[1].system, /插件联动数值证据/)
    assert.doesNotMatch(calls[1].messages[0].content[0].text, /插件联动数值证据/)
  }
  const { result } = await run({ oneLiner: '继续检查。', discovery: ordinary }, null)
  assert.equal(result.discovery, ordinary)
})

test('linked discovery keeps complete wording, trims only runaway output and suppresses duplicates', async () => {
  const complete = await run({ oneLiner: '继续校验。', discovery: linked, discoveryLinked: true })
  assert.equal(complete.result.discovery, linked)
  assert.equal(complete.result.discoveryLinked, true)
  const { result } = await run({ oneLiner: '继续校验。', discovery: linked.repeat(8), discoveryLinked: true })
  assert.equal(result.discovery.length, 240)
  assert.ok(result.discovery.endsWith('…'))
  assert.equal(result.discoveryLinked, true)
  const duplicate = await run({ oneLiner: linked, discovery: linked, discoveryLinked: true })
  assert.equal(duplicate.result.discovery, null)
  assert.equal(duplicate.result.discoveryLinked, false)
})

test('local-only mode makes zero model calls and never invents a linked discovery', async () => {
  const { result, calls } = await run({ discovery: linked, discoveryLinked: true }, bili(), { ...cfg, privacy: 'local-only' })
  assert.equal(result.discovery, null)
  assert.equal(result.discoveryLinked, false)
  assert.equal(calls.length, 0)
})

test('generateDaily persists linked provenance without adding a completion', async () => {
  const mock = model({ oneLiner: '完成导出检查。', discovery: linked, discoveryLinked: true })
  const out = await generateDaily({ source: source(), cfg, llm: mock.llm, readBiliDay: async () => bili() }, date)
  assert.equal(out.facts.discoveryLinked, true)
  assert.equal(out.report.layer1.discoveryLinked, true)
  assert.equal((await loadFacts(date)).discoveryLinked, true)
  assert.equal((await loadReport('daily', date)).layer1.discoveryLinked, true)
  assert.equal(out.llmCalls, 2)
  // A token-free rerun judges nothing: it keeps the stored finding (and its
  // provenance) instead of blanking the card, while bili evidence is still read.
  const local = await generateDaily({ source: source(), cfg: { ...cfg, privacy: 'local-only' }, readBiliDay: async () => bili() }, date)
  assert.equal(local.facts.discoveryLinked, true)
  assert.equal(local.report.layer1.discovery, linked)
})

test('report construction and archived enrichment hide stale linked text but retain ordinary discovery', async () => {
  const facts = await collectDay(source(), date)
  facts.discovery = linked
  facts.discoveryLinked = true
  facts.bili = bili()
  const report = buildDailyReport(facts, [], cfg)
  assert.equal(report.layer1.discovery, linked)
  assert.equal(report.layer1.discoveryLinked, true)
  assert.equal(buildDailyReport({ ...facts, bili: null }, [], cfg).layer1.discovery, null)
  const inactive = await enrichDailyBili(report, date, { readBiliDay: async () => null })
  assert.equal(inactive.layer1.bili, null)
  assert.equal(inactive.layer1.discovery, null)
  assert.equal(report.layer1.discovery, linked, 'no archive mutation')
  const normal = { ...report, layer1: { ...report.layer1, discovery: ordinary, discoveryLinked: false } }
  assert.equal((await enrichDailyBili(normal, date, { readBiliDay: async () => null })).layer1.discovery, ordinary)
})

test.after(() => rmSync(dir, { recursive: true, force: true }))
