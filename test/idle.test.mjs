/**
 * `collect/idle.js` 的回归测试：
 * 1. 手工构造当天采样，验证连续段 / 久坐 / 断档 / 断档后的短段过滤；
 * 2. 当天没有文件时返回 null；
 * 3. 真实拉起 powershell 采样（仅 win32）。
 */

import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createIdleSampler, readIdleDay } from '../lib/collect/idle.js'
import { dayRange, fmtDate, readLines } from '../lib/util.js'

const MIN = 60000
const HOUR = 3600000

/** 等待若干毫秒。 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 在临时目录里造一份当天采样文件。
 * @param {string} dataDir 临时数据根目录。
 * @param {string} dateStr `YYYY-MM-DD`。
 * @param {Array<{ t: number, idleMs: number }>} rows 采样行。
 * @returns {Promise<string>} 写好的 jsonl 路径。
 */
async function writeSamples(dataDir, dateStr, rows) {
  const dir = path.join(dataDir, 'idle')
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, dateStr + '.jsonl')
  await writeFile(file, rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8')
  return file
}

test('readIdleDay：连续段、打断、断档与久坐统计', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'dsh-idle-'))
  try {
    const dateStr = fmtDate(Date.now())
    const dayStart = dayRange(dateStr).start
    const base = dayStart + 9 * HOUR // 当天 09:00
    /** @type {Array<{ t: number, idleMs: number }>} */
    const rows = []

    // 第一段：70 分钟连续在用（每分钟一个采样，idleMs 很小）。
    for (let i = 0; i < 70; i += 1) rows.push({ t: base + i * MIN, idleMs: 500 })

    // 一次 6 分钟空闲 → 打断连续段。
    rows.push({ t: base + 70 * MIN, idleMs: 6 * MIN })

    // 第二段：20 分钟连续在用。
    for (let i = 1; i <= 20; i += 1) rows.push({ t: base + (70 + i) * MIN, idleMs: 500 })

    // 4 小时断档（睡眠 / 插件未运行），之后只有 3 分钟在用的短段。
    const tail = base + 90 * MIN + 4 * HOUR
    for (let i = 0; i < 3; i += 1) rows.push({ t: tail + i * MIN, idleMs: 500 })

    await writeSamples(dataDir, dateStr, rows)

    const idle = await readIdleDay(dataDir, dateStr)
    assert.ok(idle, 'readIdleDay 应返回对象')
    assert.equal(idle.samples, rows.length)
    assert.equal(idle.sedentaryCount, 1, '只有 70 分钟那段算久坐')
    assert.equal(idle.streaks.length, 2, '3 分钟的尾段应被 10 分钟下限过滤')
    assert.ok(idle.longestStreak, '应有最长段')
    assert.ok(
      Math.abs(idle.longestStreak.ms - 70 * MIN) <= 2 * MIN,
      'longestStreak 应约 70 分钟，实际 ' + idle.longestStreak.ms + 'ms',
    )
    assert.equal(idle.firstActive, base)
    assert.equal(idle.lastActive, tail + 2 * MIN)
    assert.equal(idle.activeMs, 93 * MIN, '93 个在用采样 × 60s')
    assert.ok(idle.streaks[0].ms >= idle.streaks[1].ms, 'streaks 按 ms 降序')
  } finally {
    await rm(dataDir, { recursive: true, force: true })
  }
})

test('readIdleDay：当天没有采样文件时返回 null', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'dsh-idle-empty-'))
  try {
    const result = await readIdleDay(dataDir, fmtDate(Date.now()))
    assert.equal(result, null)
  } finally {
    await rm(dataDir, { recursive: true, force: true })
  }
})

test('createIdleSampler：真实采样（仅 win32）', { skip: process.platform !== 'win32' }, async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'dsh-idle-live-'))
  const logs = []
  const sampler = createIdleSampler({ dataDir, intervalMs: 1000, log: (msg) => logs.push(msg) })
  try {
    sampler.start()
    sampler.start() // 幂等：重复调用不应再起一个进程
    assert.equal(sampler.running, true, 'start 后 running 应为 true')

    await sleep(4000)

    const idleMs = sampler.lastIdleMs
    assert.ok(
      Number.isInteger(idleMs) && idleMs >= 0,
      'lastIdleMs 应为非负整数，实际：' + String(idleMs) + '（日志：' + logs.join(' | ') + '）',
    )
    const lines = await readLines(path.join(dataDir, 'idle', fmtDate(Date.now()) + '.jsonl'))
    assert.ok(lines.length >= 2, '4 秒内应至少落盘 2 条采样，实际 ' + lines.length)

    sampler.stop()
    await sleep(500)
    assert.equal(sampler.running, false, 'stop 后 running 应为 false')
    sampler.stop() // 幂等：重复 stop 不应抛错
  } finally {
    sampler.stop()
    await rm(dataDir, { recursive: true, force: true })
  }
})
