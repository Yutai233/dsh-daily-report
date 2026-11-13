/**
 * DayFacts → Report (CONTRACT §4). Numbers are computed here; the model only
 * ever wrote the summary sentences. Sections that carry no news are `null`
 * so renderers omit them ("only write what changed").
 * @module dsh-daily-report/analyze/report
 */

import path from 'node:path'
import { fmtClock, fmtDur, fmtTokens, fmtCny, fmtDate, parseDate, weekdayZh, addDays, truncate, isoWeek } from '../util.js'
import { analyzeCost } from './cost.js'
import { analyzeHealth } from './health.js'

const WEATHER_GLYPH = { sun: '☀', cloud: '☁', fog: '🌫', drizzle: '🌦', rain: '🌧', snow: '❄', storm: '⛈' }

/** Percentage change vs. a baseline; `null` when the baseline is unusable. */
export function delta(value, baseline) {
  if (!Number.isFinite(baseline) || baseline <= 0 || !Number.isFinite(value)) return null
  const pct = Math.round(((value - baseline) / baseline) * 100)
  return { text: (pct > 0 ? '+' : '') + pct + '%', trend: pct >= 5 ? 'up' : pct <= -5 ? 'down' : 'flat' }
}

function mean(nums) {
  const xs = nums.filter((x) => Number.isFinite(x))
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}

function msLabel(ms) {
  if (ms === null || ms === undefined) return '—'
  return ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + 's'
}

function dateLabel(dateStr) {
  const d = new Date(parseDate(dateStr))
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + weekdayZh(dateStr)
}

/**
 * Build the daily Report.
 * @param {object} facts - today's DayFacts (summaries attached).
 * @param {object[]} history - previous DayFacts (any order, up to 7+ days), may be empty.
 * @param {object} cfg - plugin config.
 * @param {object} [extra] - `{ oneLiner, discovery, summaryMode }`.
 * @returns {object} Report.
 */
export function buildDailyReport(facts, history, cfg, extra = {}) {
  const t = facts.totals
  const prev = (history || []).filter((h) => h && h.date < facts.date).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-7)
  const activePrev = prev.filter((h) => h.totals && h.totals.sessions > 0)
  const cost = analyzeCost(facts, cfg.pricing)
  const health = cfg.health && cfg.health.enabled
    ? analyzeHealth(facts, { enabled: true, sitLimitMin: cfg.health.sitLimitMin, lateHour: cfg.health.lateHour, lunch: true, inputSampling: cfg.inputSampling })
    : null

  // Day-over-day token change for the morning card's compact usage line (▲/▼ as in the report).
  const yesterday = prev.find((h) => h.date === addDays(facts.date, -1))
  const yTok = yesterday && yesterday.totals ? delta(t.tokens.total, yesterday.totals.tokens.total) : null

  // ---- layer 1
  let weather = null
  if (facts.weather) {
    const w = facts.weather
    weather = {
      date: w.date || facts.date,
      label: '天气 ' + (w.date || facts.date).slice(5),
      text: '天气 ' + (w.date || facts.date).slice(5) + ' · ' + (WEATHER_GLYPH[w.icon] || '') + ' ' + w.tMin + '~' + w.tMax + '°C ' + w.text + (w.location ? ' · ' + w.location : ''),
      tip: (w.tips && w.tips[0]) || null,
    }
  }
  let host = null
  if (facts.host && facts.host.firstStart) {
    const { start } = { start: parseDate(facts.date) }
    const first = Math.max(facts.host.firstStart, start)
    const boots = facts.host.boots || []
    const last = boots.length ? boots[boots.length - 1] : null
    host = 'dsh ' + fmtClock(first) + ' 启动，在线 ' + fmtDur(facts.host.onlineMs)
    if (last && last.endKind !== 'running' && last.end) host += '，' + fmtClock(last.end) + ' 最后在线'
    if (boots.length > 1) host += '（启动 ' + boots.length + ' 次）'
  }
  const headline = t.sessions
    ? t.sessions + ' 个会话 · ' + t.toolCalls + ' 次工具 · ' + fmtTokens(t.tokens.total) + ' tokens（约 ' + fmtCny(cost.totalCny) + '）'
    : '这一天没有 DSH 会话'
  const alerts = []
  if (health && health.alerts) alerts.push(...health.alerts.slice(0, 2))
  const budget = budgetRow(facts, cost, cfg)
  if (budget && budget.over) alerts.push('超出' + budget.label + '（' + budget.used + ' / ' + budget.limit + '）')

  // ---- usage with 7-day comparison
  let usage = null
  if (t.sessions) {
    const avg = (fn) => mean(activePrev.map(fn))
    const rows = [
      { label: 'Tokens', value: fmtTokens(t.tokens.total), d: delta(t.tokens.total, avg((h) => h.totals.tokens.total)) },
      { label: '估算花费', value: fmtCny(cost.totalCny), d: delta(cost.totalCny, avg((h) => h.totals.costCny)) },
      { label: '会话', value: String(t.sessions), d: delta(t.sessions, avg((h) => h.totals.sessions)) },
      { label: '工具调用', value: String(t.toolCalls), d: delta(t.toolCalls, avg((h) => h.totals.toolCalls)) },
      { label: '你的消息', value: String(t.userMessages), d: delta(t.userMessages, avg((h) => h.totals.userMessages)) },
    ].map((r) => ({ label: r.label, value: r.value, delta: r.d ? r.d.text : null, trend: r.d ? r.d.trend : null }))
    const spark = []
    for (let i = 6; i >= 1; i--) {
      const ds = addDays(facts.date, -i)
      const h = prev.find((x) => x.date === ds)
      spark.push({ date: ds.slice(5), value: h ? h.totals.tokens.total : 0 })
    }
    spark.push({ date: facts.date.slice(5), value: t.tokens.total })
    usage = {
      rows,
      baselineDays: activePrev.length,
      cacheHitRate: Math.round(cost.cacheHitRate * 100) + '%',
      peakShare: Math.round(cost.peakShare * 100) + '%',
      tips: cost.tips || [],
      priciest: cost.priciest ? truncate(cost.priciest.title || '未命名会话', 24) + ' 第 ' + cost.priciest.turn + ' 轮 ' + fmtCny(cost.priciest.costCny) : null,
      budget,
      spark,
    }
  }

  // ---- tools & output
  let tools = null
  const tt = facts.tools
  if (tt && tt.top.length) {
    const slow = tt.top.filter((x) => x.p90Ms !== null && x.count >= 3).sort((a, b) => b.p90Ms - a.p90Ms).slice(0, 3)
    const cmd = Object.entries(tt.commands || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
    const deliverables = facts.sessions.flatMap((s) => s.deliverables || [])
    tools = {
      top: tt.top.slice(0, 6).map((x) => x.name + '×' + x.count).join('  '),
      latency: slow.length ? slow.map((x) => x.name + ' p50 ' + msLabel(x.p50Ms) + ' / p90 ' + msLabel(x.p90Ms)).join(' · ') : null,
      commands: cmd.length ? cmd.map(([k, n]) => k + ' ' + n).join(' · ') : null,
      hotFiles: tt.hotFiles.length ? tt.hotFiles.slice(0, 5).map((f) => f.path + ' ×' + f.count).join(' · ') : null,
      domains: tt.domains.length ? tt.domains.slice(0, 6).map((d) => d.domain + ' ×' + d.count).join(' · ') : null,
      approvals: tt.approvals && tt.approvals.count ? tt.approvals.count + ' 次，合计 ' + fmtDur(tt.approvals.waitMs) : null,
      speed: tt.speed && tt.speed.outputTokPerSec ? Math.round(tt.speed.outputTokPerSec) + ' tok/s' + (tt.speed.ttftMsP50 ? ' · 首字 ' + msLabel(tt.speed.ttftMsP50) : '') : null,
      deliverables: deliverables.slice(0, 12),
    }
  }

  // ---- blockers (only when something went wrong)
  const blockers = []
  for (const f of (tt && tt.failures) || []) {
    if (blockers.length >= 6) break
    blockers.push(f.name + ' 失败 ' + f.count + ' 次（' + truncate(f.detail, 60) + '）')
  }
  const jobFails = facts.sessions.flatMap((s) => (s.failures || []).filter((f) => f.kind === 'job'))
  if (jobFails.length) blockers.push('命令失败 ' + jobFails.length + ' 次' + (jobFails[0] ? '（如 ' + truncate(jobFails[0].name, 40) + '：' + jobFails[0].detail + '）' : ''))
  if (t.retries) blockers.push('LLM 重试 ' + t.retries + ' 次（' + Object.entries(t.retryCodes).map(([k, n]) => k + '×' + n).join('、') + '）')
  const interrupted = (t.turnEnds && t.turnEnds.interrupted) || 0
  const errored = (t.turnEnds && t.turnEnds.error) || 0
  if (interrupted) blockers.push(interrupted + ' 轮被中断')
  if (errored) blockers.push(errored + ' 轮以错误结束')
  for (const f of (tt && tt.hotFiles) || []) {
    if (f.count >= 6) blockers.push(path.basename(f.path) + ' 改了 ' + f.count + ' 次，可能在反复折腾，值得复盘')
  }
  if (facts.rework && facts.rework.count >= 2 && facts.rework.ratio >= 0.2) {
    blockers.push('约 ' + Math.round(facts.rework.ratio * 100) + '% 的消息在纠正方向（仅供参考）')
  }

  // ---- carry-over
  const carry = (facts.carryOver || []).slice(0, 12)
  const discovery = extra.discovery !== undefined ? extra.discovery : facts.discovery

  const sections = {
    mainline: null,
    usage,
    tools,
    blockers: blockers.length ? { items: blockers } : null,
    health: health && health.lines && health.lines.length ? { rough: health.rough, lines: health.lines } : null,
    carryOver: carry.length ? carry.map((c) => ({ sessionId: c.sessionId, text: c.text, title: c.title, kind: c.kind })) : null,
    weekly: null,
  }

  return {
    kind: 'daily',
    label: dateLabel(facts.date),
    range: { start: facts.date, end: facts.date },
    generatedAt: Date.now(),
    language: 'zh',
    summaryMode: extra.summaryMode || cfg.privacy,
    layer1: {
      weather,
      host,
      headline,
      // Structured form of `headline` so the card can show only tokens+cost and style the ▲▼.
      usage: t.sessions
        ? { sessions: t.sessions, toolCalls: t.toolCalls, tokens: fmtTokens(t.tokens.total), cost: fmtCny(cost.totalCny), trend: yTok ? yTok.trend : null, delta: yTok ? yTok.text : null }
        : null,
      oneLiner: extra.oneLiner || null,
      discovery: typeof discovery === 'string' ? discovery || null : null,
      alerts,
      carryOverCount: carry.length,
    },
    sections,
    appendix: {
      sessions: facts.sessions.map((s) => ({
        title: s.title || '未命名会话',
        time: s.firstActive ? fmtClock(s.firstActive) + '–' + fmtClock(s.lastActive) : '',
        stats: '消息 ' + s.userMessages + ' · 工具 ' + s.toolCalls + ' · tokens ' + fmtTokens(s.tokens.total) + ' · ' + fmtCny(s.costCny),
        summary: s.summary || '',
        cwd: s.cwd || '',
      })),
      commands: (facts.commandLabels || []).slice(0, 50),
      raw: { totals: t, commands: tt ? tt.commands : null, rework: facts.rework, host: facts.host, idle: facts.idle ? { activeMs: facts.idle.activeMs, sedentaryCount: facts.idle.sedentaryCount } : null },
    },
  }
}

function budgetRow(facts, cost, cfg) {
  const b = cfg.budget || {}
  if (b.dailyCny > 0) {
    const ratio = cost.totalCny / b.dailyCny
    return { label: '每日预算', used: fmtCny(cost.totalCny), limit: fmtCny(b.dailyCny), ratio: Math.round(ratio * 100) / 100, over: ratio > 1 }
  }
  if (b.dailyTokens > 0) {
    const ratio = facts.totals.tokens.total / b.dailyTokens
    return { label: '每日 token 预算', used: fmtTokens(facts.totals.tokens.total), limit: fmtTokens(b.dailyTokens), ratio: Math.round(ratio * 100) / 100, over: ratio > 1 }
  }
  return null
}

/**
 * Aggregate several DayFacts into a weekly or monthly Report.
 * @param {'weekly'|'monthly'} kind
 * @param {{start:string,end:string}} range - inclusive dates.
 * @param {object[]} days - DayFacts inside the range (missing days allowed).
 * @param {object[]} prevDays - DayFacts of the previous period (for ▲▼).
 * @param {object} cfg
 * @returns {object} Report.
 */
export function buildPeriodReport(kind, range, days, prevDays, cfg) {
  const inRange = (days || []).filter((d) => d && d.date >= range.start && d.date <= range.end).sort((a, b) => (a.date < b.date ? -1 : 1))
  const sum = (arr, fn) => arr.reduce((a, d) => a + (fn(d) || 0), 0)
  const tokens = sum(inRange, (d) => d.totals.tokens.total)
  const costCny = sum(inRange, (d) => d.totals.costCny)
  const sessions = sum(inRange, (d) => d.totals.sessions)
  const toolCalls = sum(inRange, (d) => d.totals.toolCalls)
  const userMessages = sum(inRange, (d) => d.totals.userMessages)
  const activeDays = inRange.filter((d) => d.totals.sessions > 0)
  const pTokens = sum(prevDays || [], (d) => d.totals.tokens.total)
  const pCost = sum(prevDays || [], (d) => d.totals.costCny)
  const pSessions = sum(prevDays || [], (d) => d.totals.sessions)

  // Day table spanning every date in range.
  const table = []
  for (let ds = range.start; ds <= range.end; ds = addDays(ds, 1)) {
    const d = inRange.find((x) => x.date === ds)
    table.push({ date: ds.slice(5), sessions: d ? d.totals.sessions : 0, tokens: d ? d.totals.tokens.total : 0, costCny: d ? Math.round(d.totals.costCny * 100) / 100 : 0 })
  }
  // Projects by workspace activity.
  const ws = {}
  for (const d of inRange) for (const s of d.sessions) { const k = s.workspace || '（未知）'; ws[k] = (ws[k] || 0) + s.userMessages * 5 + s.toolCalls }
  const topProjects = Object.entries(ws).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k).join(' · ')
  // Mainline: the most substantial session of each active day.
  const mainline = activeDays.map((d) => {
    const s = d.sessions.slice().sort((a, b) => (b.toolCalls + b.userMessages * 5) - (a.toolCalls + a.userMessages * 5))[0]
    return d.date.slice(5) + ' ' + weekdayZh(d.date) + '：' + (s.summary || s.title || '')
  })
  const tool = {}
  for (const d of inRange) for (const x of (d.tools && d.tools.top) || []) tool[x.name] = (tool[x.name] || 0) + x.count
  const files = {}
  for (const d of inRange) for (const f of (d.tools && d.tools.hotFiles) || []) files[f.path] = (files[f.path] || 0) + f.count
  const late = inRange.filter((d) => d.activity && d.activity.lastActive && (new Date(d.activity.lastActive).getHours() >= (cfg.health ? cfg.health.lateHour : 23) || new Date(d.activity.lastActive).getHours() < 5)).length
  const weekend = inRange.filter((d) => d.totals.sessions > 0 && [0, 6].includes(new Date(parseDate(d.date)).getDay())).length
  const carry = inRange.length ? (inRange[inRange.length - 1].carryOver || []) : []

  const dTok = delta(tokens, pTokens)
  const dCost = delta(costCny, pCost)
  const dSes = delta(sessions, pSessions)
  const blockers = []
  const fails = sum(inRange, (d) => (d.tools ? d.tools.failures.reduce((a, f) => a + f.count, 0) : 0))
  const retries = sum(inRange, (d) => d.totals.retries)
  if (fails) blockers.push('工具失败共 ' + fails + ' 次')
  if (retries) blockers.push('LLM 重试共 ' + retries + ' 次')
  const health = []
  if (late) health.push('有 ' + late + ' 天在 ' + (cfg.health ? cfg.health.lateHour : 23) + ':00 后还在工作')
  if (weekend) health.push('周末工作了 ' + weekend + ' 天')
  const sitDays = inRange.filter((d) => d.idle && d.idle.sedentaryCount > 0)
  if (sitDays.length) health.push('有 ' + sitDays.length + ' 天出现超过 ' + (cfg.health ? cfg.health.sitLimitMin : 50) + ' 分钟的连续用机')

  const label = kind === 'weekly'
    ? (() => { const w = isoWeek(range.start); return w.year + ' 第' + w.week + '周（' + range.start.slice(5).replace('-', '/') + '–' + range.end.slice(5).replace('-', '/') + '）' })()
    : range.start.slice(0, 4) + '年' + Number(range.start.slice(5, 7)) + '月'
  const oneLiner = topProjects ? '主要投入在 ' + topProjects.split(' · ').slice(0, 3).join('、') + '。' : null

  return {
    kind,
    label,
    range,
    generatedAt: Date.now(),
    language: 'zh',
    summaryMode: cfg.privacy,
    layer1: {
      weather: null,
      host: activeDays.length + ' 天有 DSH 活动' + (inRange.some((d) => d.host) ? '，累计在线 ' + fmtDur(sum(inRange, (d) => (d.host ? d.host.onlineMs : 0))) : ''),
      headline: sessions + ' 个会话 · ' + toolCalls + ' 次工具 · ' + fmtTokens(tokens) + ' tokens（约 ' + fmtCny(costCny) + '）',
      oneLiner,
      alerts: [],
      carryOverCount: carry.length,
    },
    sections: {
      mainline: null,
      usage: sessions ? {
        rows: [
          { label: 'Tokens', value: fmtTokens(tokens), delta: dTok ? dTok.text : null, trend: dTok ? dTok.trend : null },
          { label: '估算花费', value: fmtCny(costCny), delta: dCost ? dCost.text : null, trend: dCost ? dCost.trend : null },
          { label: '会话', value: String(sessions), delta: dSes ? dSes.text : null, trend: dSes ? dSes.trend : null },
          { label: '工具调用', value: String(toolCalls), delta: null, trend: null },
          { label: '你的消息', value: String(userMessages), delta: null, trend: null },
        ],
        baselineDays: (prevDays || []).length,
        cacheHitRate: null, peakShare: null, tips: [], priciest: null, budget: null,
        spark: table.map((r) => ({ date: r.date, value: r.tokens })),
      } : null,
      tools: Object.keys(tool).length ? {
        top: Object.entries(tool).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => k + '×' + n).join('  '),
        latency: null, commands: null,
        hotFiles: Object.keys(files).length ? Object.entries(files).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => k + ' ×' + n).join(' · ') : null,
        domains: null, approvals: null, speed: null, deliverables: [],
      } : null,
      blockers: blockers.length ? { items: blockers } : null,
      health: health.length ? { rough: !inRange.some((d) => d.idle), lines: health } : null,
      carryOver: carry.length ? carry.slice(0, 12).map((c) => ({ sessionId: c.sessionId, text: c.text, title: c.title, kind: c.kind })) : null,
      weekly: { days: table, topProjects, mainline },
    },
    appendix: {
      sessions: inRange.flatMap((d) => d.sessions.map((s) => ({
        title: s.title || '未命名会话',
        time: d.date.slice(5) + ' ' + (s.firstActive ? fmtClock(s.firstActive) : ''),
        stats: '消息 ' + s.userMessages + ' · 工具 ' + s.toolCalls + ' · tokens ' + fmtTokens(s.tokens.total),
        summary: s.summary || '',
        cwd: s.cwd || '',
      }))).slice(0, 200),
      commands: [],
      raw: { days: inRange.length, activeDays: activeDays.length, tokens, costCny, sessions },
    },
  }
}

/** Monday..Sunday range of the ISO week before the week containing `dateStr`. */
export function previousWeekRange(dateStr) {
  const w = isoWeek(dateStr)
  const start = addDays(w.start, -7)
  return { start, end: addDays(start, 6), key: isoWeek(start).key }
}

/** First..last day of the month before the month containing `dateStr`. */
export function previousMonthRange(dateStr) {
  const d = new Date(parseDate(dateStr))
  const first = new Date(d.getFullYear(), d.getMonth() - 1, 1)
  const last = new Date(d.getFullYear(), d.getMonth(), 0)
  const start = fmtDate(first.getTime())
  return { start, end: fmtDate(last.getTime()), key: start.slice(0, 7) }
}
