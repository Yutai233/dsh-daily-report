/**
 * Festival easter egg: one local lookup, no model, no network.
 *
 * `festivalOf(dateStr)` answers "is this day a festival?" from three tables:
 *   - lunar / solar-term dates, precomputed for 2024–2036 and embedded as a flat
 *     `YYYY-MM-DD → id` map (no lunar algorithm ships in the plugin, so a wrong
 *     month length can never drift silently);
 *   - 除夕, derived as "the day before 春节" instead of being stored;
 *   - fixed Gregorian dates and nth-weekday rules (Mother's / Father's / Thanksgiving).
 *
 * The caller decides whether to show anything (`config.festival`); this module is
 * pure and returns `null` for ordinary days.
 * @module dsh-daily-report/collect/festival
 */

/** Display metadata for every festival, keyed by id (exported for tests). */
export const FESTIVALS = {
  newyear: { name: '元旦', emoji: '🎉', greeting: '新年好，先走一步。' },
  valentine: { name: '情人节', emoji: '💝', greeting: '今天准时下班。' },
  labor: { name: '劳动节', emoji: '🛠️', greeting: '活干不完，少干点。' },
  children: { name: '儿童节', emoji: '🧸', greeting: '今天幼稚一点。' },
  national: { name: '国庆', emoji: '🎆', greeting: '放假，待办靠后。' },
  programmer: { name: '程序员节', emoji: '💻', greeting: '少写两个 bug。' },
  halloween: { name: '万圣夜', emoji: '🎃', greeting: '今晚早点关机。' },
  singles: { name: '光棍节', emoji: '🛒', greeting: '先清待办再买。' },
  xmas: { name: '圣诞', emoji: '🎄', greeting: '圣诞快乐，早点歇。' },
  mothers: { name: '母亲节', emoji: '💐', greeting: '记得给妈妈打电话。' },
  fathers: { name: '父亲节', emoji: '👔', greeting: '记得给爸爸打电话。' },
  thanks: { name: '感恩节', emoji: '🦃', greeting: '今天适合说谢谢。' },
  laba: { name: '腊八', emoji: '🥣', greeting: '腊八了，喝碗粥。' },
  eve: { name: '除夕', emoji: '🧨', greeting: '今年最后一晚。' },
  spring: { name: '春节', emoji: '🧧', greeting: '新年快乐，收红包。' },
  lantern: { name: '元宵', emoji: '🏮', greeting: '元宵快乐，吃汤圆。' },
  qingming: { name: '清明', emoji: '', greeting: '清明，出去走走。' },
  dragon: { name: '端午', emoji: '🛶', greeting: '端午安康，吃粽子。' },
  qixi: { name: '七夕', emoji: '💞', greeting: '今天早点下班。' },
  midautumn: { name: '中秋', emoji: '🌕', greeting: '月圆了，早点收工。' },
  chongyang: { name: '重阳', emoji: '', greeting: '登高不必，走两步。' },
}

/**
 * Badge palette: `bg` / `fg` / `border` are CSS colours (a colour or a gradient),
 * `deco` is an optional background-image that keeps the badge from looking flat,
 * `mono` switches to a monospace face for the developer holiday.
 * Festivals with no strong visual cue stay white — that is intentional.
 */
const THEMES = {
  newyear: { bg: '#ffffff', fg: '#3a3a3a', border: '#d4a72c' },
  valentine: { bg: 'linear-gradient(135deg,#ffffff,#ffe9ee)', fg: '#c2185b', border: '#f8bbd0' },
  labor: { bg: '#ffffff', fg: '#d97706', border: '#fcd34d' },
  children: { bg: '#fff7d6', fg: '#b45309', border: '#f59e0b' },
  national: { bg: '#c62828', fg: '#ffd54f', border: '#ffd54f' },
  programmer: { bg: '#0d1117', fg: '#3fb950', border: '#238636', mono: true },
  halloween: { bg: '#e8590c', fg: '#2b1a0e', border: '#1f1300' },
  singles: { bg: '#ffffff', fg: '#6b7280', border: '#d1d5db' },
  xmas: {
    bg: '#ffffff', fg: '#c62828', border: '#c62828',
    deco: 'repeating-linear-gradient(135deg, rgba(198,40,40,.13) 0 3px, transparent 3px 11px)',
  },
  mothers: { bg: '#fde8ee', fg: '#ad1457', border: '#f8bbd0' },
  fathers: { bg: '#1f2d44', fg: '#ffffff', border: '#94a3b8' },
  thanks: { bg: '#b45309', fg: '#fff7e6', border: '#f59e0b' },
  laba: { bg: '#f6e6c8', fg: '#8a4b1e', border: '#d8b98a' },
  eve: {
    bg: '#b71c1c', fg: '#ffd54f', border: '#ffd54f',
    deco: 'radial-gradient(circle at 18% 130%, rgba(255,213,79,.30) 0 10px, transparent 11px), radial-gradient(circle at 82% -30%, rgba(255,213,79,.26) 0 12px, transparent 13px)',
  },
  spring: {
    bg: '#c62828', fg: '#ffd54f', border: '#ffd54f',
    deco: 'radial-gradient(circle at 18% 130%, rgba(255,213,79,.30) 0 10px, transparent 11px), radial-gradient(circle at 82% -30%, rgba(255,213,79,.26) 0 12px, transparent 13px)',
  },
  lantern: { bg: '#f59e0b', fg: '#7a1f1f', border: '#fbbf24' },
  qingming: { bg: '#ffffff', fg: '#6b7280', border: '#d1d5db' },
  dragon: { bg: '#1b5e20', fg: '#f3f4e8', border: '#4ade80' },
  qixi: {
    bg: 'linear-gradient(135deg,#1e1b4b,#312e81)', fg: '#e0d7ff', border: '#818cf8',
    deco: 'radial-gradient(circle at 22% 28%, rgba(224,215,255,.9) 0 1.5px, transparent 2px), radial-gradient(circle at 72% 70%, rgba(224,215,255,.75) 0 1px, transparent 1.6px)',
  },
  midautumn: { bg: '#1e2a5a', fg: '#ffd54f', border: '#ffd54f' },
  chongyang: { bg: '#ffffff', fg: '#b7791f', border: '#e5c07b' },
}

/** Fixed Gregorian festivals, checked in table order. */
const FIXED = [
  { id: 'newyear', month: 1, day: 1 },
  { id: 'valentine', month: 2, day: 14 },
  { id: 'labor', month: 5, day: 1 },
  { id: 'children', month: 6, day: 1 },
  { id: 'national', month: 10, day: 1 },
  { id: 'programmer', month: 10, day: 24 },
  { id: 'halloween', month: 10, day: 31 },
  { id: 'singles', month: 11, day: 11 },
  { id: 'xmas', month: 12, day: 25 },
]

/** Floating Gregorian festivals: the nth weekday of a month (0 = Sunday). */
const NTH = [
  { id: 'mothers', month: 5, nth: 2, weekday: 0 },
  { id: 'fathers', month: 6, nth: 3, weekday: 0 },
  { id: 'thanks', month: 11, nth: 4, weekday: 4 },
]

/**
 * Lunar festivals and 清明 for 2024–2036, precomputed once from an authoritative
 * lunar table and embedded here so the plugin stays offline and dependency-free.
 * Regenerate (and re-verify against a 万年历) before extending the range past 2036.
 */
const LUNAR = {
  '2024-02-10': 'spring',
  '2024-02-24': 'lantern',
  '2024-04-04': 'qingming',
  '2024-06-10': 'dragon',
  '2024-08-10': 'qixi',
  '2024-09-17': 'midautumn',
  '2024-10-11': 'chongyang',
  '2025-01-07': 'laba',
  '2025-01-29': 'spring',
  '2025-02-12': 'lantern',
  '2025-04-04': 'qingming',
  '2025-05-31': 'dragon',
  '2025-08-29': 'qixi',
  '2025-10-06': 'midautumn',
  '2025-10-29': 'chongyang',
  '2026-01-26': 'laba',
  '2026-02-17': 'spring',
  '2026-03-03': 'lantern',
  '2026-04-05': 'qingming',
  '2026-06-19': 'dragon',
  '2026-08-19': 'qixi',
  '2026-09-25': 'midautumn',
  '2026-10-18': 'chongyang',
  '2027-01-15': 'laba',
  '2027-02-06': 'spring',
  '2027-02-20': 'lantern',
  '2027-04-05': 'qingming',
  '2027-06-09': 'dragon',
  '2027-08-08': 'qixi',
  '2027-09-15': 'midautumn',
  '2027-10-08': 'chongyang',
  '2028-01-04': 'laba',
  '2028-01-26': 'spring',
  '2028-02-09': 'lantern',
  '2028-04-04': 'qingming',
  '2028-05-28': 'dragon',
  '2028-08-26': 'qixi',
  '2028-10-03': 'midautumn',
  '2028-10-26': 'chongyang',
  '2029-01-22': 'laba',
  '2029-02-13': 'spring',
  '2029-02-27': 'lantern',
  '2029-04-04': 'qingming',
  '2029-06-16': 'dragon',
  '2029-08-16': 'qixi',
  '2029-09-22': 'midautumn',
  '2029-10-16': 'chongyang',
  '2030-01-11': 'laba',
  '2030-02-03': 'spring',
  '2030-02-17': 'lantern',
  '2030-04-05': 'qingming',
  '2030-06-05': 'dragon',
  '2030-08-05': 'qixi',
  '2030-09-12': 'midautumn',
  '2030-10-05': 'chongyang',
  '2031-01-01': 'laba',
  '2031-01-23': 'spring',
  '2031-02-06': 'lantern',
  '2031-04-05': 'qingming',
  '2031-06-24': 'dragon',
  '2031-08-24': 'qixi',
  '2031-10-01': 'midautumn',
  '2031-10-24': 'chongyang',
  '2032-01-20': 'laba',
  '2032-02-11': 'spring',
  '2032-02-25': 'lantern',
  '2032-04-04': 'qingming',
  '2032-06-12': 'dragon',
  '2032-08-12': 'qixi',
  '2032-09-19': 'midautumn',
  '2032-10-12': 'chongyang',
  '2033-01-08': 'laba',
  '2033-01-31': 'spring',
  '2033-02-14': 'lantern',
  '2033-04-04': 'qingming',
  '2033-06-01': 'dragon',
  '2033-08-01': 'qixi',
  '2033-09-08': 'midautumn',
  '2033-10-01': 'chongyang',
  '2034-01-27': 'laba',
  '2034-02-19': 'spring',
  '2034-03-05': 'lantern',
  '2034-04-05': 'qingming',
  '2034-06-20': 'dragon',
  '2034-08-20': 'qixi',
  '2034-09-27': 'midautumn',
  '2034-10-20': 'chongyang',
  '2035-01-16': 'laba',
  '2035-02-08': 'spring',
  '2035-02-22': 'lantern',
  '2035-04-05': 'qingming',
  '2035-06-10': 'dragon',
  '2035-08-10': 'qixi',
  '2035-09-16': 'midautumn',
  '2035-10-09': 'chongyang',
  '2036-01-05': 'laba',
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function parts(dateStr) {
  const m = DATE_RE.exec(String(dateStr || ''))
  if (!m) return null
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return { y, mo, d }
}

function shift(dateStr, days) {
  const p = parts(dateStr)
  if (!p) return null
  const t = Date.UTC(p.y, p.mo - 1, p.d) + days * 86400000
  return new Date(t).toISOString().slice(0, 10)
}

function weekdayOf(dateStr) {
  const p = parts(dateStr)
  return p ? new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay() : -1
}

/** Badge text: `emoji 名称`, or just `名称` when no icon fits. */
export function festivalBadge(f) {
  return f.emoji ? f.emoji + ' ' + f.name : f.name
}

/** Inline CSS (kebab-case) for the themed badge; HTML reports use this directly. */
export function festivalStyle(f) {
  const t = f.theme || {}
  let css = 'background:' + (t.bg || '#ffffff') + ';color:' + (t.fg || '#3a3a3a') + ';border:1px solid ' + (t.border || '#d1d5db') + ';'
  if (t.deco) css += 'background-image:' + t.deco + ';'
  if (t.mono) css += "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,'Cascadia Mono','Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',monospace;"
  return css
}

/**
 * Look up the festival of one calendar day.
 * @param {string} dateStr - `YYYY-MM-DD`.
 * @returns {{id:string,name:string,emoji:string,greeting:string,badge:string,theme:object}|null}
 */
export function festivalOf(dateStr) {
  if (!parts(dateStr)) return null
  let id = LUNAR[dateStr] || null
  if (!id && LUNAR[shift(dateStr, 1)] === 'spring') id = 'eve'
  if (!id) {
    const p = parts(dateStr)
    for (const f of FIXED) {
      if (f.month === p.mo && f.day === p.d) { id = f.id; break }
    }
  }
  if (!id) {
    const p = parts(dateStr)
    for (const f of NTH) {
      if (f.month !== p.mo) continue
      if (weekdayOf(dateStr) === f.weekday && Math.ceil(p.d / 7) === f.nth) { id = f.id; break }
    }
  }
  if (!id) return null
  const meta = FESTIVALS[id]
  if (!meta) return null
  const f = { id, name: meta.name, emoji: meta.emoji, greeting: meta.greeting, theme: THEMES[id] || THEMES.newyear }
  f.badge = festivalBadge(f)
  return f
}
