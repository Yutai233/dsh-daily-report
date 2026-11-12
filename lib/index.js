/**
 * dsh-daily-report — DSH 每日简报 Host plugin (phases 1–3 of the design doc).
 *
 * Services: `sessionQuery` (session corpus), `connection` (browser RPC),
 * optional `tools`/`systemPrompt` (model-facing tool), `llm` +
 * `agentDefaultModel` (cloud summaries, privacy mode A only).
 *
 * Long-lived collectors: heartbeat (dsh start/stop) and, only when the user
 * opts in, the Windows keyboard/mouse idle sampler.
 *
 * Browser RPC (POST /api/daily-report/<method>, owner only):
 *   state     → config + morning card + recent report keys
 *   config    → patch settings
 *   generate  → {kind:'daily'|'weekly'|'monthly', date?}
 *   report    → {kind, key} saved report (+ html)
 *   dismiss   → mark today's morning card as seen
 *   geocode   → {name} weather location lookup
 *   models    → DSH model catalog for the cloud route picker
 *   probe     → test the local model endpoint
 *   open      → open a saved HTML report in the system browser
 *   prune     → delete data older than retentionDays
 * @module dsh-daily-report
 */

import { spawn } from 'node:child_process'
import path from 'node:path'
import { ConfigStore, publicConfig, sanitizeIncoming, CONFIG_FILE } from './config.js'
import { sessionQuerySource } from './collect/sessions.js'
import { createHeartbeat } from './collect/heartbeat.js'
import { createIdleSampler, readIdleDay } from './collect/idle.js'
import { geocode } from './collect/weather.js'
import { generateDaily, generatePeriod, duePeriods, targetDate, resolveReportTarget, notify } from './engine.js'
import { createCompleter } from './summarize.js'
import { renderHtml } from './render/html.js'
import * as store from './store.js'
import { DATA_DIR, fmtDate, isDateStr, isoWeek, writeText } from './util.js'
import { previousWeekRange, previousMonthRange } from './analyze/report.js'

import { stat } from 'node:fs/promises'

// Register the public ToolDefinition shape directly. This avoids resolving the
// Host's private dependencies from a link-installed plugin's real directory.

export const name = 'dsh-daily-report'
// Always-present base services. `llm` / `agentDefaultModel` are read lazily with
// ctx.get() so the plugin still mounts (local-only mode) when they are absent.
export const inject = ['sessionQuery', 'connection', 'tools', 'systemPrompt']

const API = 'daily-report/'
const METHODS = ['state', 'config', 'generate', 'report', 'dismiss', 'geocode', 'models', 'probe', 'open', 'prune']
const TICK_MS = 30000

const GUIDANCE =
  '本机已安装 dsh-daily-report（每日简报）插件：会话摘要、工具统计、dsh 启停、天气、7 日对比、成本建议、健康提醒、周报/月报。' +
  '用户问「日报 / 简报 / 周报 / 月报 / 昨天或上周做了什么 / 今天花了多少 token」时，可调用 daily_report 工具生成或读取报告；' +
  '历史报告的 Markdown 也保存在 ' + path.join(DATA_DIR, 'reports') + '，可直接读取回答「上周三我修了什么」。' +
  '插件设置（隐私边界、键鼠采样、投递时机等）由用户在 设置 → 每日简报 中决定，不要替用户修改隐私相关设置。'

function object(v) { return !!v && typeof v === 'object' && !Array.isArray(v) }
function isUserPeer(peer) { return peer?.principal?.kind === 'owner' && !peer.signal?.aborted }

/** Validate the shared RPC/tool arguments before any I/O or model request. */
function validateReportArgs(p) {
  const fail = (message) => { throw Object.assign(new Error(message), { code: 'bad-request' }) }
  if (p.kind !== undefined && !['daily', 'weekly', 'monthly'].includes(p.kind)) fail('报告类型必须是 daily / weekly / monthly')
  if (p.date !== undefined && (!isDateStr(p.date) || fmtDate(new Date(p.date + 'T00:00:00').getTime()) !== p.date)) fail('日期必须是有效的 YYYY-MM-DD')
  for (const k of ['current', 'regenerate']) if (p[k] !== undefined && typeof p[k] !== 'boolean') fail(k + ' 必须是布尔值')
}

/** Morning-card payload: layer 1 of the latest daily report + a little context. */
function cardOf(report, key, files, selection = {}, reportsDir = '') {
  if (!report) return null
  return {
    key,
    requestedDate: selection.requestedDate || key,
    fallbackNote: selection.fallbackNote || null,
    label: report.label,
    layer1: report.layer1,
    mainline: (report.sections.mainline || []).slice(0, 4),
    carryOver: (report.sections.carryOver || []).slice(0, 4),
    usage: report.sections.usage ? { rows: report.sections.usage.rows.slice(0, 2), spark: report.sections.usage.spark } : null,
    htmlPath: files ? files.html : store.reportPath('daily', key, 'html', reportsDir),
    mdPath: files ? files.md : store.reportPath('daily', key, 'md', reportsDir),
    generatedAt: report.generatedAt,
  }
}

export function apply(ctx, config = {}) {
  if (config.enabled === false) return
  const log = (m) => (ctx.logger?.info ? ctx.logger.info('[dsh-daily-report] ' + m) : undefined)
  const cfgStore = new ConfigStore()
  const source = sessionQuerySource(ctx.sessionQuery)
  const heartbeat = createHeartbeat({ dataDir: DATA_DIR, log })
  let idle = null
  let busy = null // in-flight generation promise (serialises runs)
  let lastError = null
  let disposed = false
  const firedKeys = new Set()

  const deps = async () => ({
    cfg: await cfgStore.load(),
    source,
    llm: ctx.get('llm'),
    agentDefaultModel: ctx.get('agentDefaultModel'),
    currentBootId: heartbeat.bootId,
    readIdleDay,
    log,
  })

  /** Serialise every generation so the scheduler and the UI never race. */
  function exclusive(fn) {
    const run = (busy || Promise.resolve()).then(() => {
      if (disposed) throw new Error('插件已停止')
      return fn()
    })
    // The tail always settles successfully so a failed run cannot poison the
    // queue or leave an unhandled rejection. Compare the actual stored promise.
    const tail = run.then(() => {}, () => {}).then(() => { if (busy === tail) busy = null })
    busy = tail
    return run
  }

  async function generateOne(dateStr, reason = 'manual') {
    try {
      const d = await deps()
      const selected = dateStr ? { date: dateStr, requestedDate: dateStr, fallbackNote: null } : await resolveReportTarget(source, d.cfg)
      if (selected.source) d.source = selected.source
      const out = await generateDaily(d, selected.date)
      await store.patchState({ lastGeneratedDate: selected.date, lastGeneratedAt: Date.now(), lastReason: reason })
      lastError = null
      log('daily ' + selected.date + ' (' + reason + ') → ' + out.files.html + ', llm calls ' + out.llmCalls)
      return { ...out, date: selected.date, requestedDate: selected.requestedDate, fallbackNote: selected.fallbackNote }
    } catch (err) { lastError = String(err?.message || err); throw err }
  }

  function runDaily(dateStr, { reason = 'manual' } = {}) {
    return exclusive(() => generateOne(dateStr, reason))
  }

  async function runPeriod(kind, range) {
    return exclusive(async () => generatePeriod(await deps(), kind, range))
  }

  /** The morning routine is atomic with respect to UI and scheduler runs. */
  async function morning(reason) {
    return exclusive(async () => {
      const cfg = await cfgStore.load()
      const today = fmtDate(Date.now())
      const requestedDate = targetDate(cfg)
      const state = await store.loadState()
      if (state.morningDoneFor === today + ':' + requestedDate) return
      const out = await generateOne(null, reason)
      for (const p of duePeriods(cfg, today)) {
        try { await generatePeriod(await deps(), p.kind, p.range) } catch (err) { log(p.kind + ' failed: ' + String(err)) }
      }
      await store.patchState({ morningDoneFor: today + ':' + requestedDate, cardDate: out.date, cardRequestedDate: out.requestedDate, cardFallbackNote: out.fallbackNote, cardDismissedFor: null })
      if (reason === 'fixed' && cfg.systemNotify) {
        const l1 = out.report.layer1
        const notification = await notify('DSH 每日简报 · ' + out.report.label, [l1.headline, l1.oneLiner].filter(Boolean).join('\n'), log)
        await store.patchState({ lastNotification: { ...notification, at: Date.now() } })
      }
      try { await store.prune(cfg.retentionDays, cfg.reportsDir) } catch { /* ignore */ }
    })
  }

  // ---- collectors that follow config
  async function syncCollectors() {
    const cfg = await cfgStore.load()
    if (disposed) return
    if (cfg.heartbeat) await heartbeat.start()
    else heartbeat.stop()
    if (cfg.inputSampling && process.platform === 'win32') {
      if (!idle) { idle = createIdleSampler({ dataDir: DATA_DIR, log }); idle.start() }
    } else if (idle) { idle.stop(); idle = null }
  }

  // ---- scheduler: fixed time and/or first open
  let ticking = false
  async function tick() {
    if (ticking || disposed) return
    ticking = true
    try {
      const cfg = await cfgStore.load()
      const now = new Date()
      const today = fmtDate(now.getTime())
      if (cfg.delivery === 'fixed' || cfg.delivery === 'both') {
        const [h, m] = cfg.deliveryTime.split(':').map(Number)
        const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).getTime()
        const key = 'fixed:' + today
        if (now.getTime() >= at && !firedKeys.has(key)) {
          try { await morning('fixed'); firedKeys.add(key) } catch (err) { throw err }
          for (const old of firedKeys) if (old !== key) firedKeys.delete(old)
        }
      }
    } catch (err) {
      log('tick failed: ' + String(err))
    } finally {
      ticking = false
    }
  }

  async function firstOpen() {
    const cfg = await cfgStore.load()
    if (cfg.delivery === 'first-open' || cfg.delivery === 'both') {
      try { await morning('first-open') } catch (err) { log('first-open failed: ' + String(err)) }
    }
  }

  // ---- RPC
  async function state(p = {}) {
    const cfg = await cfgStore.load()
    const st = await store.loadState()
    const today = fmtDate(Date.now())
    let card = null
    const cardDate = st.cardDate || null
    if (cardDate) {
      const r = await store.loadReport('daily', cardDate, cfg.reportsDir)
      card = cardOf(r, cardDate, null, { requestedDate: st.cardRequestedDate, fallbackNote: st.cardFallbackNote }, cfg.reportsDir)
    }
    const showCard = !!(card && cfg.popup && st.cardDismissedFor !== today && (st.morningDoneFor || '').startsWith(today))
    return {
      config: publicConfig(cfg),
      configPath: CONFIG_FILE,
      dataDir: DATA_DIR,
      reportsDir: store.reportsRoot(cfg.reportsDir),
      defaultReportsDir: store.reportsRoot(),
      platform: process.platform,
      card,
      showCard,
      generating: !!busy,
      lastError,
      lastGeneratedAt: st.lastGeneratedAt || null,
      lastNotification: st.lastNotification || null,
      host: { bootId: heartbeat.bootId, startedAt: heartbeat.startedAt },
      idle: { running: !!(idle && idle.running), lastIdleMs: idle ? idle.lastIdleMs : null },
      reports: {
        daily: (await store.listReports('daily', cfg.reportsDir)).slice(0, 30),
        weekly: (await store.listReports('weekly', cfg.reportsDir)).slice(0, 12),
        monthly: (await store.listReports('monthly', cfg.reportsDir)).slice(0, 12),
      },
      dataBytes: p.withSize ? await store.dataSize(cfg.reportsDir) : null,
      toolAvailable: !!disposeTool,
      toolError,
    }
  }

  async function rpc(method, p) {
    const cfg = await cfgStore.load()
    switch (method) {
      case 'state': return state(p)
      case 'config': {
        const next = await cfgStore.patch(sanitizeIncoming(object(p) ? p : {}))
        await syncCollectors()
        syncGuidance(next)
        return { config: publicConfig(next), reportsDir: store.reportsRoot(next.reportsDir) }
      }
      case 'generate': {
        const kind = p.kind || 'daily'
        validateReportArgs(p)
        if (kind === 'daily') {
          const out = await runDaily(p.date || null, { reason: 'manual' })
          const date = out.date
          await store.patchState({ cardDate: date, cardRequestedDate: out.requestedDate, cardFallbackNote: out.fallbackNote })
          return { kind, key: date, card: cardOf(out.report, date, out.files, out), html: out.html, files: out.files }
        }
        const anchor = isDateStr(p.date) ? p.date : fmtDate(Date.now())
        const range = kind === 'weekly'
          ? (p.current ? (() => { const w = isoWeek(anchor); return { start: w.start, end: w.end } })() : previousWeekRange(anchor))
          : (p.current ? { start: anchor.slice(0, 8) + '01', end: fmtDate(new Date(+anchor.slice(0, 4), +anchor.slice(5, 7), 0).getTime()) } : previousMonthRange(anchor))
        const out = await runPeriod(kind, { start: range.start, end: range.end })
        return { kind, key: out.key, html: out.html, files: out.files, label: out.report.label }
      }
      case 'report': {
        const kind = ['daily', 'weekly', 'monthly'].includes(p.kind) ? p.kind : 'daily'
        const key = String(p.key || '')
        if (!/^[\dW-]{4,10}$/.test(key)) throw Object.assign(new Error('bad key'), { code: 'bad-request' })
        const report = await store.loadReport(kind, key, cfg.reportsDir)
        if (!report) return { kind, key, report: null }
        const html = renderHtml(report)
        return { kind, key, report, html, card: kind === 'daily' ? cardOf(report, key, null, {}, cfg.reportsDir) : null }
      }
      case 'dismiss':
        await store.patchState({ cardDismissedFor: fmtDate(Date.now()) })
        return { ok: true }
      case 'geocode':
        return { results: await geocode(String(p.name || '').slice(0, 100)) }
      case 'models': {
        const llm = ctx.get('llm')
        if (!llm) return { models: [] }
        const rows = []
        for (const prov of llm.listProviders()) {
          try {
            for (const m of await llm.listModels(prov.id)) rows.push({ provider: prov.id, providerLabel: prov.name || prov.id, model: m.id, label: m.name || m.id })
          } catch { /* provider unavailable */ }
        }
        const sel = ctx.get('agentDefaultModel')?.currentSelection?.()
        return { models: rows, defaultRoute: sel && sel.provider ? { provider: sel.provider, model: sel.model } : null }
      }
      case 'probe': {
        const cfg = await cfgStore.load()
        const merged = { ...cfg, privacy: 'local-model', localModel: { ...cfg.localModel, ...(object(p.localModel) ? sanitizeIncoming({ localModel: p.localModel }).localModel : {}) } }
        const complete = createCompleter(merged, { log })
        if (!complete) return { ok: false, error: '地址必须是本机回环地址（127.0.0.1 / localhost），且需填写模型名' }
        const t0 = Date.now()
        const text = await complete('只回复“好”。', '测试', 8)
        return text ? { ok: true, ms: Date.now() - t0, sample: text.slice(0, 40) } : { ok: false, error: '没有收到回复，请检查地址、模型名与服务是否已启动' }
      }
      case 'open': {
        const kind = ['daily', 'weekly', 'monthly'].includes(p.kind) ? p.kind : 'daily'
        const key = String(p.key || '')
        if (!/^[\dW-]{4,10}$/.test(key)) throw Object.assign(new Error('bad key'), { code: 'bad-request' })
        const ext = p.format === 'md' ? '.md' : '.html'
        const file = path.join(store.reportsRoot(cfg.reportsDir), kind, key + ext)
        if (ext === '.html') {
          const saved = await store.loadReport(kind, key, cfg.reportsDir)
          if (saved) await writeText(file, renderHtml(saved))
        }
        await stat(file)
        await openFile(file)
        return { ok: true, file }
      }
      case 'prune': {
        const cfg = await cfgStore.load()
        return { removed: await store.prune(cfg.retentionDays, cfg.reportsDir) }
      }
      default:
        throw Object.assign(new Error('unknown method'), { code: 'unknown-method' })
    }
  }

  function openFile(file) {
    const cmd = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open'
    return new Promise((resolve, reject) => {
      const c = spawn(cmd, [file], { stdio: 'ignore', detached: true, windowsHide: true })
      c.once('error', reject)
      c.once('spawn', () => { c.unref(); resolve() })
    })
  }

  function handler(method) {
    return async (request) => {
      const connection = ctx.get('connection')
      const admission = connection.admit(request)
      if ('rejection' in admission) return new Response('unauthorized', { status: admission.rejection })
      if (!isUserPeer(admission.peer)) return new Response('forbidden', { status: 403 })
      let message
      try { message = await request.json() } catch { return new Response('Invalid JSON.', { status: 400 }) }
      if (!object(message) || message.type !== 'client-request' || typeof message.rpcId !== 'string') return new Response('Invalid RPC envelope.', { status: 400 })
      let payload = message.payload
      if (object(payload) && Object.keys(payload).length === 1 && object(payload.args)) payload = payload.args
      let result
      try {
        result = { ok: true, value: await rpc(method, object(payload) ? payload : {}) }
      } catch (err) {
        result = { ok: false, error: { code: 'daily-report/' + (err.code || 'failed'), message: String((err && err.message) || err), details: {} } }
      }
      return Response.json({ type: 'server-response', rpcId: message.rpcId, result })
    }
  }

  const connection = ctx.get('connection')
  const removers = METHODS.map((m) => connection.fetch.register({ path: '/api/' + API + m, methods: ['POST'], requestBody: 'buffered', fetch: handler(m) }))

  // ---- model-facing tool
  const tools = ctx.get('tools')
  let disposeTool = null
  let toolError = null
  if (tools) {
    try {
      disposeTool = tools.register({
      name: 'daily_report',
      description: '生成或读取 DSH 每日简报 / 周报 / 月报（Markdown）。kind: daily|weekly|monthly；date: YYYY-MM-DD（日报为该日；周/月报为其所在周期的上一周期，配合 current=true 取当前周期）；regenerate=false 时优先读已保存的报告。',
      parameters: {
        type: 'object', additionalProperties: false,
        properties: {
          kind: { type: 'string', enum: ['daily', 'weekly', 'monthly'], description: '报告类型，默认 daily' },
          date: { type: 'string', description: 'YYYY-MM-DD；省略时自动选日期，无活动则回退；指定日期不回退' },
          current: { type: 'boolean', description: '周/月报取当前周期（默认上一周期）' },
          regenerate: { type: 'boolean', description: '强制重新生成（默认 false）' },
        },
      },
      output: {
        schema: { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' }, label: { type: 'string' }, markdown: { type: 'string' }, file: { type: 'string' }, error: { type: 'string' } } },
        render: (_a, v) => [{ type: 'text', text: v.ok ? v.markdown + '\n\n（已保存：' + v.file + '）' : '[failed] ' + (v.error || '生成失败') }],
      },
      async execute(args) {
        try {
          if (!object(args)) throw new Error('参数必须是对象')
          validateReportArgs(args)
          const kind = args.kind || 'daily'
          const cfg = await cfgStore.load()
          if (kind === 'daily') {
            const date = args.date || (await resolveReportTarget(source, cfg)).date
            if (!args.regenerate && date < fmtDate(Date.now())) {
              const saved = await store.loadReport('daily', date, cfg.reportsDir)
              if (saved) {
                const { readFile } = await import('node:fs/promises')
                const file = store.reportPath('daily', date, 'md', cfg.reportsDir)
                const md = await readFile(file, 'utf8').catch(() => null)
                if (md) return { ok: true, label: saved.label, markdown: md, file }
              }
            }
            const out = await runDaily(date, { reason: 'tool' })
            return { ok: true, label: out.report.label, markdown: out.markdown, file: out.files.md }
          }
          const v = await rpc('generate', { kind, date: args.date, current: !!args.current })
          const { readFile } = await import('node:fs/promises')
          return { ok: true, label: v.label, markdown: await readFile(v.files.md, 'utf8'), file: v.files.md }
        } catch (err) {
          return { ok: false, error: String((err && err.message) || err) }
        }
      },
      })
    } catch (err) { toolError = String(err?.message || err); log('daily_report registration failed: ' + toolError) }
  } else { toolError = 'Host tools 服务不可用' }
  let disposeSection = null
  const sp = ctx.get('systemPrompt')
  function syncGuidance(cfg) {
    if (disposeSection) { disposeSection(); disposeSection = null }
    if (sp && cfg.announceToAgent && !disposed) disposeSection = sp.section({ name: 'plugin:dsh-daily-report', order: 150, text: GUIDANCE.replace(path.join(DATA_DIR, 'reports'), store.reportsRoot(cfg.reportsDir)) })
  }

  let firstOpenTimer = null
  // ---- start
  ;(async () => {
    const cfg = await cfgStore.load()
    syncGuidance(cfg)
    await syncCollectors()
    // Let the Host finish booting before reading the whole corpus.
    firstOpenTimer = setTimeout(() => { if (!disposed) firstOpen().then(tick) }, 8000)
    firstOpenTimer.unref?.()
  })().catch((err) => log('start failed: ' + String(err)))
  const timer = setInterval(() => { tick() }, TICK_MS)
  timer.unref?.()

  ctx.effect(() => () => {
    disposed = true
    clearInterval(timer)
    clearTimeout(firstOpenTimer)
    heartbeat.stop()
    if (idle) idle.stop()
    if (disposeTool) disposeTool()
    if (disposeSection) disposeSection()
    return Promise.all(removers.map((r) => r()))
  })
}
