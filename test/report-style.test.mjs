/** DSH theme, overview and native disclosure motion regression checks. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { renderHtml } from '../lib/render/html.js'
import { sampleDaily, sampleWeekly, sampleEmpty } from './fixtures/sample-report.mjs'

test('report consumes DSH font and semantic aliases without redefining host tokens', () => {
  const html = renderHtml(sampleDaily)
  assert.match(html, /font-family:var\(--dsw-font-family,/)
  assert.match(html, /var\(--dsw-alias-brand-primary-new-colorprimary-new-color,#5686fe\)/)
  assert.match(html, /var\(--dsw-alias-brand-primary-new-colorprimary-new-color,#4176e6\)/)
  assert.doesNotMatch(html, /--dsw-[\w-]+\s*:/)
  assert.doesNotMatch(html, /var\(--dsw-alias-brand-primary[,)]/)
  for (const token of ['bg-base', 'bg-layer-1', 'bg-layer-2', 'bg-layer-3', 'bg-module-platform', 'label-primary', 'label-secondary', 'label-tertiary', 'border-l1', 'border-l2', 'border-l3']) assert.ok(html.includes(`var(--dsw-alias-${token},`), token)
})

test('overview exposes escaped KPI and exactly one usage chart before folded content', () => {
  const r = structuredClone(sampleDaily)
  r.sections.usage.rows[0].label = '<img src=x onerror=alert(1)>'
  r.sections.usage.rows[0].value = '<script>bad()</script>'
  const html = renderHtml(r)
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'))
  assert.match(header, /阅读深度/)
  assert.match(header, /关键指标速览/)
  assert.match(header, /aria-label="每日 tokens"/)
  assert.match(header, /&lt;img/)
  assert.doesNotMatch(html, /<img|<script/i)
  assert.equal((html.match(/aria-label="每日 tokens"/g) || []).length, 1)
  assert.match(header, /<details class="spark"><summary><span>每日 tokens<\/span>/)
  assert.doesNotMatch(header, /<details[^>]* open>/, 'the tokens chart must be folded by default')
  assert.equal((html.match(/<details[^>]* open>/g) || []).length, 2)
})

test('only native disclosure height and its chevron may transition', () => {
  const html = renderHtml(sampleDaily)
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1]
  assert.doesNotMatch(css, /@keyframes|animation-delay|animation\s*:(?!none)|translate|scale\(|:hover|linear-gradient|opacity\s*:/)
  assert.doesNotMatch(html, /ACTIVITY REPORT|eyebrow::before|<script|\bon\w+=/i)
  assert.match(css, /@supports \(interpolate-size:allow-keywords\) and selector\(details::details-content\)/)
  assert.match(css, /details::details-content\{block-size:0;overflow:clip;transition:block-size \.22s ease,content-visibility \.22s allow-discrete\}/)
  assert.match(css, /details\[open\]::details-content\{block-size:auto\}/)
  const transitions = [...css.matchAll(/transition:([^}]+)/g)].map(x => x[1])
  assert.deepEqual(transitions, ['transform .22s ease', 'block-size .22s ease,content-visibility .22s allow-discrete', 'none!important'])
  assert.match(css, /prefers-reduced-motion:reduce\)\{html\{scroll-behavior:auto\}\*,\*::before,\*::after,details::details-content\{animation:none!important;transition:none!important\}/)
  assert.match(css, /summary:focus-visible/)
  assert.match(css, /details\[open\]>summary::after\{transform:rotate\(45deg\)\}/)
})

test('all periods and empty reports retain their semantic content and disclosure defaults', () => {
  for (const r of [sampleDaily, sampleWeekly, { ...sampleWeekly, kind: 'monthly' }, sampleEmpty]) {
    const html = renderHtml(r)
    assert.doesNotMatch(html, /eyebrow|DSH 活动报告|ACTIVITY REPORT/);
    assert.match(html, /阅读深度/)
    assert.match(html, /附录（逐会话明细/)
    assert.match(html, /@media\(max-width:480px\)/)
    assert.doesNotMatch(html, /<script|@import|(?:src|href)="https?:/i)
    assert.equal((html.match(/class="section-content"/g) || []).length, (html.match(/<details/g) || []).length)
    const openNames = [...html.matchAll(/<details[^>]* open><summary>([^<]+)/g)].map(x => x[1])
    assert.deepEqual(openNames, ['carryOver', 'mainline'].filter(k => r.sections?.[k] != null).map(k => k === 'mainline' ? '今日主线' : '明日待续'))
  }
})
