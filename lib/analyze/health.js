/**
 * Behaviour reminders (design §5). Wording only ever *reminds*; it never
 * diagnoses. When keyboard/mouse sampling is off (or has no data) the section
 * degrades to DSH activity times and says so explicitly (`rough: true`).
 * @module dsh-daily-report/analyze/health
 */

import { fmtClock, fmtDur, parseDate } from '../util.js'

/** Gap between two DSH human messages still treated as one sitting. */
const ROUGH_GAP_MS = 15 * 60000

/**
 * Turn DSH human-message times into rough "sittings".
 * @param {number[]} times - ascending timestamps.
 * @returns {{start:number,end:number,ms:number}[]}
 */
export function roughStreaks(times) {
  const out = []
  let cur = null
  for (const t of times) {
    if (cur && t - cur.end <= ROUGH_GAP_MS) cur.end = t
    else { if (cur) out.push(cur); cur = { start: t, end: t } }
  }
  if (cur) out.push(cur)
  return out.map((s) => ({ ...s, ms: s.end - s.start })).filter((s) => s.ms > 0)
}

/**
 * Analyse one day's health signals.
 * @param {object} facts - DayFacts.
 * @param {object} opts - `{ enabled, sitLimitMin=50, lateHour=23, lunch=true, inputSampling }`.
 * @returns {null | {rough:boolean, usageMs:number, longest:object|null, sedentaryCount:number, lines:string[], alerts:string[]}}
 */
export function analyzeHealth(facts, opts = {}) {
  if (!opts.enabled) return null
  const sitLimitMs = (opts.sitLimitMin || 50) * 60000
  const lateHour = opts.lateHour ?? 23
  const idle = opts.inputSampling !== false && facts.idle && facts.idle.samples > 0 ? facts.idle : null
  const rough = !idle
  const lines = []
  const alerts = []

  let usageMs = 0
  let longest = null
  let sedentaryCount = 0
  let firstActive = null
  let lastActive = null
  /** 展示用的“多晚还在”时刻：有采样时取最后一个采样的时间，否则退回最后活动时间。 */
  let lastSeen = null
  if (idle) {
    usageMs = idle.activeMs || 0
    longest = idle.longestStreak || null
    sedentaryCount = (idle.streaks || []).filter((s) => s.ms > sitLimitMs).length
    firstActive = idle.firstActive
    lastActive = idle.lastActive
    lastSeen = idle.lastSample || idle.lastActive
  } else {
    const times = (facts.activity && facts.activity.userMessageTimes) || []
    const streaks = roughStreaks(times)
    usageMs = streaks.reduce((a, s) => a + s.ms, 0)
    longest = streaks.slice().sort((a, b) => b.ms - a.ms)[0] || null
    sedentaryCount = streaks.filter((s) => s.ms > sitLimitMs).length
    firstActive = facts.activity ? facts.activity.firstActive : null
    lastActive = facts.activity ? facts.activity.lastActive : null
    lastSeen = lastActive
  }

  if (longest && longest.ms > sitLimitMs) {
    const span = fmtDur(longest.ms) + '（' + fmtClock(longest.start) + '–' + fmtClock(longest.end) + '）'
    lines.push((idle ? '今天用机 ' + fmtDur(usageMs) + '，' : '') + '最长一段 ' + span + ' 没离开' + (idle ? '键盘' : ' DSH') + '，下次试试每 ' + (opts.sitLimitMin || 50) + ' 分钟起来一下。')
    if (sedentaryCount > 1) lines.push('超过 ' + (opts.sitLimitMin || 50) + ' 分钟的连续段有 ' + sedentaryCount + ' 段。')
    alerts.push('连续 ' + fmtDur(longest.ms) + ' 未休息')
  }

  // Late night: last activity at/after lateHour, or between midnight and 05:00.
  // The trigger stays on `lastActive` (the last moment the user was actually
  // there), while the wording shows `lastSeen` — the last sampled moment — so the
  // card reports how late the machine was still in use instead of the last tap.
  if (lastActive) {
    const d = new Date(lastActive)
    const dayStart = parseDate(facts.date)
    const hoursFromMidnight = (lastActive - dayStart) / 3600000
    if (d.getHours() >= Math.min(lateHour, 23) || hoursFromMidnight >= lateHour || d.getHours() < 5) {
      const shown = lastSeen || lastActive
      lines.push(fmtClock(shown) + ' 还在工作，早点休息，明天效率更高。')
      alerts.push(fmtClock(shown) + ' 仍在工作')
    }
  }
  if (firstActive && new Date(firstActive).getHours() < 5) {
    lines.push('凌晨 ' + fmtClock(firstActive) + ' 就开始了，注意补觉。')
  }

  // Lunch: activity in every 30-minute slot between 11:30 and 13:30.
  if (opts.lunch !== false) {
    const dayStart = parseDate(facts.date)
    const slots = [0, 1, 2, 3].map((i) => dayStart + (11.5 + i * 0.5) * 3600000)
    let covered = false
    if (idle && idle.streaks) {
      covered = idle.streaks.some((s) => s.start <= slots[0] && s.end >= slots[3] + 1800000)
    } else {
      const times = (facts.activity && facts.activity.userMessageTimes) || []
      covered = slots.every((s) => times.some((t) => t >= s && t < s + 1800000))
    }
    if (covered) lines.push('11:30–13:30 一直在线，中午没离开过，记得吃饭、走动一下。')
  }

  // Weekend.
  const dow = new Date(parseDate(facts.date)).getDay()
  if ((dow === 0 || dow === 6) && facts.totals && facts.totals.sessions > 0 && usageMs > 2 * 3600000) {
    lines.push('今天是周末，也工作了 ' + fmtDur(usageMs) + '，别忘了休息。')
  }

  if (rough && lines.length) lines.push('（未开启键鼠采样，以上基于 DSH 消息时间粗略估计）')
  return { rough, usageMs, longest, sedentaryCount, lines, alerts: alerts.slice(0, 2) }
}
