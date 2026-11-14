/**
 * Read-only adapter for billion-context 0.1.213 + dsh-context 0.84.1.
 * Never import bili (it starts services), hydrate sessions, read content/blocks,
 * or use /stats cumulative totals as historical day usage. SQLite runs in a
 * disposable worker with a wall-clock timeout; SELECT projects numeric ledger
 * metadata only. No network, model calls, migrations or snapshot writes.
 */
import { Worker } from 'node:worker_threads'
import { readFile, readdir, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { dayRange } from '../util.js'

const finite = (v) => typeof v === 'number' && Number.isFinite(v)
const nonnegative = (v) => finite(v) && v >= 0
const MAX_SESSIONS = 256
const MAX_ROWS = 20000
const TIMEOUT_MS = 1200
const MAX_MARKERS = 32
const unavailable = (date, reason) => ({ source: 'billion-context', date, compressionCount: null, reclaimedTokens: null, inputTokens: null, cachedTokens: null, cacheHitRate: null, netSavedTokens: null, status: 'unknown', anomalies: [], coverage: reason, estimated: true })

/** Public Cordis registry metadata only; never snapshot/fold a session.
 * Installed @deepseek-ai/cordis src/fiber.ts:147 defines ACTIVE = 2.
 * dsh-context 0.84.1 exports name = 'dsh-context'; its projections are
 * summary:false, so summaryKeys() cannot be used as an enablement test. */
function pluginActive(ctx, name) {
  try {
    if (typeof ctx?.registry?.values !== 'function') return false
    for (const runtime of ctx.registry.values()) {
      if (runtime?.name === name && runtime.fibers && [...runtime.fibers].some((f) => f?.state === 2)) return true
    }
  } catch { /* unknown Host registry: hide, never hydrate for detection */ }
  return false
}
export const isContextActive = (ctx) => pluginActive(ctx, 'dsh-context')
// billion-context 0.1.213 dist/agent/dsh-native.js exports name='bili-native'.
export const areBiliSourcesActive = (ctx) => isContextActive(ctx) && pluginActive(ctx, 'bili-native')

/** Only registered/active sources count as enabled, not package existence. */
export async function discoverBiliStore({ contextActive = false, env = process.env, home = os.homedir(), now = Date.now(), isAlive = (pid) => { try { process.kill(pid, 0); return true } catch (e) { return e?.code === 'EPERM' } } } = {}) {
  if (!contextActive) return null
  const state = path.join(env.XDG_STATE_HOME || path.join(home, '.local', 'state'), 'billion-context', 'instances')
  let names
  try { names = await readdir(state) } catch { return null }
  if (names.length > MAX_MARKERS) return null
  const stores = new Set()
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    try {
      const file = path.join(state, name)
      if ((await stat(file)).size > 16384) continue
      const row = JSON.parse(await readFile(file, 'utf8'))
      if (!Number.isInteger(row.pid) || row.pid <= 0 || !isAlive(row.pid) || !finite(row.startedAt) || row.startedAt > now) continue
      const origin = new URL(row.origin)
      if (!['127.0.0.1', '[::1]', 'localhost'].includes(origin.hostname) || origin.protocol !== 'http:') continue
      if (typeof row.sessionsDir !== 'string' || !path.isAbsolute(row.sessionsDir)) continue
      stores.add(path.join(row.sessionsDir, 'index.db'))
    } catch { /* stale/unsupported markers are not evidence of an active source */ }
  }
  // Multiple active stores are ambiguous. Never guess which profile they serve.
  return stores.size === 1 ? [...stores][0] : null
}

// This program returns only explicit numeric accounting fields and mapping ids.
// The database is opened read-only: no PRAGMA journal_mode, CREATE, or migrations.
const READER = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
const { DatabaseSync } = require('node:sqlite');
let db;
try {
 db = new DatabaseSync(workerData.file, { readOnly: true, timeout: 100 });
 const p = workerData.ids.map(() => '?').join(',');
 const mappings = db.prepare('SELECT DISTINCT c.conversation_id AS conversationId, c.session_id AS sessionId, s.created_at AS createdAt, s.parent_session_id AS parentSessionId, json_extract(s.metadata_json, \'$.cacheLedger.v\') AS version, json_extract(s.metadata_json, \'$.cacheLedger.sampleSeq\') AS sampleSeq, json_extract(s.metadata_json, \'$.cacheLedger.foldSeqCounter\') AS foldSeqCounter, json_array_length(s.metadata_json, \'$.cacheLedger.lines\') AS lineCount, json_array_length(s.metadata_json, \'$.cacheLedger.folds\') AS foldCount FROM conversations c JOIN sessions s ON s.session_id=c.session_id WHERE c.namespace=\'dsh\' AND s.namespace=\'dsh\' AND c.conversation_id IN ('+p+') LIMIT 257').all(...workerData.ids);
 const ids = [...new Set(mappings.map(x => x.sessionId))];
 let lines=[], folds=[];
 if(ids.length) {
  const q=ids.map(()=>'?').join(',');
  lines=db.prepare('SELECT s.session_id AS sessionId, json_extract(j.value, \'$.seq\') AS seq, json_extract(j.value, \'$.at\') AS at, json_extract(j.value, \'$.input\') AS input, json_extract(j.value, \'$.cached\') AS cached, json_extract(j.value, \'$.unk\') AS unk, json_extract(j.value, \'$.cr\') AS cr, json_extract(j.value, \'$.foldSeq\') AS foldSeq FROM sessions s, json_each(s.metadata_json, \'$.cacheLedger.lines\') j WHERE s.session_id IN ('+q+') LIMIT 20001').all(...ids);
  folds=db.prepare('SELECT s.session_id AS sessionId, json_extract(j.value, \'$.seq\') AS seq, json_extract(j.value, \'$.at\') AS at, json_extract(j.value, \'$.S\') AS S, json_extract(j.value, \'$.sigma\') AS sigma, json_extract(j.value, \'$.T\') AS T, json_extract(j.value, \'$.requestsAfter\') AS requestsAfter FROM sessions s, json_each(s.metadata_json, \'$.cacheLedger.folds\') j WHERE s.session_id IN ('+q+') LIMIT 20001').all(...ids);
 }
 parentPort.postMessage({ mappings, lines, folds });
} catch(e) { parentPort.postMessage({ error: String(e?.code || e?.name || 'metadata-read-failed') }); }
finally { try { db?.close(); } catch {} }
`

export async function readBiliMetadata(file, sessionIds, { timeoutMs = TIMEOUT_MS } = {}) {
  const ids = [...new Set(sessionIds.filter((id) => typeof id === 'string' && id.length > 0 && id.length < 256))]
  if (!ids.length) return { mappings: [], lines: [], folds: [] }
  if (ids.length > MAX_SESSIONS) return { error: 'session-limit' }
  return new Promise((resolve) => {
    let settled = false
    let worker
    const finish = (value) => { if (settled) return; settled = true; clearTimeout(timer); void worker?.terminate(); resolve(value) }
    const timer = setTimeout(() => finish({ error: 'metadata-timeout' }), Math.min(3000, Math.max(50, timeoutMs)))
    try {
      worker = new Worker(READER, { eval: true, execArgv: [], workerData: { file, ids }, resourceLimits: { maxOldGenerationSizeMb: 32 } })
      worker.once('message', finish)
      worker.once('error', () => finish({ error: 'metadata-reader-unavailable' }))
      worker.once('exit', () => finish({ error: 'metadata-reader-exited' }))
    } catch { finish({ error: 'metadata-reader-unavailable' }) }
  })
}

/** Pure daily projection: unknown/missing coverage remains null, never zero. */
export function foldBiliDay(date, sessionIds, metadata) {
  const result = unavailable(date, '按请求日期统计的本地账本')
  if (metadata?.error) { result.coverage = metadata.error === 'metadata-timeout' ? '本地账本读取超时' : '本地账本暂不可读或超出安全上限'; return result }
  const { start, end } = dayRange(date)
  const inDay = (at) => finite(at) && at >= start && at < end
  const wanted = [...new Set(sessionIds)]
  if (!wanted.length) { result.coverage = '本日报没有可对应的会话'; return result }
  const mappings = Array.isArray(metadata?.mappings) ? metadata.mappings : []
  const rows = Array.isArray(metadata?.lines) ? metadata.lines : []
  const rawFolds = Array.isArray(metadata?.folds) ? metadata.folds : []
  if (mappings.length > MAX_SESSIONS || rows.length > MAX_ROWS || rawFolds.length > MAX_ROWS) { result.coverage = '账本超出安全读取上限'; return result }
  const selected = new Map()
  const issues = new Set()
  // Sessions bili never recorded (or recorded without a versioned ledger) are
  // reported as gaps instead of voiding the whole day: they contribute nothing,
  // so the totals below are a lower bound and the card says how many were left out.
  const gaps = new Set()
  let unaccounted = 0
  for (const id of wanted) {
    const matches = mappings.filter((m) => m.conversationId === id)
    const ids = new Set(matches.map((m) => m.sessionId))
    if (ids.size !== 1) { unaccounted++; gaps.add(ids.size ? '会话映射存在歧义' : '部分会话尚无 bili 映射'); continue }
    const m = matches[0]
    if (m.version !== 1) { unaccounted++; gaps.add('部分会话缺少带日期的缓存账本'); continue }
    selected.set(m.sessionId, m)
  }
  if (!selected.size) { result.coverage = [...gaps].join('；') || '缺少带日期的缓存账本'; return result }
  let input = 0, cached = 0, count = 0, reclaimed = 0, net = 0, samples = 0
  let usageKnown = true, foldsKnown = true, netKnown = true
  for (const [id, meta] of selected) {
    const dedup = (list) => {
      const map = new Map()
      for (const row of list.filter((r) => r.sessionId === id)) {
        if (!Number.isInteger(row.seq) || row.seq < 1 || !finite(row.at)) { issues.add('账本请求标识无效'); continue }
        const prev = map.get(row.seq)
        if (prev && JSON.stringify(prev) !== JSON.stringify(row)) { issues.add('账本存在冲突重复记录'); return null }
        map.set(row.seq, row)
      }
      return map
    }
    const lineMap = dedup(rows), foldMap = dedup(rawFolds)
    if (!lineMap || !foldMap) { usageKnown = foldsKnown = netKnown = false; continue }
    const lines = [...lineMap.values()].sort((a, b) => a.seq - b.seq)
    const folds = [...foldMap.values()]
    const full = Number.isInteger(meta.sampleSeq) && meta.sampleSeq === lines.length && lines.every((l, i) => l.seq === i + 1)
    const foldFull = Number.isInteger(meta.foldSeqCounter) && meta.foldSeqCounter === folds.length && [...foldMap.keys()].sort((a, b) => a - b).every((n, i) => n === i + 1)
    if (!full) { usageKnown = netKnown = false; issues.add('请求历史不完整') }
    if (!foldFull) { foldsKnown = netKnown = false; issues.add('压缩历史不完整') }
    // Forked ledgers can contain inherited history: charge only post-creation events.
    const owned = (row) => !meta.parentSessionId || (finite(meta.createdAt) && row.at >= meta.createdAt)
    for (const line of lines.filter((l) => inDay(l.at) && owned(l))) {
      samples++
      if (!nonnegative(line.input) || !nonnegative(line.cached) || line.cached > line.input || line.unk === 1) { usageKnown = false; issues.add('部分缓存用量未测量'); continue }
      input += line.input; cached += line.cached
    }
    for (const fold of folds) {
      if (!owned(fold)) {
        if (lines.some((l) => inDay(l.at) && owned(l) && l.at >= fold.at)) { netKnown = false; issues.add('无法确定继承压缩的当日收益') }
        continue
      }
      if (!nonnegative(fold.S) || !nonnegative(fold.sigma) || !nonnegative(fold.T) || !nonnegative(fold.requestsAfter)) { foldsKnown = netKnown = false; issues.add('压缩账本数值无效'); continue }
      if (inDay(fold.at)) { count++; reclaimed += Math.max(0, fold.S - fold.sigma) }
      // requestsAfter may be fractional wire coverage. There is no per-line
      // coverage history in 0.1.213; do not divide its cumulative value by days.
      const after = lines.filter((l) => l.at >= fold.at)
      const relevant = inDay(fold.at) || after.some((l) => inDay(l.at))
      if (!relevant) continue
      const allSameDay = inDay(fold.at) && after.every((l) => inDay(l.at))
      const repay = after.filter((l) => l.foldSeq === fold.seq).reduce((n, l) => n + (nonnegative(l.cr) ? l.cr : NaN), 0)
      if (!full || !allSameDay || !finite(repay) || Math.abs(repay - fold.T) > 0.001 || fold.requestsAfter > after.length) {
        netKnown = false; issues.add('跨日压缩或覆盖数据不足，净收益待确认'); continue
      }
      net += Math.max(0, fold.S - fold.sigma) * fold.requestsAfter - fold.T - fold.sigma
    }
  }
  result.compressionCount = foldsKnown ? count : null
  result.reclaimedTokens = foldsKnown ? reclaimed : null
  result.inputTokens = usageKnown ? input : null
  result.cachedTokens = usageKnown ? cached : null
  result.cacheHitRate = usageKnown && input > 0 ? cached / input : null
  result.netSavedTokens = netKnown ? net : null
  if (result.netSavedTokens !== null && result.netSavedTokens < 0) issues.add('本日压缩净收益为负，尚未回本')
  result.anomalies = [...issues].filter((s) => /无效|冲突|为负/.test(s))
  const anyMetric = [result.compressionCount, result.reclaimedTokens, result.cacheHitRate, result.netSavedTokens].some((v) => v !== null)
  result.status = result.anomalies.length ? 'warning' : anyMetric ? 'ok' : 'unknown'
  // Scope note comes first so a 240-char truncation never hides it.
  const scope = unaccounted ? `${selected.size}/${wanted.length} 会话可核算（${[...gaps].join('；')}），其余未计入` : ''
  const base = '仅统计本地日期化元数据；净收益仅限可完整归日的压缩，摘要 token 沿用 bili 估算'
  result.coverage = [scope, issues.size ? [...issues].join('；') : '', base].filter(Boolean).join('；')
  return result
}

export async function collectBiliDay({ date, sessionIds = [], contextActive = false, discover = discoverBiliStore, readMetadata = readBiliMetadata } = {}) {
  try {
    const file = await discover({ contextActive })
    if (!file) return null // strict dual-source gate: hide when either is inactive
    return foldBiliDay(date, sessionIds, await readMetadata(file, sessionIds))
  } catch { return unavailable(date, '本地统计源暂不可用') }
}
