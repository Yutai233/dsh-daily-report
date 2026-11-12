/**
 * Persistent store: DayFacts, rendered reports and small state, all under
 * `~/.dsh/dsh-daily-report/`. Report files are the durable "Markdown archive"
 * of design §4 — agents can read them later to answer "what did I do last week".
 * @module dsh-daily-report/store
 */

import { readdir, unlink, stat } from 'node:fs/promises'
import path from 'node:path'
import { DATA_DIR, readJson, writeJson, writeText, addDays, fmtDate, DAY } from './util.js'

/** Resolve the configured report root; private samples/facts never move. */
export function reportsRoot(custom = '') { return custom || path.join(DATA_DIR, 'reports') }

/** Resolve one archived report file underneath the selected report root. */
export function reportPath(kind, key, ext, custom = '') { return path.join(reportsRoot(custom), kind, key + '.' + ext) }

export const dirs = {
  facts: () => path.join(DATA_DIR, 'facts'),
  reports: (kind, custom = '') => path.join(reportsRoot(custom), kind),
  heartbeat: () => path.join(DATA_DIR, 'heartbeat'),
  idle: () => path.join(DATA_DIR, 'idle'),
}
const STATE_FILE = () => path.join(DATA_DIR, 'state.json')

/** Strip non-persistent/hidden fields before saving DayFacts. */
function persistable(facts) {
  const { _packs, ...rest } = facts
  return rest
}

export async function saveFacts(facts) {
  await writeJson(path.join(dirs.facts(), facts.date + '.json'), persistable(facts))
}

export async function loadFacts(dateStr) {
  return readJson(path.join(dirs.facts(), dateStr + '.json'), null)
}

/** Load DayFacts for the `n` days before `dateStr` (missing days skipped). */
export async function loadHistory(dateStr, n = 7) {
  const out = []
  for (let i = 1; i <= n; i++) {
    const f = await loadFacts(addDays(dateStr, -i))
    if (f) out.push(f)
  }
  return out
}

/** Load DayFacts for an inclusive date range. */
export async function loadRange(start, end) {
  const out = []
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const f = await loadFacts(d)
    if (f) out.push(f)
  }
  return out
}

/**
 * Write a report's Markdown and HTML.
 * @param {'daily'|'weekly'|'monthly'} kind
 * @param {string} key - `YYYY-MM-DD` / `YYYY-Www` / `YYYY-MM`.
 * @returns {Promise<{md:string, html:string, json:string}>} absolute paths.
 */
export async function saveReport(kind, key, { report, markdown, html }, custom = '') {
  const base = path.join(dirs.reports(kind, custom), key)
  await writeText(base + '.md', markdown)
  await writeText(base + '.html', html)
  await writeJson(base + '.json', report)
  return { md: base + '.md', html: base + '.html', json: base + '.json' }
}

export async function loadReport(kind, key, custom = '') {
  return readJson(reportPath(kind, key, 'json', custom), null)
}

/** List saved report keys of one kind, newest first. */
export async function listReports(kind, custom = '') {
  try {
    const names = await readdir(dirs.reports(kind, custom))
    return [...new Set(names.filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5)))].sort().reverse()
  } catch {
    return []
  }
}

export async function loadState() {
  return (await readJson(STATE_FILE(), {})) || {}
}

export async function patchState(patch) {
  const s = await loadState()
  const next = { ...s, ...patch }
  await writeJson(STATE_FILE(), next)
  return next
}

/** Delete raw samples / facts / reports older than `days`. */
export async function prune(days, custom = '') {
  const cutoff = fmtDate(Date.now() - days * DAY)
  let removed = 0
  for (const dir of [dirs.facts(), dirs.heartbeat(), dirs.idle(), dirs.reports('daily', custom)]) {
    let names = []
    try { names = await readdir(dir) } catch { continue }
    for (const n of names) {
      const m = /^(\d{4}-\d{2}-\d{2})\.(?:jsonl|json|md|html)$/.exec(n)
      if (m && m[1] < cutoff) {
        try { await unlink(path.join(dir, n)); removed++ } catch { /* ignore */ }
      }
    }
  }
  return removed
}

/** Total bytes under the data directory (for the settings page). */
export async function dataSize(custom = '') {
  let total = 0
  async function walk(d) {
    let ents = []
    try { ents = await readdir(d, { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) await walk(p)
      else { try { total += (await stat(p)).size } catch { /* ignore */ } }
    }
  }
  await walk(DATA_DIR)
  const root = reportsRoot(custom)
  const relative = path.relative(DATA_DIR, root)
  if (path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep)) {
    for (const kind of ['daily', 'weekly', 'monthly']) await walk(dirs.reports(kind, custom))
  }
  return total
}
