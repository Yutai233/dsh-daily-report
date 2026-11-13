/** Standalone, dependency-free HTML report renderer. @module render/html */
import { escapeHtml, fmtDate, fmtClock, fmtTokens, fmtCny } from '../util.js'
import { festivalStyle } from '../collect/festival.js'

const e = escapeHtml
const present = (v) => v !== null && v !== undefined && v !== ''
const modes = { cloud: '云端模型', 'local-only': '仅统计（不出本机）', 'local-model': '本地模型' }
const toolRows = [['top', 'Top 工具'], ['latency', '耗时榜'], ['commands', '命令构成'], ['hotFiles', '改动最多'], ['domains', '访问网站'], ['approvals', '审批等待'], ['speed', '输出速度']]
const css = `
:root{color-scheme:dark;--bg:var(--dsw-alias-bg-base,#151517);--card:var(--dsw-alias-bg-layer-1,#202124);--inner:var(--dsw-alias-bg-layer-2,#292b30);--raised:var(--dsw-alias-bg-layer-3,#32353b);--platform:var(--dsw-alias-bg-module-platform,#191a1d);--border:var(--dsw-alias-border-l1,#ffffff14);--border-strong:var(--dsw-alias-border-l2,#ffffff24);--border-soft:var(--dsw-alias-border-l3,#ffffff0c);--text:var(--dsw-alias-label-primary,#f1f2f5);--muted:var(--dsw-alias-label-secondary,#a9adb7);--tertiary:var(--dsw-alias-label-tertiary,#818692);--blue:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#5686fe);--warn:#e6a052;--ok:#66b998;--error:#eb7777;--bar:color-mix(in srgb,var(--blue) 28%,var(--inner))}
*{box-sizing:border-box}html{scroll-behavior:auto}body{margin:0;background:var(--bg);color:var(--text);font-family:var(--dsw-font-family,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",system-ui,sans-serif);font-size:14px;line-height:1.7;-webkit-font-smoothing:antialiased}main{max-width:800px;margin:0 auto;padding:28px 28px 22px;min-width:0}h1,h2,h3{color:var(--blue);font-weight:650;letter-spacing:-.025em}h1{font-size:26px;line-height:1.4;margin:12px 0 18px}h2,h3{font-size:14px;margin:22px 0 10px}p{margin:8px 0}.card,details{background:var(--card);border:1px solid var(--border);border-radius:18px;margin:12px 0;padding:20px 22px;min-width:0}.hero{overflow:hidden;padding:26px 26px 20px}.muted,small,time,footer{color:var(--muted);font-size:12px}.weather,.headline{color:var(--muted);font-size:12px}.one-liner{font-size:22px;font-weight:600;line-height:1.65;letter-spacing:-.02em;margin:16px 0 18px;max-width:34em}.reading-guide{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;color:var(--tertiary);font-size:11px;margin-top:20px;padding-top:14px;border-top:1px solid var(--border)}.reading-guide b{color:var(--muted);font-weight:500}.reading-guide span{white-space:nowrap}.chips{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}.chip{color:var(--warn);background:color-mix(in srgb,var(--warn) 10%,transparent);border:1px solid color-mix(in srgb,var(--warn) 20%,transparent);padding:3px 10px;border-radius:8px;font-size:12px}.carry{color:var(--muted);font-size:12px}.overview{margin:20px 0 0}.overview .grid{display:flex;flex-wrap:wrap;gap:10px 22px}.overview .metric{display:flex;align-items:baseline;gap:8px;flex:1 1 auto;background:none;padding:0;border:0;border-radius:0;white-space:nowrap}.overview .metric small,.overview .metric strong,.overview .metric span{display:inline}.overview .metric strong{color:var(--blue);font-size:20px}.overview .metric span{font-size:11px}.overview figcaption{display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;font-size:11px;color:var(--muted);margin-top:16px}.overview .chart{margin:2px 0 0;max-height:132px}.overview figure{margin:0}.overview .spark{margin:16px 0 0;padding:0;border:1px solid var(--border);border-radius:14px;background:color-mix(in srgb,var(--card) 55%,transparent)}.overview .spark>summary{display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px 12px;padding:11px 30px 11px 14px;font-size:11px;font-weight:500;color:var(--muted)}.overview .spark>summary span:last-child{color:var(--tertiary)}.overview .spark>summary::after{top:14px;right:12px}.overview .spark .section-content{padding:0 14px 6px}.overview .spark figure{margin:0}.overview .spark .chart{margin:0;max-height:132px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:10px}.metric{background:var(--inner);border:1px solid var(--border-soft);border-radius:12px;padding:14px;min-width:0}.metric strong{display:block;font-size:23px;line-height:1.5;font-variant-numeric:tabular-nums;letter-spacing:-.03em;overflow-wrap:anywhere}.metric span{font-size:11px}.up{color:var(--warn)}.down{color:var(--ok)}summary{cursor:pointer;font-weight:600;font-size:14px;line-height:1.7;color:var(--blue);list-style:none;position:relative;padding-right:28px}summary::-webkit-details-marker{display:none}summary::after{content:"";position:absolute;right:5px;top:8px;width:7px;height:7px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;color:var(--tertiary);transform:rotate(-45deg);transition:transform .22s ease}details[open]>summary::after{transform:rotate(45deg)}.section-content{padding-top:18px}details[open]{border-color:var(--border-strong)}summary:focus-visible{outline:2px solid var(--blue);outline-offset:7px;border-radius:3px}ul{padding-left:20px;margin:10px 0}li{margin:12px 0;overflow-wrap:anywhere}li::marker{color:var(--tertiary)}.mainline{list-style:none;padding:0;margin:0}.mainline>li{position:relative;padding:0 0 18px 23px;margin:0;border-left:1px solid var(--border-strong);margin-left:4px}.mainline>li:last-child{border-color:transparent;padding-bottom:0}.mainline>li::before{content:"";position:absolute;left:-4px;top:9px;width:7px;height:7px;border-radius:50%;background:var(--blue);box-shadow:0 0 0 4px var(--card)}.mainline time{display:block;font-size:10px;font-variant-numeric:tabular-nums;letter-spacing:.03em;margin-bottom:3px}.mainline strong{font-weight:600}.mainline p{color:var(--muted);font-size:13px;margin-top:5px}.scroll{overflow-x:auto;max-width:100%;scrollbar-width:thin}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--border);padding:11px 9px;overflow-wrap:anywhere}th{color:var(--muted);font-weight:500;background:var(--platform)}tbody tr:last-child td,tbody tr:last-child th{border-bottom:0}.kv{table-layout:fixed}.kv th{width:90px;white-space:nowrap}.chart{width:100%;height:auto;display:block;margin:14px 0;overflow:visible}.bar{fill:var(--bar)}.bar.last{fill:var(--blue)}svg text{fill:var(--muted);font-size:10px;font-family:inherit}.budget{margin:18px 0}.track{height:7px;background:var(--raised);border-radius:8px;overflow:hidden}.fill{height:100%;background:var(--blue);border-radius:inherit}.fill.over{background:var(--error)}code,pre{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px}code{background:var(--inner);padding:2px 5px;border-radius:5px;overflow-wrap:anywhere}pre{padding:16px;background:var(--platform);border:1px solid var(--border);border-radius:10px;overflow:auto;max-height:420px;white-space:pre-wrap;overflow-wrap:anywhere}.appendix{background:var(--platform)}.appendix>summary{color:var(--muted);font-size:12px}footer{text-align:center;padding:20px 10px 8px;font-size:10px;line-height:1.9;overflow-wrap:anywhere}@supports (interpolate-size:allow-keywords) and selector(details::details-content){details{interpolate-size:allow-keywords}details::details-content{block-size:0;overflow:clip;transition:block-size .22s ease,content-visibility .22s allow-discrete}details[open]::details-content{block-size:auto}}
.one-liner{overflow-wrap:anywhere}.carry-list{list-style:none;padding:0;margin:0;display:grid;gap:12px}.carry-list li{display:grid;grid-template-columns:32px minmax(0,1fr);gap:10px}.carry-kind{color:var(--tertiary);font-size:12px}.carry-source{display:block;margin-top:2px;color:var(--tertiary);font-size:11px}
.session-link{display:inline-block;margin:0 0 0 8px;padding:1px 7px;border:1px solid var(--border-strong);border-radius:6px;background:transparent;color:var(--blue);font:inherit;font-size:11px;line-height:20px;cursor:pointer;white-space:nowrap;vertical-align:baseline}.session-link:focus-visible{outline:2px solid var(--blue);outline-offset:2px}.discovery{margin:0 0 14px;padding:14px 22px;border-left:2px solid var(--blue);background:var(--card);border-radius:0 12px 12px 0;overflow-wrap:anywhere}.discovery b{color:var(--text);font-weight:600}.discovery p{margin:0;color:var(--muted);font-size:13px}
.festival{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 14px;font-size:13px}.fest{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:6px;font-size:12px;font-weight:600;line-height:20px;white-space:nowrap}.fest-note{color:var(--muted)}
@media (prefers-color-scheme:light){:root{color-scheme:light;--bg:var(--dsw-alias-bg-base,#f6f7f9);--card:var(--dsw-alias-bg-layer-1,#ffffff);--inner:var(--dsw-alias-bg-layer-2,#f4f5f8);--raised:var(--dsw-alias-bg-layer-3,#e9ecf2);--platform:var(--dsw-alias-bg-module-platform,#fafbfc);--border:var(--dsw-alias-border-l1,#e8ebf0);--border-strong:var(--dsw-alias-border-l2,#dbe0e9);--border-soft:var(--dsw-alias-border-l3,#eef0f5);--text:var(--dsw-alias-label-primary,#202531);--muted:var(--dsw-alias-label-secondary,#687184);--tertiary:var(--dsw-alias-label-tertiary,#858d9d);--blue:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#4176e6);--warn:#996018;--ok:#268363;--error:#cc4141}}
@media(max-width:480px){main{padding:12px 12px 18px}.card,details{padding:18px 16px;border-radius:14px;margin:10px 0}h1{font-size:21px;margin:12px 0}.one-liner{font-size:19px}.overview .grid{gap:10px 20px}.overview .metric{padding:0}.overview .metric strong{font-size:18px}.overview .metric small{font-size:12px}.reading-guide{gap:6px 12px}.kv th{width:76px}th,td{padding:9px 6px}.chart text{font-size:11px}.appendix>summary{font-size:11px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after,details::details-content{animation:none!important;transition:none!important}}@media print{body{background:white;color:#202531}main{max-width:none;padding:0}.card,details{break-inside:avoid;border-color:#ddd;box-shadow:none;animation:none}summary::after{display:none}footer{color:#687184}}
`

/** Recursively sanitize raw data while retaining host/idle statistics. */
function redactRaw(value, key = '') {
  if (/^(?:cwd|path|paths|file|files|hotFiles|domains|commands|commandLabels|directory|workspace)$/i.test(key)) return value == null ? value : '***'
  if (Array.isArray(value)) return value.map((v) => redactRaw(v))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => /[\\/]|[a-z]:/i.test(k) ? ['***', '***'] : [k, redactRaw(v, k)]))
  if (typeof value === 'string' && (/[\\/]/.test(value) || /\b[a-z]:/i.test(value) || /\b[\w-]+\.[a-z0-9]{1,8}\b/i.test(value))) return '***'
  return value
}

/** Return a detached copy with private paths, domains and commands removed. */
function redacted(report) {
  const r = JSON.parse(JSON.stringify(report))
  const tools = r.sections?.tools
  if (tools) {
    for (const k of ['hotFiles', 'domains']) if (present(tools[k])) tools[k] = '***'
    for (const d of tools.deliverables || []) d.path = '***'
  }
  if (r.appendix) {
    for (const s of r.appendix.sessions || []) s.cwd = '***'
    r.appendix.commands = (r.appendix.commands || []).map(() => '***')
    r.appendix.raw = redactRaw(r.appendix.raw)
  }
  return r
}

/** Inline SVG histogram; every date is labeled, including zero-value days. */
function chart(points, label) {
  if (!points?.length) return ''
  const width = Math.max(560, points.length * 38)
  const max = Math.max(1, ...points.map((p) => Number(p.value) || 0))
  const step = width / points.length
  const bars = points.map((p, i) => {
    const h = Math.max(0, (Number(p.value) || 0) / max * 95)
    const x = i * step + step * .2
    return `<g><title>${e(p.date)}: ${e(p.value)}</title><rect class="bar${i === points.length - 1 ? ' last' : ''}" x="${e(x)}" y="${e(110 - h)}" width="${e(step * .6)}" height="${e(h)}" rx="3"/><text x="${e(i * step + step / 2)}" y="130" text-anchor="middle">${e(p.date)}</text></g>`
  }).join('')
  return `<svg class="chart" role="img" aria-label="${e(label)}" viewBox="0 0 ${e(width)} 142" xmlns="http://www.w3.org/2000/svg"><title>${e(label)}</title>${bars}</svg>`
}

/** Escaped tabular content in a horizontally scrollable HTML table. */
function table(headers, rows, cls = '') {
  return `<div class="scroll"><table class="${e(cls)}"><thead><tr>${headers.map((h) => `<th scope="col">${e(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${e(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
}
const list = (items) => items?.length ? `<ul>${items.map((x) => `<li>${e(x)}</li>`).join('')}</ul>` : ''
const line = (v, cls = '') => present(v) ? `<p class="${e(cls)}">${e(v)}</p>` : ''
const trend = (r) => `${r.trend === 'up' ? '▲' : r.trend === 'down' ? '▼' : '—'}${present(r.delta) ? ' ' + r.delta : ''}`

/** Render usage cards, comparison, optional ratios and budget. Chart appears in the overview. */
function usage(u) {
  let out = `<div class="grid">${(u.rows || []).map((r) => `<div class="metric"><small>${e(r.label)}</small><strong>${e(r.value)}</strong><span class="${r.trend === 'up' ? 'up' : r.trend === 'down' ? 'down' : 'muted'}">${e(trend(r))}</span></div>`).join('')}</div>`
  if (u.baselineDays > 0) out += line(`较近 ${u.baselineDays} 天均值`, 'muted')
  for (const [key, label] of [['cacheHitRate', '缓存命中率'], ['peakShare', '峰时花费占比'], ['priciest', '最贵一轮']]) if (present(u[key])) out += line(`${label}：${u[key]}`)
  out += list(u.tips)
  if (u.budget) {
    const b = u.budget
    const ratio = Number.isFinite(b.ratio) ? Math.max(0, Math.min(1, b.ratio)) : 0
    out += `<div class="budget">${line(`${b.label}：${b.used} / ${b.limit}`)}<div class="track" role="progressbar" aria-label="${e(b.label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${e(Math.round(ratio * 100))}"><div class="fill${b.over ? ' over' : ''}" style="width:${e(ratio * 100)}%"></div></div></div>`
  }
  return out
}

/** Render a standalone, script-free report with optional private-data redaction. */
export function renderHtml(report, { redact = false, sessionLinks = false } = {}) {
  const r = redact ? redacted(report) : report
  const title = `${r.kind === 'weekly' ? 'DSH 周报' : r.kind === 'monthly' ? 'DSH 月报' : 'DSH 每日简报'} · ${r.label}`
  const l = r.layer1 || {}
  const s = r.sections || {}
  let body = `<header class="card hero"><h1>${e(title)}</h1>`
  if (l.weather) body += line([l.weather.text, l.weather.tip].filter(present).join(' · '), 'weather')
  body += line(l.host, 'muted') + line(l.headline, 'headline') + line(l.oneLiner, 'one-liner')
  if (l.alerts?.length) body += `<div class="chips">${l.alerts.map((a) => `<span class="chip">${e(a)}</span>`).join('')}</div>`
  if (l.carryOverCount > 0) body += line(`明日待续 ${l.carryOverCount} 项`, 'carry')
  if (s.usage) {
    const u = s.usage
    body += `<section class="overview" aria-label="关键指标速览"><div class="grid">${(u.rows || []).slice(0, 3).map((x) => `<div class="metric"><small>${e(x.label)}</small><strong>${e(x.value)}</strong><span class="${x.trend === 'up' ? 'up' : x.trend === 'down' ? 'down' : 'muted'}">${e(trend(x))}</span></div>`).join('')}</div>`
    if (u.spark?.length) body += `<details class="spark"><summary><span>每日 tokens</span><span>最近 ${e(u.spark.length)} 天 · 末日高亮</span></summary><div class="section-content"><figure>${chart(u.spark, '每日 tokens')}</figure></div></details>`
    body += '</section>'
  }
  body += '<nav class="reading-guide" aria-label="阅读深度"><b>阅读深度</b><span>速览 · 摘要与指标</span><span>细读 · 明日待续</span><span>追溯 · 展开章节与附录</span></nav></header>'
  if (typeof l.discovery === 'string' && l.discovery.trim()) body += `<aside class="discovery" aria-label="每日发现"><p><b>每日发现：</b>${e(l.discovery)}</p></aside>`
  if (l.festival) body += `<p class="festival" aria-label="节日彩蛋"><span class="fest" style="${e(festivalStyle(l.festival))}">${e(l.festival.badge)}</span><span class="fest-note">${e(l.festival.greeting)}</span></p>`
  const names = { carryOver: '明日待续', usage: '用量与成本', tools: '工具与产出', blockers: '卡点', health: '作息与健康', weekly: r.kind === 'monthly' ? '本月概览' : '本周概览' }
  for (const [key, name] of Object.entries(names)) {
    const v = s[key]
    if (v == null) continue
    let content = ''
    if (key === 'usage') content = usage(v)
    if (key === 'tools') {
      content = `<table class="kv"><tbody>${toolRows.filter(([k]) => present(v[k])).map(([k, label]) => `<tr><th scope="row">${e(label)}</th><td>${e(v[k])}</td></tr>`).join('')}</tbody></table>`
      if (v.deliverables?.length) content += `<h3>交付物</h3><ul>${v.deliverables.map((d) => `<li><code>${e(d.path)}</code>${present(d.description) ? ' — ' + e(d.description) : ''}</li>`).join('')}</ul>`
    }
    if (key === 'blockers') content = list(v.items)
    if (key === 'health') content = list(v.lines) + (v.rough ? line('基于 DSH 消息时间粗估', 'muted') : '')
    if (key === 'carryOver') content = `<ul class="carry-list">${v.map((x) => `<li><span class="carry-kind">${x.kind === 'todo' ? '待办' : '中断'}</span><div>${e(x.text)}${sessionLinks && !redact && typeof x.sessionId === 'string' && x.sessionId.trim() ? `<button type="button" class="session-link" data-ddr-session="${e(x.sessionId)}" title="${e(x.title ? '打开会话：' + x.title : '打开来源会话')}">相关会话</button>` : ''}${present(x.title) ? `<small class="carry-source">${e(x.title)}</small>` : ''}</div></li>`).join('')}</ul>`
    if (key === 'weekly') content = table(['日期', '会话', 'tokens', '花费'], (v.days || []).map((d) => [d.date, d.sessions, fmtTokens(d.tokens), fmtCny(d.costCny)])) + chart((v.days || []).map((d) => ({ date: d.date, value: d.sessions })), '每天会话数') + (present(v.topProjects) ? line(`主要项目：${v.topProjects}`) : '') + list(v.mainline)
    body += `<details class="sec"${key === 'carryOver' ? ' open' : ''}><summary>${e(name)}</summary><div class="section-content">${content}</div></details>`
  }
  const a = r.appendix || {}
  body += `<details class="appendix"><summary>附录（逐会话明细 / 命令清单 / 原始数据）</summary><div class="section-content"><h3>逐会话明细</h3>${table(['标题', '时间', '统计', '摘要', '目录'], (a.sessions || []).map((x) => [x.title, x.time, x.stats, x.summary, x.cwd]))}<h3>命令清单</h3><ul>${(a.commands || []).map((c) => `<li><code>${e(c)}</code></li>`).join('')}</ul><h3>原始数据</h3><pre>${e(JSON.stringify(a.raw ?? {}, null, 2))}</pre></div></details>`
  body += `<footer>${e(`由 dsh-daily-report 生成 · ${fmtDate(r.generatedAt)} ${fmtClock(r.generatedAt)} · 摘要模式：${modes[r.summaryMode] || '未指定'}`)}${redact ? ' · 已脱敏' : ''}</footer>`
  return `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(title)}</title><style>${css}</style></head><body><main>${body}</main></body></html>`
}