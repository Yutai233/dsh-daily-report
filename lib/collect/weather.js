/**
 * Open-Meteo 天气采集器（免费、无需 API key）。
 *
 * 用全局 `fetch` + `AbortController` 超时；任何网络/解析失败都返回 `null`
 * （`geocode` 返回 `[]`），绝不抛错。
 *
 * @module dsh-daily-report/collect/weather
 */

import { isDateStr } from '../util.js'

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality'

/** WMO 天气码 → [中文描述, icon]；0–99 的完整映射。 */
const WMO = new Map([
  [0, ['晴', 'sun']],
  [1, ['大部晴朗', 'sun']],
  [2, ['多云', 'cloud']],
  [3, ['阴', 'cloud']],
  [45, ['雾', 'fog']],
  [48, ['雾', 'fog']],
  [51, ['毛毛雨', 'drizzle']],
  [53, ['毛毛雨', 'drizzle']],
  [55, ['毛毛雨', 'drizzle']],
  [56, ['冻毛毛雨', 'drizzle']],
  [57, ['冻毛毛雨', 'drizzle']],
  [61, ['小雨', 'rain']],
  [63, ['中雨', 'rain']],
  [65, ['大雨', 'rain']],
  [66, ['冻雨', 'rain']],
  [67, ['冻雨', 'rain']],
  [71, ['小雪', 'snow']],
  [73, ['中雪', 'snow']],
  [75, ['大雪', 'snow']],
  [77, ['雪粒', 'snow']],
  [80, ['阵雨', 'rain']],
  [81, ['阵雨', 'rain']],
  [82, ['阵雨', 'rain']],
  [85, ['阵雪', 'snow']],
  [86, ['阵雪', 'snow']],
  [95, ['雷阵雨', 'storm']],
  [96, ['雷阵雨伴冰雹', 'storm']],
  [99, ['雷阵雨伴冰雹', 'storm']],
])

/** 雨（含冻雨/阵雨/雷雨）类天气码。 */
const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99])
/** 雪（含阵雪/雪粒）类天气码。 */
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86])
/** 雷雨类天气码。 */
const STORM_CODES = new Set([95, 96, 99])

/**
 * WMO 天气码 → 中文描述与图标。
 * @param {number} code WMO weather code（0–99）。
 * @returns {{ text: string, icon: 'sun'|'cloud'|'fog'|'drizzle'|'rain'|'snow'|'storm' }}
 *   未知码返回 `{ text: '未知', icon: 'cloud' }`。
 */
export function weatherText(code) {
  const hit = WMO.get(Number(code))
  return hit ? { text: hit[0], icon: hit[1] } : { text: '未知', icon: 'cloud' }
}

/**
 * 带超时地请求一个 JSON 接口；失败（网络、超时、非 2xx、解析）一律返回 `null`。
 * @param {string} url
 * @param {typeof fetch} fetchImpl
 * @param {number} timeoutMs
 * @returns {Promise<any | null>}
 */
async function requestJson(url, fetchImpl, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1, Number(timeoutMs) || 8000))
  if (typeof timer.unref === 'function') timer.unref()
  try {
    const res = await fetchImpl(url, { signal: controller.signal })
    if (!res || res.ok === false) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 地名 → 经纬度候选（Open-Meteo geocoding）。
 * @param {string} name 地名，如 `'上海'`。
 * @param {object} [options]
 * @param {string} [options.lang='zh'] 结果语言。
 * @param {typeof fetch} [options.fetchImpl=fetch] 可注入的 fetch（测试用）。
 * @param {number} [options.timeoutMs=8000] 请求超时（毫秒）。
 * @returns {Promise<Array<{ name: string, admin1: string, country: string, latitude: number, longitude: number }>>}
 *   失败或无结果时返回 `[]`，绝不抛错。
 */
export async function geocode(name, { lang = 'zh', fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  if (typeof name !== 'string' || !name.trim()) return []
  const query = new URLSearchParams({
    name,
    count: '5',
    language: lang || 'zh',
    format: 'json',
  })
  const data = await requestJson(GEOCODE_URL + '?' + query.toString(), fetchImpl, timeoutMs)
  const results = Array.isArray(data && data.results) ? data.results : []
  const out = []
  for (const item of results) {
    if (!item || typeof item !== 'object') continue
    const latitude = Number(item.latitude)
    const longitude = Number(item.longitude)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue
    out.push({
      name: item.name ? String(item.name) : name,
      admin1: item.admin1 ? String(item.admin1) : '',
      country: item.country ? String(item.country) : '',
      latitude,
      longitude,
    })
  }
  return out
}

/**
 * 从 `daily` 数组里取某天的数值；非有限数返回 `null`。
 * @param {any[] | undefined} arr
 * @param {number} idx
 * @returns {number | null}
 */
function valueAt(arr, idx) {
  if (!Array.isArray(arr) || idx < 0 || idx >= arr.length) return null
  const value = arr[idx]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * 拉取某地某天的天气（Open-Meteo forecast + air-quality）。
 *
 * `deltaMax = 当天最高温 − 前一天最高温`（用 `past_days=1` 取前一天），四舍五入为整数。
 * 温度四舍五入取整；AQI 取 `us_aqi`，空气接口失败时 `aqi=null`。
 * `tips` 只在需要注意时给：降水概率≥50 或雨/雪/雷 → 带伞/防滑；降温≥5°C → 添衣；
 * AQI>100 → 少开窗；tMax≥35 → 防暑；tMin≤0 → 防结冰。
 *
 * @param {object} options
 * @param {number} options.latitude
 * @param {number} options.longitude
 * @param {string} [options.location] 地名，原样写回 `location`。
 * @param {string} options.dateStr `YYYY-MM-DD`（本地日期，需在 daily.time 中）。
 * @param {typeof fetch} [options.fetchImpl=fetch] 可注入的 fetch（测试用）。
 * @param {number} [options.timeoutMs=8000] 单次请求超时（毫秒）。
 * @returns {Promise<{ location: string|null, date: string, code: number, text: string, icon: string, tMin: number, tMax: number, precipProb: number, precipMm: number, deltaMax: number|null, aqi: number|null, tips: string[] } | null>}
 *   坐标/日期非法、预报请求失败或响应里没有该日期时返回 `null`，绝不抛错。
 */
export async function fetchWeather({
  latitude,
  longitude,
  location,
  dateStr,
  fetchImpl = fetch,
  timeoutMs = 8000,
} = {}) {
  const lat = Number(latitude)
  const lon = Number(longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (!isDateStr(dateStr)) return null

  const forecastQuery = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum',
    timezone: 'auto',
    past_days: '1',
    forecast_days: '2',
  })
  const forecast = await requestJson(FORECAST_URL + '?' + forecastQuery.toString(), fetchImpl, timeoutMs)
  const daily = forecast && forecast.daily
  if (!daily || !Array.isArray(daily.time)) return null

  const idx = daily.time.indexOf(dateStr)
  if (idx < 0) return null

  const code = valueAt(daily.weather_code, idx)
  const tMaxRaw = valueAt(daily.temperature_2m_max, idx)
  const tMinRaw = valueAt(daily.temperature_2m_min, idx)
  if (code === null || tMaxRaw === null || tMinRaw === null) return null

  const tMax = Math.round(tMaxRaw)
  const tMin = Math.round(tMinRaw)

  // 前一天最高温：daily.time 里 dateStr 的下标 -1。
  const prevMaxRaw = valueAt(daily.temperature_2m_max, idx - 1)
  const deltaMax = prevMaxRaw === null ? null : Math.round(tMaxRaw - prevMaxRaw)

  const precipProbRaw = valueAt(daily.precipitation_probability_max, idx)
  const precipProb = precipProbRaw === null ? 0 : Math.round(precipProbRaw)
  const precipMmRaw = valueAt(daily.precipitation_sum, idx)
  const precipMm = precipMmRaw === null ? 0 : Math.round(precipMmRaw * 10) / 10

  const airQuery = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'us_aqi',
    timezone: 'auto',
  })
  const air = await requestJson(AIR_QUALITY_URL + '?' + airQuery.toString(), fetchImpl, timeoutMs)
  const aqiRaw = air && air.current ? air.current.us_aqi : null
  const aqi = typeof aqiRaw === 'number' && Number.isFinite(aqiRaw) ? Math.round(aqiRaw) : null

  const { text, icon } = weatherText(code)
  const tips = []
  if (STORM_CODES.has(code)) tips.push('有雷阵雨，注意防范')
  else if (SNOW_CODES.has(code)) tips.push('有雪，注意防滑保暖')
  else if (RAIN_CODES.has(code)) tips.push('有雨，记得带伞')
  else if (precipProb >= 50) tips.push('降水概率 ' + precipProb + '%，记得带伞')
  if (deltaMax !== null && deltaMax <= -5) tips.push('比昨天降温 ' + Math.abs(deltaMax) + '°C，注意添衣')
  if (aqi !== null && aqi > 100) tips.push('空气较差（AQI ' + aqi + '），少开窗')
  if (tMax >= 35) tips.push('最高 ' + tMax + '°C，注意防暑补水')
  if (tMin <= 0) tips.push('最低 ' + tMin + '°C，注意保暖防结冰')

  return {
    location: typeof location === 'string' && location ? location : null,
    date: dateStr,
    code,
    text,
    icon,
    tMin,
    tMax,
    precipProb,
    precipMm,
    deltaMax,
    aqi,
    tips,
  }
}
