/**
 * Plugin settings: one JSON document in `~/.dsh/dsh-daily-report/config.json`
 * (mode 0600). Every field is validated and clamped on load and on patch, so
 * the Host, the settings page and the model-facing tool share one fact source.
 *
 * The three "decide first" questions of the design doc (§8) are settings:
 *   privacy        A cloud / B local-only / C local-model   (§8.1)
 *   inputSampling  keyboard/mouse idle sampling on/off         (§8.2)
 *   delivery       fixed-time / first-open / both              (§8.3)
 * @module dsh-daily-report/config
 */

import path from 'node:path'
import { DATA_DIR, readJson, writeJson, pad } from './util.js'
import { DEFAULT_PRICING } from './analyze/cost.js'

export const CONFIG_FILE = path.join(DATA_DIR, 'config.json')

export const DEFAULTS = Object.freeze({
  version: 1,
  // §8.1 privacy boundary
  privacy: 'local-only', // 'cloud' | 'local-only' | 'local-model'
  cloudRoute: null, // { provider, model } | null → DSH default model
  localModel: { baseUrl: 'http://127.0.0.1:11434/v1', model: '', apiKey: '', allowLan: false, timeoutMs: 120000 },
  // §8.2 keyboard/mouse idle sampling
  inputSampling: false,
  // §8.3 delivery
  delivery: 'both', // 'fixed' | 'first-open' | 'both'
  deliveryTime: '09:00',
  reportRange: 'auto', // 'auto' (before 18:00 → yesterday) | 'yesterday' | 'today'
  popup: true, // morning card above the hero logo
  systemNotify: true, // Windows toast / macOS / Linux notification when generated at fixed time
  // data sources
  weather: { enabled: true, location: '', latitude: null, longitude: null },
  heartbeat: true,
  includeSubagents: false,
  // sections
  health: { enabled: true, sitLimitMin: 50, lateHour: 23, liveReminder: true },
  budget: { dailyCny: 0, dailyTokens: 0 },
  pricing: DEFAULT_PRICING,
  weekly: { enabled: true, weekday: 1 }, // 1 = Monday shows last week
  monthly: { enabled: true, day: 1 },
  reportsDir: '', // empty → DATA_DIR/reports; absolute custom report root
  retentionDays: 180,
  announceToAgent: true,
})

const PRIVACY = new Set(['cloud', 'local-only', 'local-model'])
const DELIVERY = new Set(['fixed', 'first-open', 'both'])
const RANGE = new Set(['auto', 'yesterday', 'today'])

const bool = (v, d) => (typeof v === 'boolean' ? v : d)
const int = (v, lo, hi, d) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d }
const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d }
const str = (v, max, d) => (typeof v === 'string' ? v.slice(0, max) : d)
const clock = (v, d) => {
  if (typeof v !== 'string') return d
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim())
  if (!m) return d
  const h = Number(m[1]); const mi = Number(m[2])
  return h < 24 && mi < 60 ? pad(h) + ':' + pad(mi) : d
}

/**
 * Validate and normalise a (partial) config against a base.
 * @param {object} input - untrusted object.
 * @param {object} [base=DEFAULTS]
 * @returns {object} complete config.
 */
export function normalizeConfig(input, base = DEFAULTS) {
  const i = input && typeof input === 'object' ? input : {}
  const c = structuredClone(base)
  if (PRIVACY.has(i.privacy)) c.privacy = i.privacy
  if (i.cloudRoute === null) c.cloudRoute = null
  else if (i.cloudRoute && typeof i.cloudRoute === 'object' && typeof i.cloudRoute.provider === 'string' && typeof i.cloudRoute.model === 'string' && i.cloudRoute.provider && i.cloudRoute.model) {
    c.cloudRoute = { provider: i.cloudRoute.provider.slice(0, 200), model: i.cloudRoute.model.slice(0, 200) }
  }
  if (i.localModel && typeof i.localModel === 'object') {
    const l = i.localModel
    c.localModel = {
      baseUrl: str(l.baseUrl, 500, c.localModel.baseUrl),
      model: str(l.model, 200, c.localModel.model),
      apiKey: str(l.apiKey, 500, c.localModel.apiKey),
      allowLan: bool(l.allowLan, c.localModel.allowLan),
      timeoutMs: int(l.timeoutMs, 5000, 600000, c.localModel.timeoutMs),
    }
  }
  c.inputSampling = bool(i.inputSampling, c.inputSampling)
  if (DELIVERY.has(i.delivery)) c.delivery = i.delivery
  c.deliveryTime = clock(i.deliveryTime, c.deliveryTime)
  if (RANGE.has(i.reportRange)) c.reportRange = i.reportRange
  c.popup = bool(i.popup, c.popup)
  c.systemNotify = bool(i.systemNotify, c.systemNotify)
  if (i.weather && typeof i.weather === 'object') {
    const w = i.weather
    c.weather = {
      enabled: bool(w.enabled, c.weather.enabled),
      location: str(w.location, 100, c.weather.location),
      latitude: w.latitude === null ? null : num(w.latitude, -90, 90, c.weather.latitude),
      longitude: w.longitude === null ? null : num(w.longitude, -180, 180, c.weather.longitude),
    }
  }
  c.heartbeat = bool(i.heartbeat, c.heartbeat)
  c.includeSubagents = bool(i.includeSubagents, c.includeSubagents)
  if (i.health && typeof i.health === 'object') {
    c.health = {
      enabled: bool(i.health.enabled, c.health.enabled),
      sitLimitMin: int(i.health.sitLimitMin, 20, 180, c.health.sitLimitMin),
      lateHour: int(i.health.lateHour, 20, 26, c.health.lateHour),
      liveReminder: bool(i.health.liveReminder, c.health.liveReminder),
    }
  }
  if (i.budget && typeof i.budget === 'object') {
    c.budget = {
      dailyCny: num(i.budget.dailyCny, 0, 100000, c.budget.dailyCny),
      dailyTokens: int(i.budget.dailyTokens, 0, 1e11, c.budget.dailyTokens),
    }
  }
  if (i.pricing && typeof i.pricing === 'object') {
    const p = i.pricing
    const b = c.pricing
    c.pricing = {
      currency: 'CNY',
      inputPerM: num(p.inputPerM, 0, 1000, b.inputPerM),
      outputPerM: num(p.outputPerM, 0, 1000, b.outputPerM),
      cacheReadPerM: num(p.cacheReadPerM, 0, 1000, b.cacheReadPerM),
      cacheWritePerM: num(p.cacheWritePerM, 0, 1000, b.cacheWritePerM),
      offpeakDiscount: num(p.offpeakDiscount, 0, 1, b.offpeakDiscount),
      offpeak: {
        start: clock(p.offpeak && p.offpeak.start, b.offpeak.start),
        end: clock(p.offpeak && p.offpeak.end, b.offpeak.end),
      },
    }
  }
  if (i.weekly && typeof i.weekly === 'object') c.weekly = { enabled: bool(i.weekly.enabled, c.weekly.enabled), weekday: int(i.weekly.weekday, 0, 6, c.weekly.weekday) }
  if (i.monthly && typeof i.monthly === 'object') c.monthly = { enabled: bool(i.monthly.enabled, c.monthly.enabled), day: int(i.monthly.day, 1, 28, c.monthly.day) }
  if (typeof i.reportsDir === 'string') {
    const v = i.reportsDir.trim()
    if (!v || (path.isAbsolute(v) && !v.includes('\0'))) c.reportsDir = v ? path.resolve(v) : ''
  }
  c.retentionDays = int(i.retentionDays, 7, 3650, c.retentionDays)
  c.announceToAgent = bool(i.announceToAgent, c.announceToAgent)
  return c
}

/** Persistent config store with in-memory cache and change listeners. */
export class ConfigStore {
  constructor(file = CONFIG_FILE) {
    this.file = file
    this.value = null
    this.listeners = new Set()
  }

  async load() {
    if (this.value) return this.value
    this.value = normalizeConfig(await readJson(this.file, {}), DEFAULTS)
    return this.value
  }

  async patch(input) {
    if (input?.reportsDir !== undefined) {
      const v = typeof input.reportsDir === 'string' ? input.reportsDir.trim() : null
      if (v === null || (v && (!path.isAbsolute(v) || v.includes('\0')))) throw new Error('报告保存目录必须是绝对路径；留空可恢复默认')
    }
    const prev = await this.load()
    const next = normalizeConfig(input, prev)
    await writeJson(this.file, next, 0o600)
    this.value = next
    for (const fn of this.listeners) { try { fn(next, prev) } catch { /* listener error */ } }
    return next
  }

  onChange(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
}

/** Copy safe to send to the browser (API key masked). */
export function publicConfig(c) {
  return { ...c, localModel: { ...c.localModel, apiKey: c.localModel.apiKey ? '••••••' : '' } }
}

/** Strip the masked placeholder so it never overwrites a real key. */
export function sanitizeIncoming(patch) {
  if (patch && patch.localModel && patch.localModel.apiKey === '••••••') {
    const { apiKey, ...rest } = patch.localModel
    return { ...patch, localModel: rest }
  }
  return patch
}
