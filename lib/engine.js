/**
 * The report pipeline: collect → enrich (host/weather/idle) → summarize →
 * analyze → render → persist. Pure orchestration; the Host entry wires the
 * services and the scheduler.
 * @module dsh-daily-report/engine
 */

import { spawn } from 'node:child_process'
import { collectDay } from './collect/sessions.js'
import { readHostDay } from './collect/heartbeat.js'
import { normalizeBili } from './analyze/bili.js'
import { fetchWeather, geocode } from './collect/weather.js'
import { summarizeDay } from './summarize.js'
import { buildDailyReport, buildPeriodReport, previousWeekRange, previousMonthRange } from './analyze/report.js'
import { costOf, DEFAULT_PRICING } from './analyze/cost.js'
import { renderHtml } from './render/html.js'
import { renderMarkdown } from './render/markdown.js'
import * as store from './store.js'
import { DATA_DIR, fmtDate, addDays, isoWeek, readJson, writeJson, dayRange, mapLimit } from './util.js'
import path from 'node:path'

/** Which date the "morning" report covers under `reportRange`. */
export function targetDate(cfg, now = Date.now()) {
  const today = fmtDate(now)
  if (cfg.reportRange === 'today') return today
  if (cfg.reportRange === 'yesterday') return addDays(today, -1)
  return new Date(now).getHours() < 18 ? addDays(today, -1) : today
}

/**
 * Cost of producing one report: tokens the summariser spent plus their price.
 * `estimated` marks the character-based fallback used when a provider sends no usage.
 * @param {{calls?:number, inputTokens?:number, outputTokens?:number, cacheReadTokens?:number, cacheWriteTokens?:number, estimated?:boolean}} usage
 * @param {object} cfg - plugin config (uses `cfg.pricing` when present).
 */
export function generationMeta(usage, cfg = {}) {
  const u = usage && typeof usage === 'object' ? usage : {}
  const numOf = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0)
  const tokens = numOf(u.inputTokens) + numOf(u.outputTokens) + numOf(u.cacheReadTokens) + numOf(u.cacheWriteTokens)
  let costCny = 0
  try {
    // 摘要走云路由时用配置里的模型名（Pro 按 3 倍价）；默认路由的模型名拿不到，按 Flash 估。
    const model = (cfg && cfg.cloudRoute && cfg.cloudRoute.model) || ''
    costCny = costOf(u, (cfg && cfg.pricing) || DEFAULT_PRICING, Date.now(), model)
  } catch { costCny = 0 }
  return {
    calls: numOf(u.calls),
    tokens,
    inputTokens: numOf(u.inputTokens),
    outputTokens: numOf(u.outputTokens),
    costCny: Math.round((Number(costCny) || 0) * 10000) / 10000,
    estimated: !!u.estimated,
  }
}

/**
 * Resolve an automatic card date without calling a model or writing reports.
 * Read each session once; ignore empty sessions, excluded subagents and dates
 * outside the retention window. Explicit-date requests never use this helper.
 */
export async function resolveReportTarget(source, cfg, now = Date.now()) {
  const requestedDate = targetDate(cfg, now)
  const { end } = dayRange(requestedDate)
  const earliest = addDays(requestedDate, -(cfg.retentionDays || 180))
  const records = (await source.list()).filter((r) => r && r.createdAt < end && (cfg.includeSubagents || r.origin !== 'subagent'))
  const events = new Map()
  let latest = null
  let failedReads = 0
  await mapLimit(records, 4, async (r) => {
    try {
      const rows = await source.read(r.id)
      events.set(r.id, rows)
      for (const e of rows) {
        if (!Number.isFinite(e?.time) || e.time >= end) continue
        const d = e.data || {}
        const u = d.usage || {}
        const contributes = e.type === 'tool/call' || (e.type === 'user/message' && d.source?.kind === 'user') ||
          (e.type === 'assistant/message' && (u.totalTokens || u.inputTokens || u.outputTokens || u.cacheReadTokens || u.cacheWriteTokens))
        if (!contributes) continue
        const day = fmtDate(e.time)
        if (day >= earliest && (!latest || day > latest)) latest = day
      }
    } catch { failedReads++ }
  })
  // Never disguise a read failure as "no activity".
  if (failedReads) throw new Error('无法确认最近活动日期：' + failedReads + ' 个会话读取失败，请重试')
  const date = latest || requestedDate
  const snapshot = { list: async () => records, read: async (id) => events.get(id) || [], titles: (ids) => source.titles(ids) }
  return {
    date, requestedDate, source: snapshot,
    fallbackNote: date !== requestedDate ? requestedDate.slice(5) + ' 没有新会话，显示最近有活动的 ' + date.slice(5) : null,
  }
}

/** Cache file for Open-Meteo results (shared by report runs and the evening warm-up). */
const weatherCacheFile = () => path.join(DATA_DIR, 'cache', 'weather.json')

/** Resolve weather coordinates, geocoding the configured name once. `null` when unusable. */
async function weatherCoords(cfg, log = () => {}) {
  if (!cfg.weather || !cfg.weather.enabled) return null
  let { latitude, longitude, location } = cfg.weather
  if ((latitude === null || longitude === null) && location) {
    const g = await geocode(location)
    if (g && g[0]) { latitude = g[0].latitude; longitude = g[0].longitude; location = g[0].name }
  }
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
    if (log) log('weather: 没有可用的坐标（请在设置里选一个地点）')
    return null
  }
  return { latitude, longitude, location: location || '' }
}

/** One cache entry per date and coordinate pair. */
function weatherCacheKey(dateStr, coords) {
  return dateStr + '@' + coords.latitude.toFixed(2) + ',' + coords.longitude.toFixed(2)
}

/** True when a cache entry may be served without asking Open-Meteo again. */
function weatherFresh(entry, dateStr, now = Date.now()) {
  if (!entry || !entry.value) return false
  // A past day's forecast never changes; today's refreshes hourly.
  return dateStr < fmtDate(now) || now - entry.at < 3600000
}

/** Persist the weather cache, keeping the newest 30 entries. */
async function saveWeatherCache(file, cache, log) {
  const keys = Object.keys(cache).sort().slice(-30)
  try { await writeJson(file, Object.fromEntries(keys.map((k) => [k, cache[k]]))) } catch (err) { log('weather cache: ' + String(err)) }
}

/**
 * Warm the cache for one day's forecast (`dateStr`). The evening tick calls this
 * for tomorrow so the first morning report still has weather when the network
 * lags right after boot. Never throws; returns the value now in the cache (live
 * fetch preferred, stale cached value as fallback) or `null`.
 */
export async function prefetchWeather(cfg, dateStr, log = () => {}) {
  try {
    const coords = await weatherCoords(cfg, log)
    if (!coords) return null
    const file = weatherCacheFile()
    const cache = (await readJson(file, {})) || {}
    const key = weatherCacheKey(dateStr, coords)
    const entry = cache[key]
    if (weatherFresh(entry, dateStr)) return entry.value
    const value = await fetchWeather({ ...coords, dateStr })
    if (!value) return entry ? entry.value : null
    cache[key] = { at: Date.now(), value }
    await saveWeatherCache(file, cache, log)
    return value
  } catch (err) { log('weather prefetch ' + dateStr + ': ' + String(err)); return null }
}

/** Weather for one day, cached; falls back to a stale cached forecast when the live fetch fails. */
async function weatherFor(cfg, dateStr, log) {
  const coords = await weatherCoords(cfg, log)
  if (!coords) return null
  const file = weatherCacheFile()
  const cache = (await readJson(file, {})) || {}
  const key = weatherCacheKey(dateStr, coords)
  const entry = cache[key]
  if (weatherFresh(entry, dateStr)) return entry.value
  let value = await fetchWeather({ ...coords, dateStr })
  if (!value && !(entry && entry.value)) {
    // The first report of the day is generated seconds after boot, often while
    // the network is still coming up; one short retry is enough to catch it.
    await new Promise((resolve) => { const t = setTimeout(resolve, 4000); t.unref?.() })
    value = await fetchWeather({ ...coords, dateStr })
  }
  if (value) {
    cache[key] = { at: Date.now(), value }
    await saveWeatherCache(file, cache, log)
    return value
  }
  // The first report of the day is usually generated seconds after boot, before
  // the network is up; use whatever the evening warm-up already stored instead
  // of dropping weather from the card entirely.
  if (entry && entry.value) {
    log('weather: live fetch failed, reusing cached ' + dateStr)
    return entry.value
  }
  return null
}

/** Local metadata enrichment only: no collectDay, summarizeDay or model calls. */
export async function enrichDailyBili(report, dateStr, { readBiliDay } = {}) {
  if (!report || report.kind !== 'daily' || !report.layer1 || !readBiliDay) return report
  const facts = await store.loadFacts(dateStr)
  const ids = Array.isArray(facts?.sessions) ? facts.sessions.map((s) => s.id) : []
  let bili = null
  try { bili = normalizeBili(await readBiliDay(dateStr, ids)) } catch { /* unavailable is hidden */ }
  // Return a fresh object so concurrent view paths cannot mutate stored reports.
  const discovery = report.layer1.discoveryLinked === true && !bili ? null : report.layer1.discovery
  return { ...report, layer1: { ...report.layer1, bili, discovery } }
}

/**
 * Generate (and persist) the daily report for `dateStr`.
 * @param {object} deps - `{ source, cfg, llm, agentDefaultModel, currentBootId, readIdleDay, readBiliDay, log }`.
 * @param {string} dateStr
 * @returns {Promise<{report:object, markdown:string, html:string, files:object, facts:object, llmCalls:number}>}
 */
export async function generateDaily(deps, dateStr) {
  const { cfg } = deps
  const log = deps.log || (() => {})
  const facts = await collectDay(deps.source, dateStr, { includeSubagents: cfg.includeSubagents, pricing: cfg.pricing, log })
  if (deps.readBiliDay) {
    try { facts.bili = await deps.readBiliDay(dateStr, facts.sessions.map((s) => s.id)) } catch (err) { facts.bili = null; log('bili metadata unavailable: ' + String(err)) }
  }
  const dataDir = DATA_DIR
  if (cfg.heartbeat) {
    try { facts.host = await readHostDay(path.join(dataDir), dateStr, deps.currentBootId) } catch (err) { log('host: ' + String(err)) }
  }
  // Layer-1 weather is for the day the reader opens the report ("带伞"), not the reported day.
  const today = fmtDate(Date.now())
  if (dateStr >= addDays(today, -1)) {
    try { facts.weather = await weatherFor(cfg, today, log) } catch (err) { log('weather: ' + String(err)) }
  }
  if (cfg.inputSampling && deps.readIdleDay) {
    try { facts.idle = await deps.readIdleDay(dataDir, dateStr, { sedentaryMs: (cfg.health.sitLimitMin || 50) * 60000 }) } catch (err) { log('idle: ' + String(err)) }
  }
  const sum = await summarizeDay(facts, cfg, { llm: deps.llm, agentDefaultModel: deps.agentDefaultModel, fetchImpl: deps.fetchImpl, log })
  facts.oneLiner = sum.oneLiner
  facts.discovery = sum.discovery
  facts.discoveryLinked = sum.discoveryLinked === true
  await store.saveFacts(facts)
  const history = await store.loadHistory(dateStr, 7)
  const report = buildDailyReport(facts, history, cfg, { oneLiner: sum.oneLiner, discovery: sum.discovery, summaryMode: sum.mode })
  report.meta = { gen: generationMeta(sum.genUsage, cfg) }
  const markdown = renderMarkdown(report)
  const html = renderHtml(report)
  const files = await store.saveReport('daily', dateStr, { report, markdown, html }, cfg.reportsDir)
  return { report, markdown, html, files, facts, llmCalls: sum.llmCalls }
}

/**
 * Ensure DayFacts exist for every date in range (cheap: no LLM in local-only;
 * cached summaries otherwise), then build a weekly/monthly report.
 */
export async function generatePeriod(deps, kind, range) {
  const log = deps.log || (() => {})
  const today = fmtDate(Date.now())
  for (let d = range.start; d <= range.end && d <= today; d = addDays(d, 1)) {
    // Today's facts are mutable; refresh them even when an earlier daily run
    // already saved a partial snapshot. Historical facts remain cached.
    if (d === today || !(await store.loadFacts(d))) {
      try {
        const facts = await collectDay(deps.source, d, { includeSubagents: deps.cfg.includeSubagents, pricing: deps.cfg.pricing, log })
        if (deps.cfg.heartbeat) facts.host = await readHostDay(DATA_DIR, d, deps.currentBootId).catch(() => null)
        if (deps.cfg.inputSampling && deps.readIdleDay) facts.idle = await deps.readIdleDay(DATA_DIR, d).catch(() => null)
        await summarizeDay(facts, { ...deps.cfg, privacy: 'local-only' }, { log }) // backfill never spends tokens
        facts.discovery = null // no model judgment during token-free backfill
        await store.saveFacts(facts)
      } catch (err) { log('backfill ' + d + ': ' + String(err)) }
    }
  }
  const days = await store.loadRange(range.start, range.end)
  const len = Math.round((new Date(range.end) - new Date(range.start)) / 86400000) + 1
  const prevStart = kind === 'weekly' ? addDays(range.start, -7) : previousMonthRange(range.start).start
  const prevEnd = addDays(range.start, -1)
  const prevDays = await store.loadRange(prevStart, prevEnd)
  const report = buildPeriodReport(kind, range, days, prevDays, deps.cfg)
  report.daysInRange = len
  const markdown = renderMarkdown(report)
  const html = renderHtml(report)
  const key = kind === 'weekly' ? isoWeek(range.start).key : range.start.slice(0, 7)
  const files = await store.saveReport(kind, key, { report, markdown, html }, deps.cfg.reportsDir)
  return { report, markdown, html, files, key }
}

/** Which periodic reports are due on `dateStr` per config. */
export function duePeriods(cfg, dateStr) {
  const out = []
  const d = new Date(dateStr + 'T00:00:00')
  if (cfg.weekly && cfg.weekly.enabled && d.getDay() === cfg.weekly.weekday) out.push({ kind: 'weekly', range: previousWeekRange(dateStr) })
  if (cfg.monthly && cfg.monthly.enabled && d.getDate() === cfg.monthly.day) out.push({ kind: 'monthly', range: previousMonthRange(dateStr) })
  return out
}

/**
 * Win32 应用的 toast 必须挂在一个「已注册的 AppUserModelID」上，否则
 * `CreateToastNotifier` 会抛 `The process has no package identity (0x80073D54)`。
 *
 * 旧实现借 PowerShell 自己的 AUMID，有两个隐患：PowerShell 缺省通知设置被关掉
 * 时 toast 悄悄不显示，而这个 AUMID 属于系统组件、用户无法在通知设置里单独
 * 打开。这里改成注册插件自己的 AUMID（HKCU\Software\Classes\AppUserModelId，
 * 不需要安装程序），它会在 Windows「通知和操作」里以「DSH 每日简报」独立出现，
 * 用户可以单独控制。注册失败（权限受限）时回退到 PowerShell AUMID，行为与
 * 旧版本一致。
 */
const TOAST_AUMID = 'Dsh.DailyReport'
const TOAST_FALLBACK_AUMID = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'

/** PowerShell 片段：注册 AUMID 并返回 CreateToastNotifier 用的 id（失败时用回退 id）。 */
function toastRegisterScript() {
  return (
    '$app=\'' + TOAST_AUMID + '\';' +
    '$key=\'HKCU:\\Software\\Classes\\AppUserModelId\\\'+$app;' +
    'try{' +
    'if(-not (Test-Path $key)){New-Item -Path $key -Force|Out-Null};' +
    'New-ItemProperty -Path $key -Name DisplayName -Value \'DSH 每日简报\' -PropertyType String -Force|Out-Null' +
    '}catch{$app=\'' + TOAST_FALLBACK_AUMID + '\'}'
  )
}

/** Best-effort desktop notification (Windows toast / macOS / Linux). Never throws. */
export function notify(title, message, log = () => {}, { platform = process.platform, spawnImpl = spawn } = {}) {
  const run = (cmd, args) => new Promise((resolve) => {
    let child, timer, settled = false
    const done = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) log(cmd + ': ' + error)
      resolve(error ? { ok: false, status: 'failed', error } : { ok: true, status: 'submitted' })
    }
    try {
      child = spawnImpl(cmd, args, { stdio: 'ignore', windowsHide: true })
      child.once('error', (e) => done(e.message))
      child.once('exit', (code) => done(code === 0 ? null : 'exit code: ' + code))
      timer = setTimeout(() => { child.kill(); done('通知提交超时') }, 15000)
      timer.unref?.()
    } catch (e) { done(String(e)) }
  })
  if (platform === 'win32') {
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    const xml = '<toast><visual><binding template="ToastGeneric"><text>' + esc(title) + '</text><text>' + esc(message) + '</text></binding></visual></toast>'
    const ps =
      '$ErrorActionPreference="Stop";' +
      '[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]|Out-Null;' +
      '[Windows.Data.Xml.Dom.XmlDocument,Windows.Data.Xml.Dom.XmlDocument,ContentType=WindowsRuntime]|Out-Null;' +
      toastRegisterScript() + ';' +
      '$x=New-Object Windows.Data.Xml.Dom.XmlDocument;$x.LoadXml(\'' + xml.replace(/'/g, "''") + '\');' +
      'try{$n=[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app)}' +
      'catch{$n=[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier(\'' + TOAST_FALLBACK_AUMID + '\')};' +
      '$n.Show([Windows.UI.Notifications.ToastNotification]::new($x))'
    return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')])
  } else if (platform === 'darwin') {
    const q = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    return run('osascript', ['-e', 'display notification "' + q(message) + '" with title "' + q(title) + '"'])
  } else if (platform === 'linux') {
    return run('notify-send', [title, message])
  }
  return Promise.resolve({ ok: false, status: 'unsupported' })
}
