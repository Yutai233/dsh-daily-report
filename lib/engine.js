/**
 * The report pipeline: collect → enrich (host/weather/idle) → summarize →
 * analyze → render → persist. Pure orchestration; the Host entry wires the
 * services and the scheduler.
 * @module dsh-daily-report/engine
 */

import { spawn } from 'node:child_process'
import { collectDay } from './collect/sessions.js'
import { readHostDay } from './collect/heartbeat.js'
import { fetchWeather, geocode } from './collect/weather.js'
import { summarizeDay } from './summarize.js'
import { buildDailyReport, buildPeriodReport, previousWeekRange, previousMonthRange } from './analyze/report.js'
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

/** Resolve weather coordinates, geocoding the configured name once and caching it. */
async function weatherFor(cfg, dateStr, log) {
  if (!cfg.weather || !cfg.weather.enabled) return null
  let { latitude, longitude, location } = cfg.weather
  if ((latitude === null || longitude === null) && location) {
    const g = await geocode(location)
    if (g && g[0]) { latitude = g[0].latitude; longitude = g[0].longitude; location = g[0].name }
  }
  if (latitude === null || longitude === null || latitude === undefined) return null
  const cacheFile = path.join(DATA_DIR, 'cache', 'weather.json')
  const cache = (await readJson(cacheFile, {})) || {}
  const key = dateStr + '@' + latitude.toFixed(2) + ',' + longitude.toFixed(2)
  // Today's forecast refreshes hourly; past days never change.
  const fresh = cache[key] && (dateStr < fmtDate(Date.now()) || Date.now() - cache[key].at < 3600000)
  if (fresh) return cache[key].value
  const value = await fetchWeather({ latitude, longitude, location: location || '', dateStr })
  if (value) {
    cache[key] = { at: Date.now(), value }
    const keys = Object.keys(cache).sort().slice(-30)
    try { await writeJson(cacheFile, Object.fromEntries(keys.map((k) => [k, cache[k]]))) } catch (err) { log('weather cache: ' + String(err)) }
  }
  return value
}

/**
 * Generate (and persist) the daily report for `dateStr`.
 * @param {object} deps - `{ source, cfg, llm, agentDefaultModel, currentBootId, readIdleDay, log }`.
 * @param {string} dateStr
 * @returns {Promise<{report:object, markdown:string, html:string, files:object, facts:object, llmCalls:number}>}
 */
export async function generateDaily(deps, dateStr) {
  const { cfg } = deps
  const log = deps.log || (() => {})
  const facts = await collectDay(deps.source, dateStr, { includeSubagents: cfg.includeSubagents, pricing: cfg.pricing, log })
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
  const sum = await summarizeDay(facts, cfg, { llm: deps.llm, agentDefaultModel: deps.agentDefaultModel, log })
  facts.oneLiner = sum.oneLiner
  await store.saveFacts(facts)
  const history = await store.loadHistory(dateStr, 7)
  const report = buildDailyReport(facts, history, cfg, { oneLiner: sum.oneLiner, summaryMode: sum.mode })
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
      '$x=New-Object Windows.Data.Xml.Dom.XmlDocument;$x.LoadXml(\'' + xml.replace(/'/g, "''") + '\');' +
      // PowerShell's own AppUserModelID is registered on every Windows install, so the toast shows without an installer.
      '[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier(\'{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe\').Show([Windows.UI.Notifications.ToastNotification]::new($x))'
    return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')])
  } else if (platform === 'darwin') {
    const q = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    return run('osascript', ['-e', 'display notification "' + q(message) + '" with title "' + q(title) + '"'])
  } else if (platform === 'linux') {
    return run('notify-send', [title, message])
  }
  return Promise.resolve({ ok: false, status: 'unsupported' })
}
