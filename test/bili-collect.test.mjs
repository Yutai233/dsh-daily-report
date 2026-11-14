import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const root = mkdtempSync(path.join(tmpdir(), 'ddr-bili-'))
process.env.DSH_DAILY_REPORT_DIR = path.join(root, 'report')
const { foldBiliDay, collectBiliDay, discoverBiliStore, readBiliMetadata, isContextActive, areBiliSourcesActive } = await import('../lib/collect/bili.js')
const { enrichDailyBili, generateDaily } = await import('../lib/engine.js')
const store = await import('../lib/store.js')
const { normalizeConfig } = await import('../lib/config.js')
const date = '2026-11-12'
const at = (d = date, h = 10) => new Date(`${d}T${String(h).padStart(2, '0')}:00:00`).getTime()
function ledger() {
  return {
    mappings: [{ conversationId: 'dsh-1', sessionId: 'bili-1', createdAt: at(date, 8), parentSessionId: null, version: 1, sampleSeq: 2, foldSeqCounter: 1 }],
    lines: [{ sessionId: 'bili-1', seq: 1, at: at(date, 9), input: 1000, cached: 500, unk: 0, cr: 0, foldSeq: null }, { sessionId: 'bili-1', seq: 2, at: at(date, 11), input: 2000, cached: 1500, unk: 0, cr: 50, foldSeq: 1 }],
    folds: [{ sessionId: 'bili-1', seq: 1, at: at(), S: 1000, sigma: 100, T: 50, requestsAfter: 1 }],
  }
}
const fold = (m = ledger(), ids = ['dsh-1']) => foldBiliDay(date, ids, m)
const runtime = (name, state = 2) => ({ name, fibers: [{ state }] })
const context = (...rows) => ({ registry: { values: () => rows.values() } })

test('strict gate uses public active fibers for both exact installed plugin names', () => {
  assert.equal(isContextActive(context(runtime('dsh-context'))), true)
  assert.equal(isContextActive(context(runtime('dsh-context', 1))), false)
  assert.equal(areBiliSourcesActive(context(runtime('dsh-context'))), false)
  assert.equal(areBiliSourcesActive(context(runtime('dsh-context'), runtime('bili-native'))), true)
  assert.equal(areBiliSourcesActive(context(runtime('dsh-context'), runtime('bili-native', 4))), false)
  assert.equal(areBiliSourcesActive({}), false)
})

test('dated requests compute weighted cache rate and net deducts repayment plus summary overhead', () => {
  const out = fold()
  assert.equal(out.inputTokens, 3000)
  assert.equal(out.cachedTokens, 2000)
  assert.equal(out.cacheHitRate, 2 / 3)
  assert.equal(out.compressionCount, 1)
  assert.equal(out.reclaimedTokens, 900)
  assert.equal(out.netSavedTokens, 750)
  assert.equal(out.estimated, true, 'bili sigma itself is a persisted character-based estimate')
  assert.equal(out.status, 'ok')
})

test('negative net is retained and flagged; fractional wire coverage is not rounded', () => {
  const m = ledger(); m.folds[0].requestsAfter = 0
  assert.equal(fold(m).netSavedTokens, -150)
  assert.equal(fold(m).status, 'warning')
  assert.match(fold(m).anomalies[0], /为负/)
  m.folds[0].requestsAfter = 0.5
  assert.equal(fold(m).netSavedTokens, 300)
})

test('historical input/cache belong to each request date, never cumulative session totals', () => {
  const m = ledger(); m.lines[0].at = at('2026-11-11', 23)
  assert.equal(fold(m).inputTokens, 2000)
  assert.equal(fold(m).cachedTokens, 1500)
  m.lines[1].at = at('2026-11-13', 0)
  const out = fold(m)
  assert.equal(out.inputTokens, 0)
  assert.equal(out.netSavedTokens, null, 'cross-day cumulative coverage cannot be prorated')
  assert.equal(out.status, 'ok', 'the recorded compression still counts even when usage is unmeasurable')
  assert.deepEqual(out.anomalies, [])
})

test('same request and session aliases deduplicate without double counting', () => {
  const m = ledger(); m.lines.push({ ...m.lines[1] }); m.folds.push({ ...m.folds[0] })
  m.mappings.push({ ...m.mappings[0], conversationId: 'alias' })
  assert.equal(fold(m, ['dsh-1', 'alias', 'alias']).inputTokens, 3000)
  assert.equal(fold(m, ['dsh-1', 'alias']).netSavedTokens, 750)
  m.lines.at(-1).input = 99
  assert.equal(fold(m).inputTokens, null)
  assert.equal(fold(m).status, 'warning')
})

test('missing mappings, trimmed history, unknown cache samples and absent ledgers remain null', () => {
  assert.equal(fold(undefined, ['unknown']).inputTokens, null)
  const m = ledger(); m.mappings[0].sampleSeq = 3
  assert.equal(fold(m).inputTokens, null)
  assert.equal(fold(m).netSavedTokens, null)
  m.mappings[0].sampleSeq = 2; m.lines[1].unk = 1
  assert.equal(fold(m).cacheHitRate, null)
  assert.equal(fold(m).cachedTokens, null)
  assert.equal(fold(m).status, 'ok')
  m.mappings[0].version = null
  assert.equal(fold(m).compressionCount, null)
  assert.equal(foldBiliDay(date, [], {}).netSavedTokens, null)
})

test('sessions without a bili ledger are reported as coverage gaps, not fatal', () => {
  const m = ledger(); m.mappings.push({ ...m.mappings[0], sessionId: 'other' })
  assert.equal(fold(m).inputTokens, null, 'ambiguous mapping for the only session is still not countable')
  // One countable session plus one the ledger never saw: totals come from the
  // countable one and the card states how many were left out.
  const out = fold(ledger(), ['dsh-1', 'missing'])
  assert.equal(out.compressionCount, 1)
  assert.equal(out.inputTokens, 3000)
  assert.equal(out.netSavedTokens, 750)
  assert.match(out.coverage, /1\/2 会话可核算/)
  assert.match(out.coverage, /尚无 bili 映射/)
})

test('fork-inherited requests and compressions are excluded; inherited daily benefit is unknown', () => {
  const m = ledger(); m.mappings[0].parentSessionId = 'parent'
  // Use explicit half-hour to keep helper whole-hour-only.
  m.mappings[0].createdAt = at(date, 10) + 30 * 60000
  const out = fold(m)
  assert.equal(out.inputTokens, 2000)
  assert.equal(out.compressionCount, 0)
  assert.equal(out.netSavedTokens, null)
})

test('missing native/context source hides card and does not query metadata', async () => {
  let called = 0
  assert.equal(await collectBiliDay({ date, contextActive: false, discover: async () => null, readMetadata: async () => { called++; return ledger() } }), null)
  assert.equal(called, 0)
  const out = await collectBiliDay({ date, sessionIds: ['dsh-1'], contextActive: true, discover: async () => 'fixture', readMetadata: async () => ({ error: 'metadata-timeout' }) })
  assert.equal(out.inputTokens, null)
  assert.equal(out.status, 'unknown')
  assert.match(out.coverage, /超时/)
})

const markerHome = path.join(root, 'state')
const markerDir = path.join(markerHome, 'billion-context', 'instances')
mkdirSync(markerDir, { recursive: true })
const sessionsDir = path.join(root, 'sessions')
mkdirSync(sessionsDir)
const marker = { pid: process.pid, startedAt: Date.now() - 1000, origin: 'http://127.0.0.1:18787', sessionsDir }
writeFileSync(path.join(markerDir, 'one.json'), JSON.stringify(marker))

test('native discovery requires active context and one live loopback-marker store', async () => {
  const opts = { contextActive: true, env: { XDG_STATE_HOME: markerHome }, isAlive: () => true }
  assert.equal(await discoverBiliStore({ ...opts, contextActive: false }), null)
  assert.equal(await discoverBiliStore(opts), path.join(sessionsDir, 'index.db'))
  writeFileSync(path.join(markerDir, 'two.json'), JSON.stringify({ ...marker, sessionsDir: path.join(root, 'other') }))
  assert.equal(await discoverBiliStore(opts), null)
  rmSync(path.join(markerDir, 'two.json'))
  assert.equal(await discoverBiliStore({ ...opts, isAlive: () => false }), null)
})

const dbFile = path.join(sessionsDir, 'index.db')
{
  const db = new DatabaseSync(dbFile)
  db.exec('CREATE TABLE sessions(session_id TEXT, parent_session_id TEXT, created_at INTEGER, namespace TEXT, metadata_json TEXT); CREATE TABLE conversations(namespace TEXT, conversation_id TEXT, session_id TEXT);')
  const m = ledger()
  db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run('bili-1', null, at(date, 8), 'dsh', JSON.stringify({ privateSummary: 'DO-NOT-READ-SUMMARY', cacheLedger: { v: 1, sampleSeq: 2, foldSeqCounter: 1, lines: m.lines, folds: m.folds } }))
  db.prepare('INSERT INTO conversations VALUES(?,?,?)').run('dsh', 'dsh-1', 'bili-1')
  db.close()
}

test('real SQLite adapter projects only exact mapping and numeric fields; database stays unchanged', async () => {
  const { readFileSync } = await import('node:fs')
  const before = readFileSync(dbFile)
  const metadata = await readBiliMetadata(dbFile, ['dsh-1', 'dsh-1'])
  assert.equal(metadata.error, undefined, JSON.stringify(metadata))
  assert.equal(metadata.mappings[0].conversationId, 'dsh-1')
  assert.equal(metadata.lines.length, 2)
  assert.equal(JSON.stringify(metadata).includes('DO-NOT-READ'), false)
  assert.equal(fold(metadata).netSavedTokens, 750)
  assert.deepEqual(readFileSync(dbFile), before)
  assert.deepEqual(await readBiliMetadata(dbFile, ['not-mapped']), { mappings: [], lines: [], folds: [] })
  assert.equal((await readBiliMetadata(dbFile, Array.from({ length: 257 }, (_, i) => 's' + i))).error, 'session-limit')
  assert.ok((await readBiliMetadata(path.join(root, 'missing.db'), ['x'])).error)
})

test('saved daily enrichment is local only, preserves report and never mutates stored data', async () => {
  await store.saveFacts({ date, sessions: [{ id: 'dsh-1', summary: 'existing report fact, not bili content' }] })
  const original = { kind: 'daily', layer1: { headline: 'old' }, meta: { stable: true } }
  let calls = 0
  const out = await enrichDailyBili(original, date, { readBiliDay: async (day, ids) => { calls++; assert.equal(day, date); assert.deepEqual(ids, ['dsh-1']); return fold() }, llm: { stream() { throw Error('unexpected LLM') } } })
  assert.equal(out.layer1.bili.netSavedTokens, 750)
  assert.equal(original.layer1.bili, undefined)
  assert.deepEqual(out.meta, original.meta)
  assert.equal(calls, 1)
  assert.equal(await enrichDailyBili({ kind: 'weekly' }, date, { readBiliDay: () => { throw Error('weekly should not collect cumulative totals') } }).then(r => r.kind), 'weekly')
})

test('new generation saves facts.bili before buildDailyReport without any extra model call', async () => {
  let calls = 0, reads = 0
  const source = { list: async () => [{ id: 'dsh-1', createdAt: at(date, 8) }], read: async () => [{ type: 'user/message', seq: 1, time: at(), data: { source: { kind: 'user' }, content: 'synthetic' } }], titles: async () => ({}) }
  const out = await generateDaily({ cfg: normalizeConfig({ privacy: 'local-only', weather: { enabled: false }, heartbeat: false, health: { enabled: false } }), source, readBiliDay: async (d, ids) => { reads++; assert.equal(d, date); assert.deepEqual(ids, ['dsh-1']); return fold() }, llm: { stream() { calls++; throw Error('unexpected model') } } }, date)
  assert.equal(out.report.layer1.bili.netSavedTokens, 750)
  assert.equal((await store.loadFacts(date)).bili.netSavedTokens, 750)
  assert.equal(reads, 1)
  assert.equal(calls, 0)
})

test('saved report RPC and tool refresh bili locally without session body reads or LLM', async (t) => {
  const oldState = process.env.XDG_STATE_HOME
  process.env.XDG_STATE_HOME = markerHome
  const routes = new Map(), effects = [], tools = []
  let modelCalls = 0, bodyReads = 0
  const services = { sessionQuery: { listSessions: async () => [], readSession: async () => { bodyReads++; throw Error('no session body reads') } }, connection: { admit: () => ({ peer: { principal: { kind: 'owner' } } }), fetch: { register: r => { routes.set(r.path, r.fetch); return () => routes.delete(r.path) } } }, tools: { register: tool => { tools.push(tool); return () => {} } }, systemPrompt: { section: () => () => {} }, llm: { stream() { modelCalls++; throw Error('no model calls') } } }
  const ctx = { ...services, registry: context(runtime('dsh-context'), runtime('bili-native')).registry, get: n => services[n], effect: f => effects.push(f()), logger: { info() {} } }
  const { apply } = await import('../lib/index.js')
  apply(ctx)
  t.after(async () => { for (const e of effects) if (typeof e === 'function') await e(); if (oldState === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = oldState })
  const response = await routes.get('/api/daily-report/report')(new Request('http://127.0.0.1/api/daily-report/report', { method: 'POST', body: JSON.stringify({ type: 'client-request', rpcId: 'bili-test', payload: { kind: 'daily', key: date } }) }))
  const result = (await response.json()).result
  assert.equal(result.ok, true, JSON.stringify(result.error))
  assert.equal(result.value.report.layer1.bili.netSavedTokens, 750)
  const toolResult = await tools[0].execute({ kind: 'daily', date })
  assert.equal(toolResult.ok, true, toolResult.error)
  assert.match(toolResult.markdown, /bili|压缩/)
  assert.equal(bodyReads, 0)
  assert.equal(modelCalls, 0)
})

test.after(() => rmSync(root, { recursive: true, force: true }))
