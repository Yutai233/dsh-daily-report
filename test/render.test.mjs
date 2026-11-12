/** Renderer regression tests and deterministic visual-review HTML output. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { renderHtml } from '../lib/render/html.js'
import { renderMarkdown } from '../lib/render/markdown.js'
import { sampleDaily, sampleWeekly, sampleEmpty } from './fixtures/sample-report.mjs'

for (const [name, report] of Object.entries({ daily: sampleDaily, weekly: sampleWeekly, empty: sampleEmpty })) {
  test(`${name}: standalone HTML without scripts or remote resources`, () => {
    const html = renderHtml(report)
    assert.match(html, /^<!doctype html>/i)
    assert.match(html, /<style>/)
    assert.doesNotMatch(html, /<script/i)
    assert.doesNotMatch(html, /(?:src|href)\s*=\s*["']?https?:/i)
    assert.doesNotMatch(html, /url\(\s*["']?https?:/i)
    assert.doesNotMatch(html, /@import/i)
    assert.match(html, /prefers-color-scheme:light/)
  })
}

test('redaction hides private fields, retains raw host/idle and never mutates input', () => {
  const before = structuredClone(sampleDaily)
  const html = renderHtml(sampleDaily, { redact: true })
  for (const secret of [sampleDaily.appendix.sessions[0].cwd, sampleDaily.sections.tools.hotFiles, 'E:\\work\\demo\\src\\index.js', sampleDaily.sections.tools.deliverables[0].path, sampleDaily.sections.tools.domains, ...sampleDaily.appendix.commands]) assert.ok(!html.includes(secret), secret)
  assert.match(html, /已脱敏/)
  assert.match(html, /\*\*\*/)
  assert.match(html, /onlineMs/)
  assert.match(html, /sedentaryCount/)
  assert.deepEqual(sampleDaily, before)
  const custom = structuredClone(sampleDaily)
  custom.appendix.raw.extra = { cwd: 'Z:\\private\\repo', nested: ['src/private.js', '/home/private/file'], 'C:\\secret\\file': 'secret' }
  const safe = renderHtml(custom, { redact: true })
  assert.ok(!safe.includes('private'))
  assert.ok(!safe.includes('secret'))
})

test('empty report omits every section, optional row and alert chip', () => {
  const html = renderHtml(sampleEmpty)
  assert.ok(!html.includes('<details class="sec"'))
  assert.doesNotMatch(html, /class="chips"|明日待续 0 项|class="one-liner"/)
  assert.match(html, /<details class="appendix"><summary>附录/)
})

test('daily HTML escapes all report-controlled content and opens only mainline/carryOver', () => {
  const report = structuredClone(sampleDaily)
  report.layer1.oneLiner = '<script>alert("x")</script>'
  report.sections.mainline[0].title = '<img src="https://evil.invalid/x">'
  const html = renderHtml(report)
  assert.doesNotMatch(html, /<script|<img/i)
  assert.match(html, /&lt;script&gt;/)
  assert.match(html, /class="sec" open><summary>今日主线/)
  assert.match(html, /class="sec" open><summary>明日待续/)
  assert.match(html, /class="sec"><summary>用量与成本/)
  assert.match(html, /▲ \+23%/)
  assert.match(html, /▼ -12%/)
  assert.match(html, /较近 6 天均值/)
  assert.match(html, /基于 DSH 消息时间粗估/)
  assert.match(html, /摘要模式：仅统计（不出本机）/)
  assert.equal((html.match(/<rect /g) || []).length, 7)
})

test('weekly and monthly render nullable statistics and period chart correctly', () => {
  const html = renderHtml(sampleWeekly)
  assert.match(html, /DSH 周报/)
  assert.match(html, /本周概览/)
  assert.match(html, /每天会话数/)
  assert.doesNotMatch(html, /缓存命中率|峰时花费占比|耗时榜/)
  const monthly = { ...sampleWeekly, kind: 'monthly', summaryMode: 'local-model' }
  assert.match(renderHtml(monthly), /本月概览/)
  assert.match(renderHtml(monthly), /DSH 月报/)
  assert.match(renderHtml(monthly), /摘要模式：本地模型/)
  assert.match(renderMarkdown(monthly), /## 本月概览/)
  const noBaseline = structuredClone(sampleDaily)
  noBaseline.sections.usage.baselineDays = 0
  noBaseline.sections.usage.budget.over = true
  noBaseline.sections.usage.budget.ratio = 1.2
  assert.doesNotMatch(renderHtml(noBaseline), /较近 0 天均值/)
  assert.match(renderHtml(noBaseline), /class="fill over"/)
})

test('Markdown has all three layers, escaped table cells and JSON appendix', () => {
  const md = renderMarkdown(sampleDaily)
  for (const name of ['今日主线', '用量与成本', '工具与产出', '卡点', '作息与健康', '明日待续', '附录']) assert.ok(md.includes('## ' + name), name)
  assert.match(md, /^# DSH 每日简报 · /)
  assert.match(md, /^> /m)
  assert.match(md, /\| 指标 \| 用量 \| 变化 \|/)
  assert.match(md, /\| 标题 \| 时间 \| 统计 \| 摘要 \| 目录 \|/)
  assert.match(md, /每日简报 \\\| 设计/)
  assert.match(md, /设计报告结构 完成初稿。/)
  assert.match(md, /### 逐会话明细/)
  assert.match(md, /### 命令清单/)
  assert.match(md, /### 原始数据\n\n```json/)
  const weekly = renderMarkdown(sampleWeekly)
  assert.match(weekly, /^# DSH 周报 · /)
  assert.match(weekly, /## 本周概览/)
  assert.match(weekly, /\| 日期 \| 会话 \| tokens \| 花费 \|/)
  assert.doesNotMatch(renderMarkdown(sampleEmpty), /## 今日主线|## 用量与成本/)
})

test('raw JSON fencing cannot be closed by untrusted report strings', () => {
  const r = structuredClone(sampleDaily)
  r.appendix.raw.note = '```json malicious'
  assert.match(renderMarkdown(r), /````json/)
})

test('write daily and weekly standalone HTML previews', async () => {
  const out = new URL('./out/', import.meta.url)
  await mkdir(out, { recursive: true })
  await writeFile(new URL('sample-daily.html', out), renderHtml(sampleDaily), 'utf8')
  await writeFile(new URL('sample-weekly.html', out), renderHtml(sampleWeekly), 'utf8')
})
