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
import { createIdleSampler, readIdleDay, readIdleStreak } from '../lib/collect/idle.js'
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

    // 最后一次采样时人已离开 30 分钟：lastSample 走得更晚，但不算“在用”。
    rows.push({ t: tail + 3 * MIN, idleMs: 30 * MIN })

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
    assert.equal(idle.lastSample, tail + 3 * MIN, 'lastSample 取当天最后一个采样时刻')
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

test('readIdleStreak：只认此刻仍开着的最后一段', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'dsh-idle-streak-'))
  try {
    const dateStr = '2026-05-06' // 固定日期，避免恰好跨零点
    const base = dayRange(dateStr).start + 9 * HOUR
    /** @type {Array<{ t: number, idleMs: number }>} */
    const rows = []
    for (let i = 0; i < 60; i += 1) rows.push({ t: base + i * MIN, idleMs: 500 })
    await writeSamples(dataDir, dateStr, rows)

    // 尾采样在 30 秒前 → 仍在用；end 取 now，ms 随真实时间推进。
    const now = base + 59 * MIN + 30000
    const open = await readIdleStreak(dataDir, dateStr, { now })
    assert.ok(open, '尾采样新鲜时应返回连续段')
    assert.equal(open.start, base - MIN, 'start = 第一个在用采样 - 一个采样间隔')
    assert.equal(open.end, now)
    assert.equal(open.ms, now - open.start)

    // 距尾采样超过 3 个采样间隔 → 认为人已离开。
    assert.equal(await readIdleStreak(dataDir, dateStr, { now: base + 59 * MIN + 4 * MIN }), null)
    // 时钟回拨（now 早于尾采样）不算在用。
    assert.equal(await readIdleStreak(dataDir, dateStr, { now: base - 10 * MIN }), null)

    // 尾采样空闲 5 分钟 → 已休息，没有仍开着的段。
    await writeSamples(dataDir, dateStr, rows.concat([{ t: base + 60 * MIN, idleMs: 5 * MIN }]))
    assert.equal(await readIdleStreak(dataDir, dateStr, { now: base + 60 * MIN + 30000 }), null)

    // 只有 3 分钟碎片段（低于 10 分钟下限）→ 不返回。
    const shortDir = await mkdtemp(path.join(tmpdir(), 'dsh-idle-short-'))
    try {
      const shortRows = [0, 1, 2].map((i) => ({ t: base + i * MIN, idleMs: 500 }))
      await writeSamples(shortDir, dateStr, shortRows)
      assert.equal(await readIdleStreak(shortDir, dateStr, { now: base + 2 * MIN + 30000 }), null)
    } finally {
      await rm(shortDir, { recursive: true, force: true })
    }
  } finally {
    await rm(dataDir, { recursive: true, force: true })
  }
})

test('createIdleSampler：真实采样（仅 win32）', { skip: process.platform !== 'win32' }, async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'dsh-idle-live-'))
  const logs = []
  const sampler = createIdleSampler({ dataDir, intervalMs: 1000, log: (msg) => logs.push(msg) })
  try {
    sampler.start()
    sampler.start() // 幂等：重复调用不应再起一个进程
    assert.equal(sampler.running, true, 'start 后 running 应为 true')

    // 拉起 powershell 的延迟因机器而异（CI runner 上 Add-Type 编译可能超过 3 秒），
    // 所以轮询等采样落盘，而不是假设固定 4 秒就够；上限 30 秒。
    const file = path.join(dataDir, 'idle', fmtDate(Date.now()) + '.jsonl')
    const deadline = Date.now() + 30000
    let lines = []
    while (Date.now() < deadline) {
      await sleep(500)
      lines = await readLines(file)
      if (lines.length >= 2) break
      // 启动就失败（如受限沙箱禁止 spawn）时不必等满 30 秒
      if (lines.length === 0 && logs.some((msg) => /启动 powershell 失败/.test(msg))) break
    }

    // 环境本身拉不起 powershell（受限沙箱、无交互会话、PowerShell 缺失）时跳过，
    // 而不是伪装成通过；进程真的起来了才做严格断言。
    const spawnBlocked = logs.some((msg) => /启动 powershell 失败/.test(msg))
    if (spawnBlocked) {
      t.skip('当前会话无法拉起 powershell 采样：' + logs.join(' | '))
      return
    }

    const idleMs = sampler.lastIdleMs
    assert.ok(
      Number.isInteger(idleMs) && idleMs >= 0,
      'lastIdleMs 应为非负整数，实际：' + String(idleMs) + '（日志：' + logs.join(' | ') + '）',
    )
    assert.ok(lines.length >= 2, '30 秒内应至少落盘 2 条采样，实际 ' + lines.length)

    sampler.stop()
    await sleep(500)
    assert.equal(sampler.running, false, 'stop 后 running 应为 false')
    sampler.stop() // 幂等：重复 stop 不应抛错
  } finally {
    sampler.stop()
    await rm(dataDir, { recursive: true, force: true })
  }
})
