/**
 * Windows 键鼠空闲采样采集器。
 *
 * 落盘：`<dataDir>/idle/YYYY-MM-DD.jsonl`（按**写入时刻的本地日期**分文件），
 * 每行一个 `{"t":ms,"idleMs":ms}`，`idleMs` 是采样时距最后一次键鼠输入的毫秒数。
 *
 * 实现方式：常驻 `powershell.exe`（`-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand`），
 * 进程内用 `Add-Type` 定义 C# 类 `DshIdle`，P/Invoke `user32.dll!GetLastInputInfo`，
 * 然后循环把 `[DshIdle]::Ms()` 打到 stdout；Node 端按行解析并追加到 jsonl。
 *
 * **隐私边界：只记录“多久没动”，绝不记录任何按键内容、窗口标题或输入文本。**
 *
 * @module dsh-daily-report/collect/idle
 */

import { spawn } from 'node:child_process'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { appendLine, dayRange, fmtDate, readLines } from '../util.js'

/** 空闲采样文件所在子目录名。 */
const IDLE_DIR = 'idle'

/** 默认采样间隔（毫秒），与契约 §3 一致。 */
const DEFAULT_INTERVAL_MS = 60000

/** 子进程意外退出后的重启延迟（毫秒）。 */
const RESTART_DELAY_MS = 30000

/** 重启次数统计窗口（毫秒）。 */
const RESTART_WINDOW_MS = 3600000

/** 每小时最多重启次数；超出即放弃采样。 */
const MAX_RESTARTS_PER_WINDOW = 5

/** stderr 日志最多保留的字符数。 */
const STDERR_LOG_MAX = 200

/** 进入 `streaks` 的最短连续用机段（10 分钟）。 */
const MIN_STREAK_MS = 600000

/** `streaks` 最多保留的段数。 */
const MAX_STREAKS = 10

/** 相邻采样间隔超过 `3 × intervalMs` 视为断档的倍数。 */
const GAP_FACTOR = 3

/** 默认“在用”阈值：最近一次输入距今不足 2 分钟。 */
const DEFAULT_ACTIVE_MS = 120000

/** 默认“休息”阈值：最近一次输入距今超过 5 分钟。 */
const DEFAULT_BREAK_MS = 300000

/** 默认久坐阈值：单个连续段超过 50 分钟。 */
const DEFAULT_SEDENTARY_MS = 3000000

/** 把异常对象压成一行可读文本。 */
const errText = (err) => (err && err.message ? err.message : String(err))

/**
 * 生成提供给 `powershell.exe -EncodedCommand` 的 PowerShell 脚本。
 *
 * 脚本内容：`Add-Type` 定义 C# 类 `DshIdle`（P/Invoke `GetLastInputInfo`），
 * 之后死循环每 `intervalMs` 打印一次空闲毫秒数并 `Flush`。
 *
 * @param {number} intervalMs 采样间隔（毫秒，正整数）。
 * @returns {string} PowerShell 脚本文本（使用 CRLF 换行）。
 */
function buildScript(intervalMs) {
  const csharp = [
    'using System;',
    'using System.Runtime.InteropServices;',
    '',
    'public static class DshIdle',
    '{',
    '  [StructLayout(LayoutKind.Sequential)]',
    '  public struct LASTINPUTINFO',
    '  {',
    '    public uint cbSize;',
    '    public uint dwTime;',
    '  }',
    '',
    '  [DllImport("user32.dll")]',
    '  public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);',
    '',
    '  public static uint Ms()',
    '  {',
    '    var i = new LASTINPUTINFO();',
    '    i.cbSize = (uint)Marshal.SizeOf(i);',
    '    GetLastInputInfo(ref i);',
    '    return unchecked((uint)Environment.TickCount - i.dwTime);',
    '  }',
    '}',
  ]

  const lines = [
    "$ErrorActionPreference = 'Stop'",
    '$source = @\'',
    ...csharp,
    '\'@',
    'Add-Type -TypeDefinition $source -Language CSharp',
    'while ($true) {',
    '  [Console]::Out.WriteLine([DshIdle]::Ms())',
    '  [Console]::Out.Flush()',
    '  Start-Sleep -Milliseconds ' + intervalMs,
    '}',
  ]
  return lines.join('\r\n') + '\r\n'
}

/**
 * 把脚本文本编码为 `-EncodedCommand` 需要的 UTF-16LE Base64。
 *
 * @param {string} script 脚本文本。
 * @returns {string} Base64 字符串。
 */
function encodeCommand(script) {
  return Buffer.from(script, 'utf16le').toString('base64')
}

/**
 * 创建一个键鼠空闲采样器（进程级单例；仅 Windows 可用）。
 *
 * @param {object} options 配置。
 * @param {string} options.dataDir 数据根目录，如 `~/.dsh/dsh-daily-report`。
 * @param {number} [options.intervalMs=60000] 采样间隔（毫秒）。
 * @param {(msg: string) => void} [options.log] 可选日志函数；默认静默。
 * @returns {{
 *   start(): void,
 *   stop(): void,
 *   readonly running: boolean,
 *   readonly lastIdleMs: number|null
 * }} 采样器控制器：`start()` 幂等、`stop()` 可重复调用。
 */
export function createIdleSampler({ dataDir, intervalMs = DEFAULT_INTERVAL_MS, log = () => {} } = {}) {
  const logFn = typeof log === 'function' ? log : () => {}
  const step = Number.isFinite(intervalMs) && intervalMs > 0 ? Math.round(intervalMs) : DEFAULT_INTERVAL_MS
  const encoded = encodeCommand(buildScript(step))

  /** 某个采样时刻应写入的 jsonl 路径（按本地日期分文件）。 */
  const fileFor = (ms) => path.join(dataDir, IDLE_DIR, fmtDate(ms) + '.jsonl')

  /** @type {import('node:child_process').ChildProcess|null} */
  let child = null
  /** @type {import('node:readline').Interface|null} */
  let reader = null
  let running = false
  let lastIdleMs = null
  /** @type {NodeJS.Timeout|null} */
  let restartTimer = null
  /** @type {number[]} */
  let restarts = []

  /** 关闭 stdout 的按行读取器。 */
  function closeReader() {
    if (!reader) return
    try { reader.close() } catch { /* 已关闭 */ }
    reader = null
  }

  /**
   * 解析一行 stdout：是整数就记盘；非数字行直接忽略。
   * @param {string} line 一行文本。
   * @returns {void}
   */
  function handleLine(line) {
    const text = String(line).trim()
    if (!text) return
    const value = Number(text)
    if (!Number.isInteger(value) || value < 0) return
    lastIdleMs = value
    const t = Date.now()
    appendLine(fileFor(t), { t, idleMs: value }).catch((err) => {
      logFn('[idle] 写入失败：' + errText(err))
    })
  }

  /**
   * 在允许的额度内安排一次 30 秒后的重启。
   * @returns {void}
   */
  function scheduleRestart() {
    if (restartTimer) return
    const now = Date.now()
    restarts = restarts.filter((at) => now - at < RESTART_WINDOW_MS)
    if (restarts.length >= MAX_RESTARTS_PER_WINDOW) {
      logFn('[idle] 一小时内重启已满 ' + MAX_RESTARTS_PER_WINDOW + ' 次，停止空闲采样')
      running = false
      return
    }
    restarts.push(now)
    restartTimer = setTimeout(() => {
      restartTimer = null
      if (running && !child) spawnChild()
    }, RESTART_DELAY_MS)
    if (typeof restartTimer.unref === 'function') restartTimer.unref()
  }

  /**
   * 子进程结束：未 stop 就按策略重启。
   * @param {import('node:child_process').ChildProcess} proc 结束的进程。
   * @param {number|null} code 退出码。
   * @returns {void}
   */
  function onChildClosed(proc, code) {
    if (proc !== child) return
    child = null
    closeReader()
    if (!running) return
    logFn('[idle] 采样进程退出（code=' + String(code) + '），' + RESTART_DELAY_MS / 1000 + ' 秒后重启')
    scheduleRestart()
  }

  /**
   * 启动常驻 powershell.exe 并接管其 stdout/stderr。
   * @returns {void}
   */
  function spawnChild() {
    if (!running) return
    let proc
    try {
      proc = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
      )
    } catch (err) {
      logFn('[idle] 启动 powershell 失败：' + errText(err))
      scheduleRestart()
      return
    }
    child = proc

    if (proc.stderr) {
      proc.stderr.on('error', () => { /* 忽略流错误 */ })
      proc.stderr.on('data', (chunk) => {
        const text = String(chunk).trim()
        if (!text) return
        logFn('[idle] powershell stderr: ' + text.slice(0, STDERR_LOG_MAX))
      })
    }

    if (proc.stdout) {
      reader = createInterface({ input: proc.stdout })
      reader.on('line', handleLine)
      reader.on('error', (err) => logFn('[idle] stdout 读取失败：' + errText(err)))
    }

    proc.on('error', (err) => {
      if (proc !== child) return
      logFn('[idle] 采样进程错误：' + errText(err))
    })
    proc.on('close', (code) => onChildClosed(proc, code))
  }

  return {
    /**
     * 启动采样（幂等）。非 Windows 平台只记一条日志并返回。
     * @returns {void}
     */
    start() {
      if (running) return
      if (process.platform !== 'win32') {
        logFn('[idle] 空闲采样仅支持 Windows，已跳过')
        return
      }
      if (typeof dataDir !== 'string' || !dataDir) {
        logFn('[idle] 缺少 dataDir，已跳过空闲采样')
        return
      }
      running = true
      restarts = []
      spawnChild()
    },

    /**
     * 停止采样（可重复调用）：清重启定时器、杀掉子进程。
     * @returns {void}
     */
    stop() {
      running = false
      if (restartTimer) {
        clearTimeout(restartTimer)
        restartTimer = null
      }
      closeReader()
      const proc = child
      child = null
      if (proc) {
        try { proc.kill() } catch { /* 已退出 */ }
      }
    },

    /** 采样器是否在运行。 */
    get running() {
      return running
    },

    /** 最近一次读到的空闲毫秒数；尚未采样时为 `null`。 */
    get lastIdleMs() {
      return lastIdleMs
    },
  }
}

/**
 * 从采样时间戳推断采样间隔：取相邻采样间隔的中位数。
 * @param {Array<{ t: number }>} samples 已按 `t` 升序排序的采样。
 * @returns {number} 推断出的间隔（毫秒）；无间隔可用时返回 60000。
 */
function inferInterval(samples) {
  /** @type {number[]} */
  const diffs = []
  for (let i = 1; i < samples.length; i += 1) {
    const d = samples[i].t - samples[i - 1].t
    if (d > 0) diffs.push(d)
  }
  if (diffs.length === 0) return DEFAULT_INTERVAL_MS
  diffs.sort((a, b) => a - b)
  const mid = diffs.length >> 1
  return diffs.length % 2 === 1 ? diffs[mid] : (diffs[mid - 1] + diffs[mid]) / 2
}

/**
 * 读取某一天的键鼠空闲采样，汇总为 `DayFacts.idle`。
 *
 * 判读规则：
 * - `idleMs < activeMs` → 该采样时“在用”，每个在用采样贡献 `min(相邻间隔, intervalMs)` 毫秒；
 * - `idleMs ≥ breakMs` → 视为休息，打断当前连续段；
 * - 介于 `[activeMs, breakMs)` 的采样既不打断也不计入在用；
 * - 相邻采样间隔 `> 3 × intervalMs` → 断档（睡眠 / 插件未运行），同样打断连续段；
 * - 连续段 `start = 段内第一个在用采样的 t − intervalMs`（不早于当天 0 点），`end = 段内最后一个在用采样的 t`；
 * - 仅 `ms ≥ 10 分钟` 的段进入 `streaks`（按 `ms` 降序，最多 10 个），`longestStreak` 取其中最长者。
 *
 * @param {string} dataDir 数据根目录。
 * @param {string} dateStr `YYYY-MM-DD`（本地日期）。
 * @param {object} [options] 阈值。
 * @param {number} [options.activeMs=120000] “在用”阈值：空闲小于它算在用。
 * @param {number} [options.breakMs=300000] “休息”阈值：空闲不小于它算休息。
 * @param {number} [options.sedentaryMs=3000000] 久坐阈值：单个连续段超过它记为久坐。
 * @param {number} [options.intervalMs] 采样间隔；不传则用相邻采样间隔的中位数推断。
 * @returns {Promise<{
 *   samples: number,
 *   activeMs: number,
 *   longestStreak: { start: number, end: number, ms: number }|null,
 *   streaks: Array<{ start: number, end: number, ms: number }>,
 *   sedentaryCount: number,
 *   firstActive: number|null,
 *   lastActive: number|null
 * } | null>} 当天没有可用采样时返回 `null`。
 */
export async function readIdleDay(
  dataDir,
  dateStr,
  {
    activeMs = DEFAULT_ACTIVE_MS,
    breakMs = DEFAULT_BREAK_MS,
    sedentaryMs = DEFAULT_SEDENTARY_MS,
    intervalMs,
  } = {},
) {
  if (typeof dataDir !== 'string' || !dataDir || typeof dateStr !== 'string' || !dateStr) return null

  const rows = await readLines(path.join(dataDir, IDLE_DIR, dateStr + '.jsonl'))
  /** @type {Array<{ t: number, idleMs: number }>} */
  const samples = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const t = Number(row.t)
    const idle = Number(row.idleMs)
    if (!Number.isFinite(t) || !Number.isFinite(idle) || idle < 0) continue
    samples.push({ t, idleMs: idle })
  }
  if (samples.length === 0) return null
  samples.sort((a, b) => a.t - b.t)

  const range = dayRange(dateStr)
  const dayStart = Number.isFinite(range.start) ? range.start : samples[0].t
  const step = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : inferInterval(samples)
  const gapLimit = step * GAP_FACTOR
  const activeLimit = Number.isFinite(activeMs) ? activeMs : DEFAULT_ACTIVE_MS
  const breakLimit = Number.isFinite(breakMs) ? breakMs : DEFAULT_BREAK_MS
  const sedentaryLimit = Number.isFinite(sedentaryMs) ? sedentaryMs : DEFAULT_SEDENTARY_MS

  /** @type {Array<{ start: number, end: number, ms: number }>} */
  const segments = []
  /** 当前连续段的首/末在用采样时刻。 */
  let current = null
  /** 上一个用过的采样（含非在用采样），仅用于算间隔。 */
  let prev = null
  let activeTotal = 0
  /** @type {number|null} */
  let firstActive = null
  /** @type {number|null} */
  let lastActive = null

  /** 收束当前连续段并按 `start/end/ms` 落账。 */
  function pushSegment() {
    if (!current) return
    const start = Math.max(dayStart, Math.round(current.first - step))
    const end = Math.round(current.last)
    const ms = end - start
    if (ms > 0) segments.push({ start, end, ms })
    current = null
  }

  for (const sample of samples) {
    const gap = prev === null ? 0 : sample.t - prev.t
    if (prev !== null && gap > gapLimit) pushSegment()

    if (sample.idleMs < activeLimit) {
      activeTotal += prev === null ? step : Math.min(gap, step)
      if (current) current.last = sample.t
      else current = { first: sample.t, last: sample.t }
      if (firstActive === null) firstActive = sample.t
      lastActive = sample.t
    } else if (sample.idleMs >= breakLimit) {
      pushSegment()
    }
    prev = sample
  }
  pushSegment()

  const streaks = segments
    .filter((seg) => seg.ms >= MIN_STREAK_MS)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, MAX_STREAKS)
  const sedentaryCount = segments.reduce((count, seg) => (seg.ms > sedentaryLimit ? count + 1 : count), 0)

  return {
    samples: samples.length,
    activeMs: Math.round(activeTotal),
    longestStreak: streaks.length > 0 ? streaks[0] : null,
    streaks,
    sedentaryCount,
    firstActive,
    lastActive,
  }
}
