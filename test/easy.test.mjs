/**
 * 临时自测：heartbeat / weather / cost 三个模块。
 * 运行：node test/easy-selftest.mjs
 * 只使用 node:assert 与临时目录，不碰真实 DATA_DIR。
 */

import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { createHeartbeat, readHostDay } from '../lib/collect/heartbeat.js'
import { fetchWeather, geocode, weatherText } from '../lib/collect/weather.js'
import { DEFAULT_PRICING, analyzeCost, costOf, isOffpeak } from '../lib/analyze/cost.js'
import { addDays, appendLine, fmtDate, readLines } from '../lib/util.js'

const assertEq = (actual, expected, label) => {
  assert.deepEqual(actual, expected, label)
  console.log('  ✓ ' + label)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime()

// ---------------------------------------------------------------------------
console.log('[1] heartbeat: readHostDay 手写 jsonl（含跨午夜）')
{
  const dataDir = await mkdtemp(path.join(tmpdir(), 'dsh-hb-'))
  const dateStr = '2026-11-12'
  const prevDate = addDays(dateStr, -1)
  const hb = (d) => path.join(dataDir, 'heartbeat', d + '.jsonl')

  // bootNight：前一天 23:40 启动，跨零点心跳到当天 01:00
  await appendLine(hb(prevDate), { bootId: 'bootNight', t: at(2026, 11, 11, 23, 40), kind: 'start' })
  await appendLine(hb(prevDate), { bootId: 'bootNight', t: at(2026, 11, 11, 23, 50), kind: 'beat' })
  await appendLine(hb(prevDate), { bootId: 'bootNight', t: at(2026, 11, 11, 23, 59), kind: 'beat' })
  await appendLine(hb(dateStr), { bootId: 'bootNight', t: at(2026, 11, 12, 0, 10), kind: 'beat' })
  await appendLine(hb(dateStr), { bootId: 'bootNight', t: at(2026, 11, 12, 1, 0), kind: 'beat' })

  // bootDay：当天 08:00–09:00
  await appendLine(hb(dateStr), { bootId: 'bootDay', t: at(2026, 11, 12, 8, 0), kind: 'start' })
  await appendLine(hb(dateStr), { bootId: 'bootDay', t: at(2026, 11, 12, 8, 30), kind: 'beat' })
  await appendLine(hb(dateStr), { bootId: 'bootDay', t: at(2026, 11, 12, 9, 0), kind: 'beat' })

  // bootNoStart：只有 beat，start 取首条记录的 t
  await appendLine(hb(dateStr), { bootId: 'bootNoStart', t: at(2026, 11, 12, 10, 0), kind: 'beat' })
  await appendLine(hb(dateStr), { bootId: 'bootNoStart', t: at(2026, 11, 12, 10, 20), kind: 'beat' })

  const host = await readHostDay(dataDir, dateStr)
  assert.ok(host, 'host 不为 null')
  assertEq(host.boots.length, 3, 'boot 数量 3')
  assertEq(host.boots.map((b) => b.bootId), ['bootNight', 'bootDay', 'bootNoStart'], 'boot 按 start 升序')
  assertEq(host.firstStart, at(2026, 11, 11, 23, 40), 'firstStart 为最早 start（跨午夜 boot）')
  assertEq(host.onlineMs, 3600000 + 3600000 + 1200000, 'onlineMs = 三个区间裁剪到当天的并集')
  assertEq(host.boots[0].end, at(2026, 11, 12, 1, 0), 'bootNight 的 end 为最后一条心跳')
  assertEq(host.boots[0].endKind, 'beat', '非当前 boot endKind=beat')
  assertEq(host.boots[1].start, at(2026, 11, 12, 8, 0), 'bootDay start')
  assertEq(host.boots[2].start, at(2026, 11, 12, 10, 0), '无 start 记录时取首条记录')

  // 当前进程：running，end 至少是最近一条记录或 now
  const running = await readHostDay(dataDir, dateStr, 'bootDay')
  assertEq(running.boots.find((b) => b.bootId === 'bootDay').endKind, 'running', 'currentBootId → running')
  assert.ok(running.onlineMs >= 3600000 + 3600000 + 1200000, 'running 使当天在线时长不减少')

  assertEq(await readHostDay(dataDir, '2026-10-01'), null, '无记录 → null')
  assertEq(await readHostDay(dataDir, 'bad'), null, '非法日期 → null')

  // 并集去重：同一天两个重叠的 boot 只算一次
  const overlapDir = await mkdtemp(path.join(tmpdir(), 'dsh-hb2-'))
  const overlapFile = path.join(overlapDir, 'heartbeat', dateStr + '.jsonl')
  await appendLine(overlapFile, { bootId: 'overlapA', t: at(2026, 11, 12, 8, 0), kind: 'start' })
  await appendLine(overlapFile, { bootId: 'overlapA', t: at(2026, 11, 12, 10, 0), kind: 'beat' })
  await appendLine(overlapFile, { bootId: 'overlapB', t: at(2026, 11, 12, 9, 0), kind: 'start' })
  await appendLine(overlapFile, { bootId: 'overlapB', t: at(2026, 11, 12, 11, 0), kind: 'beat' })
  const overlap = await readHostDay(overlapDir, dateStr)
  assertEq(overlap.boots.length, 2, '重叠 boot 都保留')
  assertEq(overlap.onlineMs, 3 * 3600000, '重叠区间按并集算（3h，不是 4h）')
  await rm(overlapDir, { recursive: true, force: true })

  await rm(dataDir, { recursive: true, force: true })
}

// ---------------------------------------------------------------------------
console.log('[2] heartbeat: createHeartbeat 真实写 start + beats')
{
  const dataDir = await mkdtemp(path.join(tmpdir(), 'dsh-hb-live-'))
  const hb = createHeartbeat({ dataDir, intervalMs: 20 })
  assert.match(hb.bootId, /^[0-9a-f-]{36}$/, 'bootId 是 UUID')
  await hb.start()
  await sleep(150)
  hb.stop()
  hb.stop() // 幂等

  const today = fmtDate(Date.now())
  const lines = await readLines(path.join(dataDir, 'heartbeat', today + '.jsonl'))
  assert.ok(lines.length >= 2, '至少 start + 1 条 beat，实际 ' + lines.length)
  assertEq(lines[0].kind, 'start', '首条为 start')
  assertEq(lines[0].t, hb.startedAt, 'start.t = startedAt')
  assert.ok(lines.slice(1).every((l) => l.kind === 'beat'), '其余为 beat')
  assert.ok(lines.every((l) => l.bootId === hb.bootId), 'bootId 一致')

  const host = await readHostDay(dataDir, today, hb.bootId)
  assert.ok(host && host.boots.length === 1, '读到 1 个 boot')
  assertEq(host.boots[0].start, hb.startedAt, 'start 与 startedAt 对齐')
  assertEq(host.boots[0].endKind, 'running', '当前进程 endKind=running')
  assert.ok(host.boots[0].end >= hb.startedAt, 'running end ≥ start')
  assert.ok(host.onlineMs >= 0, 'onlineMs 非负')

  // 非法 intervalMs 不写 start，也不抛错
  const badDir = await mkdtemp(path.join(tmpdir(), 'dsh-hb-bad-'))
  const bad = createHeartbeat({ dataDir: badDir, intervalMs: 0 })
  await bad.start()
  bad.stop()
  assertEq(await readHostDay(badDir, fmtDate(Date.now()), bad.bootId), null, 'intervalMs=0 不产生记录')

  await rm(dataDir, { recursive: true, force: true })
  await rm(badDir, { recursive: true, force: true })
}

// ---------------------------------------------------------------------------
console.log('[3] weather: WMO 映射')
{
  const cases = [
    [0, '晴', 'sun'],
    [1, '大部晴朗', 'sun'],
    [2, '多云', 'cloud'],
    [3, '阴', 'cloud'],
    [45, '雾', 'fog'],
    [48, '雾', 'fog'],
    [51, '毛毛雨', 'drizzle'],
    [53, '毛毛雨', 'drizzle'],
    [55, '毛毛雨', 'drizzle'],
    [56, '冻毛毛雨', 'drizzle'],
    [57, '冻毛毛雨', 'drizzle'],
    [61, '小雨', 'rain'],
    [63, '中雨', 'rain'],
    [65, '大雨', 'rain'],
    [66, '冻雨', 'rain'],
    [67, '冻雨', 'rain'],
    [71, '小雪', 'snow'],
    [73, '中雪', 'snow'],
    [75, '大雪', 'snow'],
    [77, '雪粒', 'snow'],
    [80, '阵雨', 'rain'],
    [81, '阵雨', 'rain'],
    [82, '阵雨', 'rain'],
    [85, '阵雪', 'snow'],
    [86, '阵雪', 'snow'],
    [95, '雷阵雨', 'storm'],
    [96, '雷阵雨伴冰雹', 'storm'],
    [99, '雷阵雨伴冰雹', 'storm'],
  ]
  for (const [code, text, icon] of cases) {
    assertEq(weatherText(code), { text, icon }, 'weatherText(' + code + ')')
  }
  assertEq(weatherText(123), { text: '未知', icon: 'cloud' }, 'weatherText(123)')
  assertEq(weatherText(undefined), { text: '未知', icon: 'cloud' }, 'weatherText(undefined)')
}

// ---------------------------------------------------------------------------
console.log('[4] weather: fetchWeather / geocode（注入假 fetch）')
{
  const dateStr = '2026-11-12'
  const forecast = {
    daily: {
      time: ['2026-11-11', '2026-11-12', '2026-11-13'],
      weather_code: [3, 61, 0],
      temperature_2m_max: [20.4, 13.6, 15.2],
      temperature_2m_min: [10.4, 8.6, 7.1],
      precipitation_probability_max: [10, 80, 0],
      precipitation_sum: [0, 3.24, 0],
    },
  }
  const calls = []
  const fakeFetch = async (url) => {
    calls.push(String(url))
    if (String(url).includes('air-quality')) {
      return { ok: true, json: async () => ({ current: { us_aqi: 138 } }) }
    }
    return { ok: true, json: async () => forecast }
  }

  const w = await fetchWeather({
    latitude: 32.060255,
    longitude: 118.796877,
    location: '上海',
    dateStr,
    fetchImpl: fakeFetch,
  })
  assert.ok(w, 'fetchWeather 返回对象')
  assertEq(calls.length, 2, '请求 forecast + air-quality 两次')
  assert.ok(calls[0].startsWith('https://api.open-meteo.com/v1/forecast?'), 'forecast URL')
  assert.ok(calls[0].includes('past_days=1'), 'past_days=1')
  assert.ok(calls[0].includes('forecast_days=2'), 'forecast_days=2')
  assert.ok(calls[0].includes('timezone=auto'), 'timezone=auto')
  assertEq(w.code, 61, 'code')
  assertEq(w.text, '小雨', 'text')
  assertEq(w.icon, 'rain', 'icon')
  assertEq(w.tMax, 14, 'tMax 四舍五入')
  assertEq(w.tMin, 9, 'tMin 四舍五入')
  assertEq(w.deltaMax, -7, 'deltaMax = round(13.6-20.4)')
  assertEq(w.precipProb, 80, 'precipProb')
  assertEq(w.precipMm, 3.2, 'precipMm 一位小数')
  assertEq(w.aqi, 138, 'aqi')
  assertEq(w.location, '上海', 'location')
  assertEq(w.date, dateStr, 'date')
  assertEq(w.tips, ['记得带伞', '比昨天降温 7°C', '空气较差（AQI 138）'], 'tips')

  // 空气接口失败：aqi=null，天气仍然可用
  const airFail = async (url) => {
    if (String(url).includes('air-quality')) return { ok: false, status: 500, json: async () => ({}) }
    return { ok: true, json: async () => forecast }
  }
  const w2 = await fetchWeather({ latitude: 32, longitude: 118, dateStr, fetchImpl: airFail })
  assertEq(w2.aqi, null, '空气接口失败 → aqi=null')
  assert.ok(w2.tips.length === 2, '空气失败时其余 tips 保留')
  assertEq(w2.location, null, '未传 location → null')

  // 城市/日期不存在、网络异常 → null
  const noDate = await fetchWeather({ latitude: 32, longitude: 118, dateStr: '2026-12-31', fetchImpl: fakeFetch })
  assertEq(noDate, null, 'daily.time 无该日期 → null')
  assertEq(await fetchWeather({ latitude: 'x', longitude: 118, dateStr, fetchImpl: fakeFetch }), null, '坐标非法 → null')
  assertEq(await fetchWeather({ latitude: 32, longitude: 118, dateStr: 'bad' }), null, '日期非法 → null')
  assertEq(
    await fetchWeather({
      latitude: 32,
      longitude: 118,
      dateStr,
      fetchImpl: async () => {
        throw new Error('network down')
      },
    }),
    null,
    '网络异常 → null',
  )

  // geocode
  const geoCalls = []
  const geoOk = async (url) => {
    geoCalls.push(String(url))
    return {
      ok: true,
      json: async () => ({
        results: [
          { name: '上海', admin1: '上海市', country: '中国', latitude: 31.2304, longitude: 121.4737 },
          { name: '上海', admin1: 'X', country: 'Y', latitude: 0, longitude: 0 },
          { name: '坏数据' },
        ],
      }),
    }
  }
  const list = await geocode('上海', { fetchImpl: geoOk })
  assertEq(list.length, 2, '过滤无坐标结果')
  assertEq(list[0], { name: '上海', admin1: '上海市', country: '中国', latitude: 31.2304, longitude: 121.4737 }, 'geocode 映射')
  assert.ok(geoCalls[0].includes('name=' + encodeURIComponent('上海')), 'geocode 编码地名')
  assert.ok(geoCalls[0].includes('count=5') && geoCalls[0].includes('language=zh'), 'geocode 参数')
  assertEq(await geocode('上海', { fetchImpl: async () => { throw new Error('x') } }), [], 'geocode 异常 → []')
  assertEq(await geocode('上海', { fetchImpl: async () => ({ ok: false }) }), [], 'geocode 非 2xx → []')
  assertEq(await geocode(''), [], '空地名 → []')
}

// ---------------------------------------------------------------------------
console.log('[5] cost: costOf / isOffpeak（工作日峰时 + 周末/节假日谷时 + Pro 三倍）')
{
  const weekday = (h, mi) => at(2026, 11, 12, h, mi) // 周四
  const peak = weekday(10, 0)
  const offpeak = weekday(3, 0)

  assertEq(costOf({ inputTokens: 1000000 }, DEFAULT_PRICING), 2, '未命中输入 1M 峰时 = ¥2')
  assertEq(costOf({ inputTokens: 1000000 }, DEFAULT_PRICING, peak), 2, '峰时无折扣')
  assertEq(costOf({ inputTokens: 1000000 }, DEFAULT_PRICING, offpeak), 1, '谷时五折')
  assertEq(
    costOf({ inputTokens: 1000000, outputTokens: 1000000, cacheReadTokens: 1000000, cacheWriteTokens: 1000000 }, DEFAULT_PRICING, peak),
    10.04,
    '三类 token 峰时合计 = 2 + 8 + 0.04（缓存写不单独计价）',
  )
  assertEq(costOf({ outputTokens: 1000000 }, DEFAULT_PRICING, peak), 8, '输出 1M 峰时 = ¥8')
  assertEq(costOf({ cacheReadTokens: 1000000 }, DEFAULT_PRICING, offpeak), 0.02, '缓存命中 1M 谷时 = ¥0.02')
  assertEq(costOf({}, DEFAULT_PRICING), 0, '空 usage = 0')
  assertEq(costOf(null, DEFAULT_PRICING), 0, 'null usage = 0')
  assertEq(costOf({ outputTokens: 1000000 }, DEFAULT_PRICING, peak, 'deepseek-v4-pro'), 24, 'Pro 输出 1M 峰时 = 8 × 3')
  assertEq(costOf({ outputTokens: 1000000 }, DEFAULT_PRICING, offpeak, 'deepseek-v4-pro'), 12, 'Pro 输出 1M 谷时 = 4 × 3')
  assertEq(costOf({ outputTokens: 1000000 }, DEFAULT_PRICING, peak, 'deepseek-v4-flash'), 8, 'Flash 不放大')
  assertEq(costOf({ outputTokens: 1000000 }, DEFAULT_PRICING, peak, 'custom-model'), 8, '未知模型按 Flash')

  // 峰时边界：09:00–12:00、14:00–18:00（不含右端点）
  const checks = [
    [weekday(8, 59), true], [weekday(9, 0), false], [weekday(11, 59), false],
    [weekday(12, 0), true], [weekday(13, 59), true], [weekday(14, 0), false],
    [weekday(17, 59), false], [weekday(18, 0), true], [weekday(23, 30), true],
  ]
  for (const [ms, expected] of checks) {
    assertEq(isOffpeak(ms), expected, 'isOffpeak(' + new Date(ms).toTimeString().slice(0, 5) + ') = ' + expected)
  }
  assertEq(isOffpeak(undefined), false, 'isOffpeak(undefined) = false')

  // 周末（11/14 周六、11/15 周日）与法定节假日（10/5 周一 国庆、1/1 元旦）全天谷价
  assertEq(isOffpeak(at(2026, 11, 14, 10, 0)), true, '周六 10:00 为谷时')
  assertEq(isOffpeak(at(2026, 11, 15, 15, 0)), true, '周日 15:00 为谷时')
  assertEq(isOffpeak(at(2026, 10, 5, 10, 0)), true, '国庆假期 10:00 为谷时')
  assertEq(isOffpeak(at(2026, 1, 1, 10, 0)), true, '元旦 10:00 为谷时')
  assertEq(costOf({ outputTokens: 1000000 }, DEFAULT_PRICING, at(2026, 11, 14, 10, 0)), 4, '周六输出 1M = ¥4')
  // 2026-11-13 周五仍按工作日
  assertEq(isOffpeak(at(2026, 11, 13, 10, 0)), false, '周五 10:00 为峰时')
}

// ---------------------------------------------------------------------------
console.log('[6] cost: analyzeCost')
{
  const t = (h, mi) => at(2026, 11, 12, h, mi)
  const facts = {
    totals: {
      costCny: 1.0,
      tokens: { input: 400000, output: 200000, cacheRead: 50000, cacheWrite: 50000, reasoning: 100000, total: 800000 },
    },
    usageEvents: [
      { t: t(10, 0), costCny: 0.5, tokens: 200000, sessionId: 's1', turn: 1 },
      { t: t(11, 0), costCny: 0.3, tokens: 120000, sessionId: 's1', turn: 2 },
      { t: t(3, 0), costCny: 0.2, tokens: 40000, sessionId: 's2', turn: 1 },
    ],
    sessions: [
      { id: 's1', title: '日报插件设计', tokens: { input: 400000, output: 200000, cacheRead: 50000, cacheWrite: 50000, total: 800000 } },
      { id: 's2', title: '检索', tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    ],
  }
  const cost = analyzeCost(facts)
  assertEq(cost.totalCny, 1, 'totalCny 0.5+0.3+0.2')
  assertEq(cost.cacheHitRate, 0.1, 'cacheHitRate = 50k/(400k+50k+50k)')
  assertEq(cost.peakShare, 0.8, 'peakShare = 0.8/1.0')
  assertEq(cost.offpeakSavingCny, 0.4, 'offpeakSaving = 0.8 × 0.5')
  assertEq(cost.priciest, { sessionId: 's1', title: '日报插件设计', turn: 1, costCny: 0.5 }, 'priciest 按 session+turn 聚合')
  assertEq(cost.tips, [
    '80% 用量在峰时（工作日 09:00–12:00、14:00–18:00），其余时间（含周末与法定节假日）按 50% 计，挪过去约省 ¥0.40',
    '缓存命中率仅 10%，长会话尽量复用同一会话可降低成本',
  ], 'tips 两条中文建议')

  // sessionId+turn 聚合：同 turn 两笔应合并
  const merged = analyzeCost({
    usageEvents: [
      { t: t(10, 0), costCny: 0.3, sessionId: 's9', turn: 7 },
      { t: t(10, 1), costCny: 0.35, sessionId: 's9', turn: 7 },
      { t: t(10, 2), costCny: 0.4, sessionId: 's8', turn: 1 },
    ],
    sessions: [{ id: 's9', title: '合并测试' }],
    totals: { tokens: { total: 1000 } },
  })
  assertEq(merged.priciest, { sessionId: 's9', title: '合并测试', turn: 7, costCny: 0.65 }, '同 session+turn 合并后取最大')
  assertEq(merged.totalCny, 1.05, 'totalCny 1.05')

  // 无 tips 的场景
  const quiet = analyzeCost({
    usageEvents: [{ t: t(2, 0), costCny: 0.05, sessionId: 'a', turn: 1 }],
    totals: { tokens: { input: 100000, cacheRead: 90000, cacheWrite: 10000, total: 200000 } },
    sessions: [],
  })
  assertEq(quiet.tips, [], '无意义时 tips 为空')
  assertEq(quiet.peakShare, 0, '全谷时 peakShare=0')

  // 健壮性
  for (const bad of [null, undefined, {}, { usageEvents: 'x', sessions: 3 }]) {
    const result = analyzeCost(bad)
    assertEq(result.totalCny, 0, '健壮性 totalCny=0 (' + JSON.stringify(bad) + ')')
    assertEq(result.priciest, null, '健壮性 priciest=null')
    assertEq(result.tips, [], '健壮性 tips=[]')
  }
  assertEq(analyzeCost({ usageEvents: [{ t: t(10, 0), costCny: 0.5 }] }).totalCny, 0.5, '无 totals 也能算')
}

// ---------------------------------------------------------------------------
console.log('[7] 真实网络（失败不影响结论）')
{
  const net = { geocode: null, geocodeError: null, weather: null, weatherError: null }
  try {
    net.geocode = await geocode('上海')
  } catch (err) {
    net.geocodeError = String(err && err.message ? err.message : err)
  }
  try {
    net.weather = await fetchWeather({
      latitude: 32.060255,
      longitude: 118.796877,
      location: '上海',
      dateStr: fmtDate(Date.now()),
    })
  } catch (err) {
    net.weatherError = String(err && err.message ? err.message : err)
  }
  if (net.geocodeError) console.log('  ! geocode 异常：' + net.geocodeError)
  else if (net.geocode.length === 0) console.log('  ! geocode 无结果（可能无网络）')
  else console.log('  ✓ geocode(上海) →', JSON.stringify(net.geocode[0]))

  if (net.weatherError) console.log('  ! fetchWeather 异常：' + net.weatherError)
  else if (!net.weather) console.log('  ! fetchWeather 返回 null（可能无网络/日期不在预报范围）')
  else {
    const w = net.weather
    console.log('  ✓ fetchWeather →', JSON.stringify(w))
    assert.ok(typeof w.tMax === 'number' && typeof w.tMin === 'number', '联网结果温度是数字')
    assertEq(w.date, fmtDate(Date.now()), '联网结果日期为今天')
  }
}

console.log('\nALL PASS')
