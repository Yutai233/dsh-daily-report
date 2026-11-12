/**
 * Shared helpers for dsh-daily-report. Zero dependencies; every time value is
 * a millisecond timestamp interpreted in the Host's local time zone.
 * @module dsh-daily-report/util
 */

import { readFile, writeFile, mkdir, rename, appendFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

/** One day in milliseconds. */
export const DAY = 86400000

/** Root directory for every file this plugin persists (overridable for tests). */
export const DATA_DIR = process.env.DSH_DAILY_REPORT_DIR || path.join(homedir(), '.dsh', 'dsh-daily-report')

/** Two-digit zero padding. */
export const pad = (n) => String(n).padStart(2, '0')

/** Local calendar date `YYYY-MM-DD` for a timestamp. */
export function fmtDate(ms) {
  const d = new Date(ms)
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

/** Local midnight of a `YYYY-MM-DD` string. */
export function parseDate(str) {
  const p = String(str).split('-').map(Number)
  return new Date(p[0], p[1] - 1, p[2]).getTime()
}

/** `true` when the value looks like `YYYY-MM-DD`. */
export const isDateStr = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

/** Half-open local-day range `[start, end)`; DST-safe (uses calendar math). */
export function dayRange(str) {
  const start = parseDate(str)
  const d = new Date(start)
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
  return { start, end }
}

/** Add `n` calendar days to a date string. */
export function addDays(str, n) {
  const d = new Date(parseDate(str))
  return fmtDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime())
}

/** `HH:MM` for a timestamp. */
export function fmtClock(ms) {
  const d = new Date(ms)
  return pad(d.getHours()) + ':' + pad(d.getMinutes())
}

/** Compact duration: `6h20m`, `45m`, `30s`. */
export function fmtDur(ms) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0
  if (ms < 60000) return Math.round(ms / 1000) + 's'
  const h = Math.floor(ms / 3600000)
  const m = Math.round((ms % 3600000) / 60000)
  if (h === 0) return m + 'm'
  return m === 0 ? h + 'h' : h + 'h' + pad(m) + 'm'
}

/** Chinese-style token count: `9,800` / `84 万` / `1.2 亿`. */
export function fmtTokens(n) {
  n = Number(n) || 0
  if (n >= 1e8) return (n / 1e8).toFixed(n >= 1e9 ? 0 : 1) + ' 亿'
  if (n >= 1e4) return (n / 1e4).toFixed(n >= 1e5 ? 0 : 1) + ' 万'
  return n.toLocaleString('en-US')
}

/** Yuan amount with two decimals; tiny amounts render as `<¥0.01`. */
export function fmtCny(n) {
  n = Number(n) || 0
  if (n > 0 && n < 0.01) return '<¥0.01'
  return '¥' + n.toFixed(2)
}

/** Linear-interpolated quantile of an ascending numeric array; `null` when empty. */
export function quantile(sorted, q) {
  if (!sorted || sorted.length === 0) return null
  if (sorted.length === 1) return sorted[0]
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, q))
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/** Read and parse a JSON file; return `fallback` when missing or invalid. */
export async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

/** Atomically write JSON (tmp + rename), creating parent directories. */
export async function writeJson(file, value, mode) {
  await mkdir(path.dirname(file), { recursive: true })
  const tmp = file + '.' + process.pid + '.' + Date.now() + '.tmp'
  await writeFile(tmp, JSON.stringify(value, null, 2), mode ? { mode } : undefined)
  await rename(tmp, file)
}

/** Atomically write a text file, creating parent directories. */
export async function writeText(file, text) {
  await mkdir(path.dirname(file), { recursive: true })
  const tmp = file + '.' + process.pid + '.' + Date.now() + '.tmp'
  await writeFile(tmp, text, 'utf8')
  await rename(tmp, file)
}

/** Append one JSON line, creating parent directories. */
export async function appendLine(file, obj) {
  await mkdir(path.dirname(file), { recursive: true })
  await appendFile(file, JSON.stringify(obj) + '\n', 'utf8')
}

/** Read a JSONL file into objects; bad lines are skipped, a missing file yields `[]`. */
export async function readLines(file) {
  let text
  try {
    text = await readFile(file, 'utf8')
  } catch {
    return []
  }
  const out = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try { out.push(JSON.parse(line)) } catch { /* skip torn line */ }
  }
  return out
}

/** Escape text for HTML element and attribute content. */
export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Truncate with an ellipsis. */
export const truncate = (s, n) => {
  s = String(s ?? '')
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

/** Run `fn` over items with bounded concurrency; a failed item yields `null`. */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (i < items.length) {
      const idx = i++
      try { results[idx] = await fn(items[idx], idx) } catch { results[idx] = null }
    }
  })
  await Promise.all(workers)
  return results
}

/** Chinese weekday label for a date string. */
export function weekdayZh(str) {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(parseDate(str)).getDay()]
}

/** ISO-8601 week key `YYYY-Www` and its Monday..Sunday date range. */
export function isoWeek(str) {
  const d = new Date(parseDate(str))
  const day = (d.getDay() + 6) % 7 // Monday = 0
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day)
  const thursday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 3)
  const jan4 = new Date(thursday.getFullYear(), 0, 4)
  const week = 1 + Math.round(((thursday - jan4) / DAY - 3 + ((jan4.getDay() + 6) % 7)) / 7)
  const start = fmtDate(monday.getTime())
  return { key: thursday.getFullYear() + '-W' + pad(week), year: thursday.getFullYear(), week, start, end: addDays(start, 6) }
}
