/**
 * 成本 / 峰谷 / 缓存命中分析。
 *
 * 输入为 `DayFacts`（见 CONTRACT §2）：`usageEvents` 是按时间排列的用量事件，
 * `totals.tokens` 是当日 token 汇总，`sessions` 用于给最贵轮次补标题。
 * 金额统一保留两位小数，比例保留两位小数（0~1）。
 *
 * @module dsh-daily-report/analyze/cost
 */

import { fmtCny } from '../util.js'

/** 默认价格（人民币 / 每百万 token）。谷时按 `offpeakDiscount` 打折。 */
export const DEFAULT_PRICING = {
  currency: 'CNY',
  inputPerM: 2,
  outputPerM: 3,
  cacheReadPerM: 0.2,
  cacheWritePerM: 2,
  offpeakDiscount: 0.5,
  offpeak: { start: '00:30', end: '08:30' },
}

/** 非负有限数；其它一律按 0。 */
function num(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** 四舍五入到两位小数。 */
function round2(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** `'HH:MM'` → 当天分钟数；非法返回 `fallback`。 */
function parseClock(value, fallback) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value == null ? '' : value))
  if (!match) return fallback
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return fallback
  return hour * 60 + minute
}

/** 谷时折扣（0~1）；缺省用默认价。 */
function discountOf(pricing) {
  const value = Number(pricing && pricing.offpeakDiscount)
  if (!Number.isFinite(value)) return DEFAULT_PRICING.offpeakDiscount
  return Math.min(1, Math.max(0, value))
}

/**
 * 判断某一时刻是否处于谷时区间。区间支持跨午夜（`start > end` 时视为
 * `[start, 24:00) ∪ [00:00, end)`），起止时刻均按本地时间解释。
 * 区间非法或 `start === end` 时返回 `false`。
 *
 * @param {number} atMs 毫秒时间戳（本地时区解释）。
 * @param {typeof DEFAULT_PRICING} [pricing=DEFAULT_PRICING] 价格配置。
 * @returns {boolean}
 */
export function isOffpeak(atMs, pricing = DEFAULT_PRICING) {
  const ms = Number(atMs)
  if (!Number.isFinite(ms)) return false
  const offpeak = pricing && pricing.offpeak
  const start = parseClock(offpeak && offpeak.start, null)
  const end = parseClock(offpeak && offpeak.end, null)
  if (start === null || end === null || start === end) return false

  const d = new Date(ms)
  const minuteOfDay =
    d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 + d.getMilliseconds() / 60000
  if (start < end) return minuteOfDay >= start && minuteOfDay < end
  return minuteOfDay >= start || minuteOfDay < end
}

/**
 * 计算一次用量的费用（元）。谷时按 `pricing.offpeakDiscount` 打折。
 *
 * @param {{ inputTokens?: number, outputTokens?: number, cacheReadTokens?: number, cacheWriteTokens?: number }} usage
 *   用量（token 数）。
 * @param {typeof DEFAULT_PRICING} [pricing=DEFAULT_PRICING] 价格配置。
 * @param {number} [atMs] 用量发生的时刻；给出且处于谷时则打折，缺省按峰时计。
 * @returns {number} 费用（元，未取整）。
 */
export function costOf(usage, pricing = DEFAULT_PRICING, atMs) {
  const u = usage && typeof usage === 'object' ? usage : {}
  const p = pricing && typeof pricing === 'object' ? pricing : DEFAULT_PRICING
  const input = num(u.inputTokens)
  const output = num(u.outputTokens)
  const cacheRead = num(u.cacheReadTokens)
  const cacheWrite = num(u.cacheWriteTokens)
  let cost =
    (input / 1e6) * num(p.inputPerM) +
    (output / 1e6) * num(p.outputPerM) +
    (cacheRead / 1e6) * num(p.cacheReadPerM) +
    (cacheWrite / 1e6) * num(p.cacheWritePerM)
  if (atMs !== undefined && atMs !== null && isOffpeak(atMs, p)) cost *= discountOf(p)
  return cost
}

/** 从 sessions 汇总 token（totals.tokens 缺失时的兜底）。 */
function tokensFromSessions(sessions) {
  const sum = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
  for (const session of sessions) {
    const tokens = session && session.tokens
    if (!tokens || typeof tokens !== 'object') continue
    sum.input += num(tokens.input)
    sum.output += num(tokens.output)
    sum.cacheRead += num(tokens.cacheRead)
    sum.cacheWrite += num(tokens.cacheWrite)
    sum.total += num(tokens.total)
  }
  return sum
}

/**
 * 分析当日成本：总额、缓存命中率、峰时占比、挪到谷时的可省金额、最贵轮次与建议。
 *
 * - `totalCny`：`usageEvents` 的 `costCny` 之和（无事件时退回 `totals.costCny`）；
 * - `cacheHitRate = cacheRead / (input + cacheRead + cacheWrite)`；
 * - `peakShare`：峰时成本 / 总成本（无 `t` 的事件按峰时计）；
 * - `offpeakSavingCny = 峰时成本 × (1 − offpeakDiscount)`；
 * - `priciest`：按 `sessionId + turn` 聚合 `costCny` 取最大，标题从 `facts.sessions` 补；
 * - `tips`：仅在有意义时给（峰时占比≥60% 且可省≥¥0.10；缓存命中率<30% 且当日 token 量大）。
 *
 * 缺失字段按 0 / 空数组处理，不抛错。
 *
 * @param {object} facts `DayFacts`。
 * @param {typeof DEFAULT_PRICING} [pricing=DEFAULT_PRICING] 价格配置。
 * @returns {{ totalCny: number, cacheHitRate: number, peakShare: number, offpeakSavingCny: number, priciest: { sessionId: string, title: string, turn: number, costCny: number } | null, tips: string[] }}
 */
export function analyzeCost(facts, pricing = DEFAULT_PRICING) {
  const f = facts && typeof facts === 'object' ? facts : {}
  const p = pricing && typeof pricing === 'object' ? pricing : DEFAULT_PRICING
  const discount = discountOf(p)
  const events = Array.isArray(f.usageEvents) ? f.usageEvents : []
  const sessions = Array.isArray(f.sessions) ? f.sessions : []

  let eventCost = 0
  let peakCost = 0
  /** @type {Map<string, { sessionId: string, turn: number, costCny: number }>} */
  const byTurn = new Map()

  for (const event of events) {
    if (!event || typeof event !== 'object') continue
    const cost = num(event.costCny)
    eventCost += cost
    const at = Number(event.t)
    const offpeak = Number.isFinite(at) ? isOffpeak(at, p) : false
    if (!offpeak) peakCost += cost
    if (cost <= 0) continue
    const turn = Number.isFinite(Number(event.turn)) ? Number(event.turn) : 0
    const sessionId = typeof event.sessionId === 'string' ? event.sessionId : ''
    const key = sessionId + '#' + turn
    const aggregated = byTurn.get(key)
    if (aggregated) aggregated.costCny += cost
    else byTurn.set(key, { sessionId, turn, costCny: cost })
  }

  const totalsTokens = (f.totals && f.totals.tokens) || {}
  let input = num(totalsTokens.input)
  let cacheRead = num(totalsTokens.cacheRead)
  let cacheWrite = num(totalsTokens.cacheWrite)
  let output = num(totalsTokens.output)
  let totalTokens = num(totalsTokens.total)
  if (input + cacheRead + cacheWrite + output + totalTokens === 0) {
    const fallback = tokensFromSessions(sessions)
    input = fallback.input
    cacheRead = fallback.cacheRead
    cacheWrite = fallback.cacheWrite
    output = fallback.output
    totalTokens = fallback.total
  }
  if (totalTokens === 0) totalTokens = input + output + cacheRead + cacheWrite

  const denom = input + cacheRead + cacheWrite
  const cacheHitRate = denom > 0 ? round2(cacheRead / denom) : 0
  const peakShare = eventCost > 0 ? round2(peakCost / eventCost) : 0
  const offpeakSavingCny = round2(peakCost * (1 - discount))
  const totalCny = eventCost > 0 ? round2(eventCost) : round2(num(f.totals && f.totals.costCny))

  /** @type {{ sessionId: string, turn: number, costCny: number } | null} */
  let bestTurn = null
  for (const aggregated of byTurn.values()) {
    if (!bestTurn || aggregated.costCny > bestTurn.costCny) bestTurn = aggregated
  }
  /** @type {{ sessionId: string, title: string, turn: number, costCny: number } | null} */
  let priciest = null
  if (bestTurn) {
    const session = sessions.find((s) => s && s.id === bestTurn.sessionId)
    priciest = {
      sessionId: bestTurn.sessionId,
      title: session && typeof session.title === 'string' ? session.title : '',
      turn: bestTurn.turn,
      costCny: round2(bestTurn.costCny),
    }
  }

  const tips = []
  const offpeakStart = String((p.offpeak && p.offpeak.start) || DEFAULT_PRICING.offpeak.start)
  const offpeakEnd = String((p.offpeak && p.offpeak.end) || DEFAULT_PRICING.offpeak.end)
  if (peakShare >= 0.6 && offpeakSavingCny >= 0.1) {
    tips.push(
      Math.round(peakShare * 100) +
        '% 用量在高峰期，挪到谷时（' +
        offpeakStart +
        '–' +
        offpeakEnd +
        '）约省 ' +
        fmtCny(offpeakSavingCny),
    )
  }
  if (denom > 0 && cacheHitRate < 0.3 && totalTokens >= 500000) {
    tips.push(
      '缓存命中率仅 ' +
        Math.round(cacheHitRate * 100) +
        '%，长会话尽量复用同一会话可降低成本',
    )
  }

  return { totalCny, cacheHitRate, peakShare, offpeakSavingCny, priciest, tips }
}
