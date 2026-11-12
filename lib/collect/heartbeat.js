/**
 * dsh 启停心跳采集器。
 *
 * 落盘：`<dataDir>/heartbeat/YYYY-MM-DD.jsonl`（按**写入时刻的本地日期**分文件），
 * 每行一个 `{"bootId","t","kind":"start"|"beat"}`。
 * 崩溃安全：不写“关闭”记录，在线时长由最后一条心跳推算。
 *
 * @module dsh-daily-report/collect/heartbeat
 */

import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { addDays, appendLine, dayRange, fmtDate, isDateStr, readLines } from '../util.js'

/** 心跳文件所在子目录名。 */
const HEARTBEAT_DIR = 'heartbeat'

/**
 * 创建一个心跳写入器（进程级单例）。
 *
 * @param {object} options
 * @param {string} options.dataDir 数据根目录，如 `~/.dsh/dsh-daily-report`。
 * @param {number} [options.intervalMs=60000] 心跳间隔（毫秒）。
 * @param {(msg: string) => void} [options.log] 可选日志函数；默认静默。
 * @returns {{ start(): Promise<void>, stop(): void, bootId: string, startedAt: number }}
 *   心跳控制器；`startedAt` 为最近一次 `start()` 的时刻。
 */
export function createHeartbeat({ dataDir, intervalMs = 60000, log } = {}) {
  const bootId = randomUUID()
  const logFn = typeof log === 'function' ? log : () => {}
  let startedAt = Date.now()
  let timer = null
  let started = false

  /** 某个时间戳应写入的 jsonl 路径（按本地日期分文件）。 */
  const fileFor = (ms) => path.join(dataDir, HEARTBEAT_DIR, fmtDate(ms) + '.jsonl')

  /**
   * 追加一条心跳记录。写盘失败只记日志，绝不抛错（采集器不能拖垮插件）。
   * @param {'start'|'beat'} kind
   * @param {number} t
   * @returns {Promise<void>}
   */
  async function record(kind, t) {
    try {
      await appendLine(fileFor(t), { bootId, t, kind })
    } catch (err) {
      logFn('[heartbeat] 写入失败：' + (err && err.message ? err.message : String(err)))
    }
  }

  return {
    bootId,
    /** 最近一次 `start()` 的时刻（毫秒时间戳）。 */
    get startedAt() {
      return startedAt
    },

    /**
     * 写一条 `kind:'start'` 记录，然后每 `intervalMs` 写一条 `kind:'beat'`。
     * 定时器已 `.unref()`，不会阻止进程退出；重复调用不会重复写 start。
     * @returns {Promise<void>}
     */
    async start() {
      if (started) return
      started = true
      if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
        logFn('[heartbeat] intervalMs 无效，跳过心跳定时器')
        return
      }
      startedAt = Date.now()
      await record('start', startedAt)
      timer = setInterval(() => {
        void record('beat', Date.now())
      }, intervalMs)
      if (typeof timer.unref === 'function') timer.unref()
    },

    /**
     * 只清理定时器，不写“关闭”记录；崩溃安全依赖最后一条心跳。
     * @returns {void}
     */
    stop() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    },
  }
}

/**
 * 把若干 `[lo, hi)` 区间裁剪到 `[start, end)` 后求并集长度。
 * @param {Array<[number, number]>} intervals
 * @param {number} start
 * @param {number} end
 * @returns {number} 并集毫秒数。
 */
function unionMs(intervals, start, end) {
  const clipped = []
  for (const [lo0, hi0] of intervals) {
    const lo = Math.max(lo0, start)
    const hi = Math.min(hi0, end)
    if (hi > lo) clipped.push([lo, hi])
  }
  clipped.sort((a, b) => a[0] - b[0])
  let total = 0
  let curLo = null
  let curHi = null
  for (const [lo, hi] of clipped) {
    if (curLo === null) {
      curLo = lo
      curHi = hi
    } else if (lo <= curHi) {
      if (hi > curHi) curHi = hi
    } else {
      total += curHi - curLo
      curLo = lo
      curHi = hi
    }
  }
  if (curLo !== null) total += curHi - curLo
  return total
}

/**
 * 读取某一天的心跳，汇总为 `DayFacts.host`。
 *
 * 读取 `dateStr` 与**前一天**的 jsonl（覆盖跨零点的 boot），按 `bootId` 分组：
 * - `start`：该组首条 `start` 记录（没有则取首条记录）的 `t`；
 * - `end`：该组最后一条记录的 `t`（传入 `currentBootId` 且匹配时视为仍在运行，`end=Date.now()`）；
 * - 只保留与当天 `[start, end)` 有交集的 boot（当天仅有一条 start 记录的 boot 也保留，
 *   区间长度为 0 但不丢数据）；`onlineMs` 为各 boot 区间裁剪到当天后的并集长度；
 * - `firstStart` 为保留下来的 boot 中最早的 `start`。
 *
 * @param {string} dataDir 数据根目录。
 * @param {string} dateStr `YYYY-MM-DD`（本地日期）。
 * @param {string} [currentBootId] 当前进程的 bootId；匹配则 `endKind:'running'`。
 * @returns {Promise<{ boots: Array<{ bootId: string, start: number, end: number, endKind: 'beat'|'running' }>, firstStart: number, onlineMs: number } | null>}
 *   没有任何记录（或没有落在当天的 boot）时返回 `null`。
 */
export async function readHostDay(dataDir, dateStr, currentBootId) {
  if (!isDateStr(dateStr)) return null
  const day = dayRange(dateStr)
  if (!Number.isFinite(day.start) || !Number.isFinite(day.end)) return null

  const files = [
    path.join(dataDir, HEARTBEAT_DIR, addDays(dateStr, -1) + '.jsonl'),
    path.join(dataDir, HEARTBEAT_DIR, dateStr + '.jsonl'),
  ]

  /** @type {Array<{bootId: string, t: number, kind: 'start'|'beat'}>} */
  const records = []
  for (const file of files) {
    for (const raw of await readLines(file)) {
      if (!raw || typeof raw !== 'object') continue
      const t = Number(raw.t)
      if (!Number.isFinite(t)) continue
      const bootId = typeof raw.bootId === 'string' && raw.bootId ? raw.bootId : 'unknown'
      records.push({ bootId, t, kind: raw.kind === 'start' ? 'start' : 'beat' })
    }
  }
  if (records.length === 0) return null

  records.sort((a, b) => a.t - b.t)

  /** @type {Map<string, {bootId: string, start: number|null, firstT: number, end: number}>} */
  const groups = new Map()
  for (const rec of records) {
    let group = groups.get(rec.bootId)
    if (!group) {
      group = { bootId: rec.bootId, start: null, firstT: rec.t, end: rec.t }
      groups.set(rec.bootId, group)
    }
    if (group.start === null && rec.kind === 'start') group.start = rec.t
    if (rec.t > group.end) group.end = rec.t
  }

  const now = Date.now()
  /** @type {Array<{bootId: string, start: number, end: number, endKind: 'beat'|'running'}>} */
  const boots = []
  for (const group of groups.values()) {
    const start = group.start === null ? group.firstT : group.start
    const running = !!currentBootId && group.bootId === currentBootId
    const end = running ? Math.max(group.end, now) : group.end
    if (end < start) continue // 坏数据（时间倒流），丢弃
    const intersects = start < day.end && end > day.start
    const touchesDayPoint = start === end && start >= day.start && start < day.end
    if (!intersects && !touchesDayPoint) continue
    boots.push({ bootId: group.bootId, start, end, endKind: running ? 'running' : 'beat' })
  }
  if (boots.length === 0) return null

  boots.sort((a, b) => a.start - b.start)

  return {
    boots,
    firstStart: boots[0].start,
    onlineMs: unionMs(
      boots.map((b) => [b.start, b.end]),
      day.start,
      day.end,
    ),
  }
}
