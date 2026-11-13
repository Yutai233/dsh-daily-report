/**
 * Live sitting tracker — conversation time instead of keyboard sampling.
 *
 * The daily report's rough mode already treats two DSH human messages closer
 * than 15 minutes as one sitting (`analyze/health.js`). This module moves the
 * same rule to runtime: the Host plugin feeds every `user/message` from the
 * `session/event` stream in, the 30 s tick asks whether the current sitting is
 * old enough to interrupt, and `engine.notify()` raises a toast right away
 * instead of the next morning.
 *
 * State is persisted so a plugin reload (or a DSH restart) keeps the sitting
 * instead of starting over from the next message.
 * @module dsh-daily-report/collect/live
 */

import path from 'node:path'
import { fmtDate, readJson, writeJson } from '../util.js'

/** Gap between two human messages that still belongs to one sitting. */
export const LIVE_GAP_MS = 15 * 60000

/** File name inside the plugin data directory. */
export const LIVE_FILE = 'live-sitting.json'

/** Absolute path of the persisted tracker state. */
export function liveFile(dataDir) {
  return path.join(dataDir, LIVE_FILE)
}

/** True for a `session/event` that carries a message a human actually typed. */
export function isHumanEvent(event) {
  return !!(
    event &&
    event.type === 'user/message' &&
    Number.isFinite(event.time) &&
    event.data &&
    event.data.source &&
    event.data.source.kind === 'user'
  )
}

/**
 * The open sitting, fed by message timestamps and queried by the tick.
 * Pure in-memory; `toJSON()`/`restore()` handle persistence.
 */
export class LiveSitting {
  constructor({ gapMs = LIVE_GAP_MS } = {}) {
    this.gapMs = gapMs
    this.reset()
  }

  reset() {
    this.day = null
    this.start = null
    this.last = null
    this.alertedAt = null
    this.reminded = 0
  }

  /** Record one human-message timestamp; returns true when the event was usable. */
  observe(t) {
    if (!Number.isFinite(t)) return false
    const day = fmtDate(t)
    if (this.day !== null && day !== this.day) this.reset()
    this.day = day
    if (this.start === null || t - this.last > this.gapMs) {
      this.start = t
      this.alertedAt = null
      this.reminded = 0
    }
    if (this.last === null || t > this.last) this.last = t
    return true
  }

  /** The sitting still active at `now` (`null` once the last message is too old). */
  sitting(now) {
    if (this.start === null || !Number.isFinite(now)) return null
    if (now - this.last > this.gapMs) return null
    return { start: this.start, end: this.last, ms: now - this.start, active: true }
  }

  /**
   * A reminder is due when the sitting has outlasted `limitMs` and the last
   * reminder for this sitting is at least `limitMs` old (repeat each period).
   */
  due(now, limitMs) {
    if (!Number.isFinite(now) || !(limitMs > 0)) return null
    const s = this.sitting(now)
    if (!s || s.ms <= limitMs) return null
    if (this.alertedAt !== null && now - this.alertedAt < limitMs) return null
    return { start: s.start, ms: s.ms, repeat: this.reminded }
  }

  /** Remember that a reminder went out for the open sitting. */
  markAlerted(now) {
    if (this.start === null || !Number.isFinite(now)) return
    this.alertedAt = now
    this.reminded += 1
  }

  toJSON() {
    return { day: this.day, start: this.start, last: this.last, alertedAt: this.alertedAt, reminded: this.reminded }
  }

  /** Restore a persisted state; stale (`other day`) or malformed states are refused. */
  restore(raw, now) {
    if (!raw || typeof raw !== 'object') return false
    const start = Number(raw.start)
    const last = Number(raw.last)
    if (!Number.isFinite(start) || !Number.isFinite(last) || start > last) return false
    if (Number.isFinite(now) && fmtDate(last) !== fmtDate(now)) return false
    this.day = fmtDate(last)
    this.start = start
    this.last = last
    const alerted = raw.alertedAt === null || raw.alertedAt === undefined ? null : Number(raw.alertedAt)
    this.alertedAt = Number.isFinite(alerted) ? alerted : null
    this.reminded = Number.isFinite(Number(raw.reminded)) ? Math.max(0, Math.floor(Number(raw.reminded))) : 0
    return true
  }
}

/** Load the persisted state (missing or unreadable → `null`). */
export function loadLive(file) {
  return readJson(file, null)
}

/** Persist the tracker state atomically. */
export function saveLive(file, tracker) {
  return writeJson(file, tracker.toJSON(), 0o600)
}
