import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeBili } from '../lib/analyze/bili.js'
import { buildDailyReport } from '../lib/analyze/report.js'
import { renderHtml } from '../lib/render/html.js'
import { renderMarkdown } from '../lib/render/markdown.js'
import { sampleDaily } from './fixtures/sample-report.mjs'

const metric = () => ({ date: '2026-11-13', compressionCount: 3, reclaimedTokens: 123400, inputTokens: 1000000, cachedTokens: 920000, cacheHitRate: .5, netSavedTokens: 450000, status: 'ok', anomalies: [] })
const reportWith = (b) => { const r = structuredClone(sampleDaily); r.layer1.bili = b; return r }

test('bili metrics distinguish reclaimed window from real net savings', () => {
  const b = normalizeBili(metric())
  assert.equal(b.reclaimedTokens, 123400)
  assert.equal(b.netSavedTokens, 450000)
  assert.equal(b.cacheHitRate, .92)
  assert.equal(normalizeBili({ reclaimedTokens: 100 }).netSavedTokens, null)
  assert.equal(normalizeBili({ netSavedTokens: -20 }).netSavedTokens, -20)
  assert.equal(normalizeBili({ netSavedTokens: -20 }).status, 'warning')
})

test('missing/invalid data never becomes fabricated zero or healthy status', () => {
  for (const b of [null, undefined, {}, [], { compressionCount: '2' }, { cacheHitRate: 95 }, { netSavedTokens: NaN }, { reclaimedTokens: -1 }]) assert.equal(normalizeBili(b), null)
  const partial = normalizeBili({ compressionCount: 0, netSavedTokens: null })
  assert.equal(partial.status, 'unknown')
  assert.equal(partial.reclaimedTokens, null)
  assert.equal(partial.cacheHitRate, null)
  assert.equal(normalizeBili({ inputTokens: 10, cachedTokens: 15, reclaimedTokens: 1 }).cacheHitRate, null)
  assert.equal(normalizeBili({ compressionCount: 1, status: 'unknown', anomalies: ['覆盖不足'] }).status, 'unknown')
})

test('benefit card is inside selected spark dropdown and before chart', () => {
  const html = renderHtml(reportWith(metric()))
  const dropdown = html.match(/<details class="spark">([\s\S]*?)<\/details>/)?.[1]
  assert.ok(dropdown)
  assert.ok(dropdown.includes('aria-label="bili 压缩收益卡"'))
  assert.ok(dropdown.indexOf('bili 压缩收益卡') < dropdown.indexOf('<figure>'))
  for (const label of ['压缩次数', '窗口回收量', '缓存命中率', '异常状态']) assert.ok(dropdown.includes(label))
  assert.match(dropdown, /3 次/)
  assert.match(dropdown, /12 万 tokens/)
  assert.match(dropdown, /92.0%/)
  assert.match(dropdown, /未见异常/)
  assert.equal((dropdown.match(/<dt>/g) || []).length, 4)
  assert.doesNotMatch(html, /<script|(?:src|href)="https?:\/\//)
})

test('old reports and absent sources keep the original chart without a benefit card', () => {
  for (const b of [null, undefined, {}]) {
    assert.doesNotMatch(renderHtml(reportWith(b)), /<section class="bili-benefit"/)
    assert.doesNotMatch(renderMarkdown(reportWith(b)), /### bili 压缩收益卡/)
  }
  assert.equal((renderHtml(sampleDaily).match(/<rect /g) || []).length, 7)
})

test('partial values show em dash and uncertain status, not fabricated health', () => {
  const html = renderHtml(reportWith({ compressionCount: 0 }))
  const card = html.match(/<section class="bili-benefit"[\s\S]*?<\/section>/)?.[0]
  assert.match(card, /0 次/)
  assert.match(card, /待确认/)
  assert.match(card, /<dd>—<\/dd>/)
  assert.doesNotMatch(card, /未见异常|0.0%/)
})

test('confirmed active source with no matching history shows pending metrics', () => {
  const pending = { source: 'billion-context', date: '2026-11-13', compressionCount: null, reclaimedTokens: null, inputTokens: null, cachedTokens: null, cacheHitRate: null, netSavedTokens: null, status: 'unknown', anomalies: [], coverage: '部分会话尚无 bili 映射', estimated: true }
  const b = normalizeBili(pending)
  assert.ok(b)
  assert.equal(b.netSavedTokens, null)
  const html = renderHtml(reportWith(pending))
  const card = html.match(/<section class="bili-benefit"[\s\S]*?<\/section>/)?.[0]
  assert.equal((card.match(/<dt>/g) || []).length, 4)
  assert.equal((card.match(/<dd>—<\/dd>/g) || []).length, 3)
  assert.match(card, /待确认/)
  assert.match(card, /部分会话尚无 bili 映射/)
  assert.match(renderMarkdown(reportWith(pending)), /部分会话尚无 bili 映射/)
})

test('bili warnings and coverage are escaped without mutating original data', () => {
  const r = reportWith({ ...metric(), status: 'warning', anomalies: ['<script>x</script>'], coverage: '<img src=x>' })
  const before = structuredClone(r)
  const html = renderHtml(r)
  assert.match(html, /有异常/)
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/)
  assert.doesNotMatch(html, /<script|<img/)
  assert.deepEqual(r, before)
  const md = renderMarkdown(r)
  assert.match(md, /### bili 压缩收益卡/)
  assert.match(md, /\| 缓存命中率 \| 92.0% \|/)
})

test('bili report metadata does not alter existing provider usage totals', () => {
  const facts = { date: '2026-11-13', totals: { sessions: 0, toolCalls: 0, userMessages: 0, tokens: { total: 0, input: 0, output: 0, cacheRead: 0 }, costCny: 0 }, sessions: [], carryOver: [], tools: null }
  const cfg = { health: { enabled: false }, budget: {}, privacy: 'local-only' }
  const before = buildDailyReport(facts, [], cfg)
  const after = buildDailyReport({ ...facts, bili: metric() }, [], cfg)
  assert.deepEqual(after.layer1.bili, normalizeBili(metric()))
  assert.deepEqual(after.sections, before.sections)
  assert.equal(after.layer1.headline, before.layer1.headline)
  assert.equal(after.layer1.usage, before.layer1.usage)
})
