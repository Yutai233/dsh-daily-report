/**
 * 成本 / 峰谷 / 缓存命中分析。
 *
 * 价格与时段口径对齐 DeepSeek 官方价目（2026-09-19 版，与 dsh-whale-widget 一致）：
 *   - 峰时：工作日（周一至周五，不含中国法定节假日）北京时间 09:00–12:00、14:00–18:00；
 *   - 谷时：其余全部时段，包括周末、调休上班的周末、法定节假日全天，
 *     谷价 = 峰价 × `offpeakDiscount`（官方为五折）；
 *   - Flash（deepseek-flash = DeepSeek-V4.1-Flash）峰时价：缓存命中 0.04、未命中 2、输出 8
 *     （元 / 百万 token）；Pro（deepseek-v4-pro）为 Flash 的 3 倍。
 * DeepSeek 不给缓存写单独定价（写缓存按未命中价计），所以价目表里没有这一项。
 *
 * @module dsh-daily-report/analyze/cost
 */

import { fmtCny } from '../util.js'

/** 峰时时段（北京时间，周一至周五；`[start, end)` 小时）。 */
export const PEAK_HOURS = [
  [9, 12],
  [14, 18],
]

/** 峰时说明文案（给建议和设置页复用）。 */
export const PEAK_LABEL = '工作日 09:00–12:00、14:00–18:00'

/** Pro 模型相对 Flash 的价格倍数（官方 2026-08-17 生效）。 */
export const PRO_MULTIPLIER = 3

/** 默认价格（人民币 / 每百万 token，**峰时**）。谷时按 `offpeakDiscount` 打折。 */
export const DEFAULT_PRICING = {
  currency: 'CNY',
  inputPerM: 2, // 未命中输入（含写缓存）
  outputPerM: 8,
  cacheReadPerM: 0.04, // 缓存命中
  offpeakDiscount: 0.5,
}

/**
 * 法定节假日（只列放假日期，北京时间 YYYY-MM-DD）——当天全天按谷价。
 * 依据《国务院办公厅关于 2026 年部分节假日安排的通知》（国办发明电〔2025〕7 号）：
 * 调休上班日都落在周末，本来就按周末谷价，不用单列。
 * ⚠️ 每年 11 月国务院公布次年安排后要在这里补下一年的日期；缺日期只会把节假日
 * 按工作日峰时估高，不会估低。
 */
export const HOLIDAY_VALLEY = new Set([
  '2026-01-01', '2026-01-02', '2026-01-03', // 元旦
  '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', // 春节
  '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
  '2026-04-04', '2026-04-05', '2026-04-06', // 清明
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05', // 劳动节
  '2026-06-19', '2026-06-20', '2026-06-21', // 端午
  '2026-09-25', '2026-09-26', '2026-09-27', // 中秋
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', // 国庆
  '2026-10-05', '2026-10-06', '2026-10-07',
])

/** Pro 模型名（`deepseek-v4-pro` / `deepseek-pro`）。 */
const PRO_MODEL = /deepseek-(?:v\d+(?:\.\d+)?-)?pro/i

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

/** 谷时折扣（0~1）；缺省用默认价。 */
function discountOf(pricing) {
  const value = Number(pricing && pricing.offpeakDiscount)
  if (!Number.isFinite(value)) return DEFAULT_PRICING.offpeakDiscount
  return Math.min(1, Math.max(0, value))
}

/** 北京时间日历分量（不依赖运行机器的时区）。 */
function beijingParts(ms) {
  const d = new Date(ms + 8 * 3600 * 1000)
  return { dow: d.getUTCDay(), hour: d.getUTCHours(), day: d.toISOString().slice(0, 10) }
}

/**
 * 判断某一时刻是否处于谷时（非峰时）。
 *
 * 峰时 = 北京时间周一至周五（不含法定节假日）09:00–12:00、14:00–18:00；
 * 周末与 `HOLIDAY_VALLEY` 里的日期全天谷时。非法时间返回 `false`（按峰时估）。
 *
 * @param {number} atMs 毫秒时间戳。
 * @returns {boolean}
 */
export function isOffpeak(atMs) {
  const ms = Number(atMs)
  if (!Number.isFinite(ms)) return false
  const { dow, hour, day } = beijingParts(ms)
  if (dow === 0 || dow === 6) return true
  if (HOLIDAY_VALLEY.has(day)) return true
  return !PEAK_HOURS.some(([start, end]) => hour >= start && hour < end)
}

/** 模型价格倍数：Pro 为 Flash 的 3 倍，其余（含未知模型）按 Flash。 */
export function modelScale(model) {
  return PRO_MODEL.test(String(model || '')) ? PRO_MULTIPLIER : 1
}

/**
 * 计算一次用量的费用（元）。谷时按 `pricing.offpeakDiscount` 打折，Pro 模型再 ×3。
 *
 * `usage.inputTokens` 是**未命中**的输入（DSH 的 `totalTokens` = 输入 + 缓存读 + 输出，
 * 缓存读不重复计入输入）；`cacheWriteTokens` 在 DeepSeek 价目里没有独立价格，其成本
 * 已包含在未命中输入里，这里不重复计费。
 *
 * @param {{ inputTokens?: number, outputTokens?: number, cacheReadTokens?: number }} usage
 * @param {typeof DEFAULT_PRICING} [pricing=DEFAULT_PRICING] 价格配置。
 * @param {number} [atMs] 用量发生的时刻；给出且处于谷时则打折，缺省按峰时计。
 * @param {string} [model] 模型名；`deepseek-v4-pro` 按 3 倍价。
 * @returns {number} 费用（元，未取整）。
 */
export function costOf(usage, pricing = DEFAULT_PRICING, atMs, model) {
  const u = usage && typeof usage === 'object' ? usage : {}
  const p = pricing && typeof pricing === 'object' ? pricing : DEFAULT_PRICING
  const input = num(u.inputTokens)
  const output = num(u.outputTokens)
  const cacheRead = num(u.cacheReadTokens)
  let cost =
    (input / 1e6) * num(p.inputPerM) +
    (output / 1e6) * num(p.outputPerM) +
    (cacheRead / 1e6) * num(p.cacheReadPerM)
  if (atMs !== undefined && atMs !== null && isOffpeak(atMs)) cost *= discountOf(p)
  return cost * modelScale(model)
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
    const offpeak = Number.isFinite(at) ? isOffpeak(at) : false
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
  if (peakShare >= 0.6 && offpeakSavingCny >= 0.1) {
    tips.push(
      Math.round(peakShare * 100) +
        '% 用量在峰时（' +
        PEAK_LABEL +
        '），其余时间（含周末与法定节假日）按 ' +
        Math.round(discount * 100) +
        '% 计，挪过去约省 ' +
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
