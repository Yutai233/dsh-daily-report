/** Full-fidelity Markdown archive renderer. @module render/markdown */
import { fmtDate, fmtClock, fmtTokens, fmtCny } from '../util.js'

const present = (v) => v !== null && v !== undefined && v !== ''
/** Escape inline Markdown, HTML and control characters without altering data. */
const text = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/([\\`*_{}\[\]#!])/g, '\\$1').replace(/\r?\n|\r/g, ' ')
/** A table cell cannot introduce columns or extra rows. */
const cell = (v) => text(v).replace(/\|/g, '\\|')
const table = (headers, rows) => ['| ' + headers.map(cell).join(' | ') + ' |', '| ' + headers.map(() => '---').join(' | ') + ' |', ...rows.map((r) => '| ' + r.map(cell).join(' | ') + ' |')].join('\n')
const list = (items) => (items || []).map((s) => '- ' + text(s)).join('\n')
const trend = (r) => `${r.trend === 'up' ? '▲' : r.trend === 'down' ? '▼' : '—'}${present(r.delta) ? ' ' + r.delta : ''}`
const tools = [['top', 'Top 工具'], ['latency', '耗时榜'], ['commands', '命令构成'], ['hotFiles', '改动最多'], ['domains', '访问网站'], ['approvals', '审批等待'], ['speed', '输出速度']]

/** Choose a fence longer than any backtick sequence in untrusted content. */
function fenced(value, language = '') {
  const s = String(value)
  const n = Math.max(3, ...(s.match(/`+/g) || []).map((v) => v.length + 1))
  const fence = '`'.repeat(n)
  return `${fence}${language}\n${s}\n${fence}`
}

/**
 * Render all three Report layers as an offline GFM Markdown archive.
 * @param {object} report - Report produced by analyze/report.js.
 * @returns {string} Markdown including tables and raw JSON.
 */
export function renderMarkdown(report) {
  const r = report
  const title = `${r.kind === 'weekly' ? 'DSH 周报' : r.kind === 'monthly' ? 'DSH 月报' : 'DSH 每日简报'} · ${r.label}`
  const out = ['# ' + text(title)]
  const l = r.layer1 || {}
  const overview = []
  if (l.weather) overview.push([l.weather.text, l.weather.tip].filter(present).join(' · '))
  overview.push(...[l.host, l.headline, l.oneLiner].filter(present))
  overview.push(...(l.alerts || []))
  if (l.carryOverCount > 0) overview.push(`明日待续 ${l.carryOverCount} 项`)
  if (overview.length) out.push(overview.map((v) => '> ' + text(v)).join('\n'))
  if (typeof l.discovery === 'string' && l.discovery.trim()) out.push('**每日发现：**' + text(l.discovery))
  if (l.festival) out.push('**' + text(l.festival.badge) + '**　' + text(l.festival.greeting))
  const names = { carryOver: '明日待续', usage: '用量与成本', tools: '工具与产出', blockers: '卡点', health: '作息与健康', weekly: r.kind === 'monthly' ? '本月概览' : '本周概览' }
  for (const [key, name] of Object.entries(names)) {
    const v = r.sections?.[key]
    if (v == null) continue
    out.push('## ' + name)
    if (key === 'usage') {
      out.push(table(['指标', '用量', '变化'], (v.rows || []).map((x) => [x.label, x.value, trend(x)])))
      if (v.baselineDays > 0) out.push(`较近 ${v.baselineDays} 天均值`)
      if (v.spark?.length) out.push(table(['日期', 'tokens'], v.spark.map((p) => [p.date, fmtTokens(p.value)])))
      for (const [k, label] of [['cacheHitRate', '缓存命中率'], ['peakShare', '峰时花费占比'], ['priciest', '最贵一轮']]) if (present(v[k])) out.push(text(`${label}：${v[k]}`))
      if (v.budget) out.push(text(`${v.budget.label}：${v.budget.used} / ${v.budget.limit}${v.budget.over ? '（超出预算）' : ''}`))
      if (v.tips?.length) out.push(list(v.tips))
    }
    if (key === 'tools') {
      const rows = tools.filter(([k]) => present(v[k])).map(([k, label]) => [label, v[k]])
      if (rows.length) out.push(table(['项目', '统计'], rows))
      if (v.deliverables?.length) out.push('### 交付物', list(v.deliverables.map((d) => [d.path, d.description].filter(present).join(' — '))))
    }
    if (key === 'blockers') out.push(list(v.items))
    if (key === 'health') {
      out.push(list(v.lines))
      if (v.rough) out.push('基于 DSH 消息时间粗估')
    }
    if (key === 'carryOver') out.push(list(v.map((x) => [x.kind === 'todo' ? '待办' : '中断', x.text, x.title, x.sessionId ? '会话 ID：' + x.sessionId : null].filter(present).join(' · '))))
    if (key === 'weekly') {
      out.push(table(['日期', '会话', 'tokens', '花费'], (v.days || []).map((d) => [d.date, d.sessions, fmtTokens(d.tokens), fmtCny(d.costCny)])))
      if (present(v.topProjects)) out.push(text(`主要项目：${v.topProjects}`))
      if (v.mainline?.length) out.push(list(v.mainline))
    }
  }
  const a = r.appendix || {}
  out.push('## 附录', '### 逐会话明细', table(['标题', '时间', '统计', '摘要', '目录'], (a.sessions || []).map((x) => [x.title, x.time, x.stats, x.summary, x.cwd])), '### 命令清单')
  if (a.commands?.length) out.push(a.commands.map((c) => fenced(c)).join('\n\n'))
  out.push('### 原始数据', fenced(JSON.stringify(a.raw ?? {}, null, 2), 'json'))
  const modes = { cloud: '云端模型', 'local-only': '仅统计（不出本机）', 'local-model': '本地模型' }
  out.push(text(`由 dsh-daily-report 生成 · ${fmtDate(r.generatedAt)} ${fmtClock(r.generatedAt)} · 摘要模式：${modes[r.summaryMode] || '未指定'}`))
  return out.filter(present).join('\n\n') + '\n'
}
