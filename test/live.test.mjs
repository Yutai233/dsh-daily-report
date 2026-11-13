import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { LiveSitting, isHumanEvent, liveFile, loadLive, saveLive } from '../lib/collect/live.js'

// Local Nov 13 2026, 09:10 — the tracker only compares timestamps.
const T0 = new Date(2026, 10, 13, 9, 10).getTime()
const MIN = 60000

const human = (time) => ({ type: 'user/message', time, data: { source: { kind: 'user' } } })

test('messages closer than 15 minutes form one sitting from the first message', () => {
  const s = new LiveSitting()
  for (const m of [0, 8, 16, 24]) s.observe(T0 + m * MIN)
  const sit = s.sitting(T0 + 25 * MIN)
  assert.equal(sit.start, T0)
  assert.equal(sit.ms, 25 * MIN)
  assert.equal(sit.active, true)
})

test('a gap over 15 minutes starts a fresh sitting', () => {
  const s = new LiveSitting()
  s.observe(T0)
  s.observe(T0 + 10 * MIN)
  s.observe(T0 + 30 * MIN) // 20 min after the previous message
  const sit = s.sitting(T0 + 31 * MIN)
  assert.equal(sit.start, T0 + 30 * MIN)
  assert.equal(sit.ms, 1 * MIN)
})

test('no message for over 15 minutes ends the sitting', () => {
  const s = new LiveSitting()
  s.observe(T0)
  s.observe(T0 + 10 * MIN)
  assert.equal(s.sitting(T0 + 26 * MIN), null)
  assert.equal(s.due(T0 + 26 * MIN, 50 * MIN), null)
})

test('reminder fires once the sitting outlasts the limit, then repeats each period', () => {
  const s = new LiveSitting()
  // A message every 10 minutes keeps the sitting alive.
  for (let m = 0; m <= 60; m += 10) s.observe(T0 + m * MIN)
  assert.equal(s.due(T0 + 50 * MIN, 50 * MIN), null, 'exactly at the limit is not yet over it')
  const first = s.due(T0 + 51 * MIN, 50 * MIN)
  assert.ok(first)
  assert.equal(first.start, T0)
  assert.equal(first.repeat, 0)
  s.markAlerted(T0 + 51 * MIN)
  assert.equal(s.due(T0 + 60 * MIN, 50 * MIN), null, 'no second toast within the same period')

  for (let m = 70; m <= 120; m += 10) s.observe(T0 + m * MIN)
  const again = s.due(T0 + 121 * MIN, 50 * MIN)
  assert.ok(again)
  assert.equal(again.repeat, 1)
})

test('a new sitting resets the reminder state', () => {
  const s = new LiveSitting()
  s.observe(T0)
  s.markAlerted(T0 + 51 * MIN) // even when called early, it marks the open sitting
  s.observe(T0 + 30 * MIN)
  assert.equal(s.reminded, 0)
  assert.equal(s.alertedAt, null)
})

test('a day change resets the sitting', () => {
  const s = new LiveSitting()
  s.observe(T0)
  s.observe(T0 + 24 * 3600000)
  assert.equal(s.start, T0 + 24 * 3600000)
})

test('isHumanEvent accepts typed user messages only', () => {
  assert.equal(isHumanEvent(human(T0)), true)
  assert.equal(isHumanEvent({ ...human(T0), type: 'assistant/message' }), false)
  assert.equal(isHumanEvent({ ...human(T0), time: undefined }), false)
  assert.equal(isHumanEvent({ type: 'user/message', time: T0, data: { source: { kind: 'system' } } }), false)
  assert.equal(isHumanEvent(null), false)
})

test('state survives a save/load round trip and rejects stale days', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ddr-live-'))
  const file = liveFile(dir)
  const s = new LiveSitting()
  s.observe(T0)
  s.observe(T0 + 10 * MIN)
  s.markAlerted(T0 + 55 * MIN)
  await saveLive(file, s)

  const raw = JSON.parse(await readFile(file, 'utf8'))
  assert.equal(raw.start, T0)

  const restored = new LiveSitting()
  assert.equal(restored.restore(await loadLive(file), T0 + 60 * MIN), true)
  assert.deepEqual(restored.toJSON(), s.toJSON())
  assert.equal(restored.due(T0 + 60 * MIN, 50 * MIN), null)

  const stale = new LiveSitting()
  assert.equal(stale.restore(raw, T0 + 24 * 3600000), false, 'yesterday’s sitting must not leak into today')
  assert.equal(stale.sitting(T0 + 60 * MIN), null)

  assert.equal(new LiveSitting().restore({ start: 'x', last: T0 }, T0), false)
  assert.equal(await loadLive(path.join(dir, 'missing.json')), null)
})
