/**
 * Session-log collector: turns every session active on one local day into the
 * deterministic part of DayFacts (CONTRACT §2). No model calls happen here;
 * summaries are attached later by summarize.js.
 *
 * The collector reads through a small "source" adapter so the same code runs
 * against the Host's `sessionQuery` service and against a raw-log reader in
 * tests:
 *   source.list()      → [{ id, createdAt, cwd, origin, parentSession }]
 *   source.read(id)    → raw event array (`{type, seq, time, data}`)
 *   source.titles(ids) → { [id]: title }
 *
 * @module dsh-daily-report/collect/sessions
 */

import path from 'node:path'
import { dayRange, mapLimit, quantile, truncate } from '../util.js'
import { costOf, DEFAULT_PRICING } from '../analyze/cost.js'

/** Tool names whose `file_path` argument counts as a file change. */
const EDIT_TOOLS = new Set(['edit', 'write', 'str_replace', 'str_replace_editor', 'str_replace_based_edit_tool', 'apply_patch', 'multi_edit', 'notebook_edit', 'fs_write', 'fs_edit'])
/** Tool names whose arguments carry a URL worth counting by domain. */
const URL_TOOLS = new Set(['web_fetch', 'fetch', 'webfetch', 'browser_navigate', 'research'])
/** User phrasing that suggests the previous turn missed the intent. */
const REWORK_RE = /(不对|不是这个意思|重来|重新来|搞错了|错了|理解错|没听懂|又错|还是不行|不行啊|返工|撤回|undo|that'?s wrong|not what i)/i

/** Extract plain text from message content blocks. */
export function textOf(content) {
  if (typeof content === 'string') return content
  let out = ''
  if (Array.isArray(content)) {
    for (const b of content) if (b && b.type === 'text' && typeof b.text === 'string') out += (out ? '\n' : '') + b.text
  }
  return out
}

/** Parse tool-call arguments that may be a JSON string or an object. */
function argsOf(raw) {
  if (raw && typeof raw === 'object') return raw
  if (typeof raw !== 'string') return {}
  try { const v = JSON.parse(raw); return v && typeof v === 'object' ? v : {} } catch { return {} }
}

/** Classify a shell command label into a coarse family. */
export function commandFamily(label) {
  const s = String(label || '').trim().toLowerCase().replace(/^(&\s*)?["']?[a-z]:[\\/][^"']*[\\/]/, '').replace(/^(cd\s+[^;&|]+[;&|]+\s*)+/, '')
  const first = s.split(/[\s;|&]+/)[0].replace(/\.(exe|cmd|bat|ps1)["']?$/, '')
  if (first === 'git' || first === 'gh') return 'git'
  if (['npm', 'pnpm', 'yarn', 'npx', 'bun'].includes(first)) return 'npm'
  if (['node', 'tsx', 'deno', 'ts-node'].includes(first)) return 'node'
  if (['python', 'python3', 'py', 'pip', 'pip3', 'uv', 'pytest'].includes(first)) return 'python'
  if (/^(get-|set-|new-|remove-|copy-|move-|test-|select-|invoke-|start-|stop-|out-|write-|read-|ls$|dir$|cat$|gc$|rm$|cp$|mv$|echo$|\$)/.test(first) || first === 'pwsh' || first === 'powershell') return 'pwsh'
  return 'other'
}

/** Normalise a file path for counting: forward slashes, relative to cwd when inside it. */
function normPath(p, cwd) {
  if (typeof p !== 'string' || !p) return null
  let s = p.replace(/\\/g, '/')
  if (cwd) {
    const c = String(cwd).replace(/\\/g, '/').replace(/\/+$/, '')
    if (s.toLowerCase().startsWith(c.toLowerCase() + '/')) s = s.slice(c.length + 1)
  }
  return s
}

/** Domain of a URL, or null. */
function domainOf(u) {
  try { return new URL(String(u)).hostname.replace(/^www\./, '') } catch { return null }
}

/** True for a message the human typed (not injected, not system). */
function isHuman(data) {
  return !!(data && data.source && data.source.kind === 'user')
}

/**
 * Fold one session's raw events into per-session stats for `[start, end)`.
 * Exported for unit tests.
 * @param {object} meta - `{ id, cwd, createdAt, title }`.
 * @param {Array} events - raw events in seq order.
 * @param {number} start - day start (ms).
 * @param {number} end - day end (ms).
 * @param {object} pricing - pricing table for cost estimates.
 * @returns {object|null} per-session accumulator, or null when inactive that day.
 */
export function foldSession(meta, events, start, end, pricing = DEFAULT_PRICING) {
  const inDay = (t) => typeof t === 'number' && t >= start && t < end
  const s = {
    id: meta.id, title: meta.title || null, cwd: meta.cwd || null,
    workspace: meta.cwd ? path.basename(String(meta.cwd).replace(/[\\/]+$/, '')) : null,
    firstActive: null, lastActive: null,
    userMessages: 0, turns: 0, toolCalls: 0,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 0 },
    costCny: 0, filesChanged: [], failures: [], openTodos: [], interruptedTurns: 0, errorTurns: 0,
    deliverables: [], retries: 0, summary: null, summarySource: null,
    lastSeq: -1,
  }
  // Day-local accumulators that feed the cross-session aggregates.
  const acc = {
    turnEnds: {}, retryCodes: {}, tools: {}, toolFailures: {}, commands: {}, commandLabels: [],
    files: {}, domains: {}, approvals: { count: 0, waitMs: 0 }, usageEvents: [], humanTimes: [], hourly: new Array(24).fill(0),
    reworkCount: 0, outputTokens: 0, streamMs: 0, ttft: [], humanTexts: [], finalReplies: [],
  }
  const pendingCalls = new Map() // callId → { name, time }
  const pendingApprovals = new Map()
  let lastTodos = null
  let currentTurn = null
  let lastAssistantText = null
  let lastAssistantTurn = null
  let firstTurnUserText = null
  let lastStepStart = null
  let active = false

  const touch = (t) => {
    active = true
    if (s.firstActive === null || t < s.firstActive) s.firstActive = t
    if (s.lastActive === null || t > s.lastActive) s.lastActive = t
  }

  for (const e of events) {
    if (!e || typeof e.type !== 'string') continue
    if (typeof e.seq === 'number' && e.seq > s.lastSeq) s.lastSeq = e.seq
    const d = e.data || {}
    // Track pending state even before the day starts so cross-midnight pairs resolve.
    if (e.type === 'tool/call' && d.callId) pendingCalls.set(d.callId, { name: d.name, time: e.time })
    if (e.type === 'approval/asked' && d.id) pendingApprovals.set(d.id, e.time)
    if (e.type === 'todo/write' && Array.isArray(d.todos)) lastTodos = d.todos
    if (e.type === 'turn/start') currentTurn = d.turn
    if (e.type === 'step/start') lastStepStart = e.time
    if (!inDay(e.time)) continue

    switch (e.type) {
      case 'user/message': {
        if (!isHuman(d)) break
        touch(e.time)
        s.userMessages++
        acc.humanTimes.push(e.time)
        acc.hourly[new Date(e.time).getHours()]++
        const text = textOf(d.content)
        if (firstTurnUserText === null) firstTurnUserText = text
        acc.humanTexts.push(text)
        if (REWORK_RE.test(text.slice(0, 200))) acc.reworkCount++
        break
      }
      case 'turn/start':
        touch(e.time)
        s.turns++
        break
      case 'assistant/message': {
        touch(e.time)
        const msg = d.message || {}
        acc.hourly[new Date(e.time).getHours()]++
        const text = textOf(msg.content).trim()
        if (text) { lastAssistantText = text; lastAssistantTurn = d.turn ?? currentTurn }
        const u = d.usage
        if (u) {
          s.tokens.input += u.inputTokens || 0
          s.tokens.output += u.outputTokens || 0
          s.tokens.cacheRead += u.cacheReadTokens || 0
          s.tokens.cacheWrite += u.cacheWriteTokens || 0
          s.tokens.reasoning += u.reasoningTokens || 0
          const total = u.totalTokens || ((u.inputTokens || 0) + (u.outputTokens || 0) + (u.cacheReadTokens || 0) + (u.cacheWriteTokens || 0))
          s.tokens.total += total
          // 模型名（`deepseek-v4-pro` 按 3 倍价计）来自 assistant/message 的 message.source.model。
          const model = msg.source && typeof msg.source.model === 'string' ? msg.source.model : ''
          const c = costOf(u, pricing, e.time, model)
          s.costCny += c
          acc.usageEvents.push({ t: e.time, costCny: c, tokens: total, sessionId: meta.id, turn: d.turn ?? currentTurn })
          // Output speed from the stream timestamps.
          const stream = Array.isArray(d.stream) ? d.stream : []
          let first = null
          let last = null
          for (const ch of stream) {
            const t0 = typeof ch.time === 'number' ? ch.time : (typeof ch.time0 === 'number' ? ch.time0 : null)
            if (t0 === null) continue
            let t1 = t0
            if (Array.isArray(ch.dt)) t1 = t0 + ch.dt.reduce((a, b) => a + (Number(b) || 0), 0)
            if (first === null || t0 < first) first = t0
            if (last === null || t1 > last) last = t1
          }
          if (first !== null && last !== null && last > first && (u.outputTokens || 0) > 0) {
            acc.outputTokens += u.outputTokens
            acc.streamMs += last - first
          }
          if (first !== null && lastStepStart !== null && first >= lastStepStart && first - lastStepStart < 600000) acc.ttft.push(first - lastStepStart)
        }
        break
      }
      case 'tool/call': {
        touch(e.time)
        s.toolCalls++
        const name = String(d.name || 'unknown')
        const t = acc.tools[name] || (acc.tools[name] = { count: 0, errors: 0, durations: [] })
        t.count++
        const a = argsOf(d.arguments)
        if (EDIT_TOOLS.has(name)) {
          const p = normPath(a.file_path || a.path || a.filePath, meta.cwd)
          if (p) acc.files[p] = (acc.files[p] || 0) + 1
        }
        if (URL_TOOLS.has(name) || typeof a.url === 'string') {
          const dom = domainOf(a.url)
          if (dom) acc.domains[dom] = (acc.domains[dom] || 0) + 1
        }
        break
      }
      case 'tool/result': {
        const msg = d.message || {}
        const callId = msg.toolCallId || (msg.source && msg.source.callId)
        const call = callId ? pendingCalls.get(callId) : null
        if (call) {
          pendingCalls.delete(callId)
          const t = acc.tools[call.name] || (acc.tools[call.name] = { count: 0, errors: 0, durations: [] })
          if (typeof call.time === 'number') t.durations.push(Math.max(0, e.time - call.time))
          if (msg.isError === true) {
            t.errors++
            const detail = truncate(textOf(msg.content).replace(/\s+/g, ' ').trim(), 80) || 'error'
            s.failures.push({ kind: 'tool', name: call.name, detail })
            const key = call.name + '\u0000' + detail
            acc.toolFailures[key] = (acc.toolFailures[key] || 0) + 1
          }
        }
        break
      }
      case 'job/registered': {
        const fam = commandFamily(d.label)
        acc.commands[fam] = (acc.commands[fam] || 0) + 1
        if (d.label) acc.commandLabels.push(truncate(String(d.label).replace(/\s+/g, ' '), 160))
        break
      }
      case 'job/settled': {
        if (d.status && d.status !== 'completed') {
          s.failures.push({ kind: 'job', name: truncate(String(d.label || d.kind || 'job').replace(/\s+/g, ' '), 60), detail: String(d.detail || d.status) })
        } else if (typeof d.detail === 'string' && /exit code:\s*[1-9]/.test(d.detail)) {
          s.failures.push({ kind: 'job', name: truncate(String(d.label || d.kind || 'job').replace(/\s+/g, ' '), 60), detail: d.detail })
        }
        break
      }
      case 'approval/decided': {
        const asked = pendingApprovals.get(d.id)
        if (typeof asked === 'number') {
          acc.approvals.count++
          acc.approvals.waitMs += Math.max(0, e.time - asked)
          pendingApprovals.delete(d.id)
        }
        break
      }
      case 'llm/retry': {
        s.retries++
        const code = (d.failure && d.failure.code) || 'UNKNOWN'
        acc.retryCodes[code] = (acc.retryCodes[code] || 0) + 1
        break
      }
      case 'turn/end': {
        const k = (d.reason && d.reason.kind) || 'unknown'
        acc.turnEnds[k] = (acc.turnEnds[k] || 0) + 1
        if (k === 'interrupted') s.interruptedTurns++
        if (k === 'error') s.errorTurns++
        if (lastAssistantText && lastAssistantTurn === d.turn) acc.finalReplies.push(lastAssistantText)
        break
      }
      case 'deliverables/presented':
        for (const f of Array.isArray(d.files) ? d.files : []) {
          if (f && f.path) s.deliverables.push({ path: String(f.path), description: String(f.description || '') })
        }
        break
      default:
        break
    }
  }
  if (!active) return null
  // A turn still running (no turn/end) keeps its latest reply as the conclusion.
  if (lastAssistantText && !acc.finalReplies.includes(lastAssistantText)) acc.finalReplies.push(lastAssistantText)

  s.costCny = Math.round(s.costCny * 10000) / 10000
  s.filesChanged = Object.entries(acc.files).map(([p, count]) => ({ path: p, count })).sort((a, b) => b.count - a.count)
  if (lastTodos) {
    s.openTodos = lastTodos.filter((t) => t && t.status !== 'completed' && t.status !== 'cancelled').map((t) => truncate(String(t.content || t.text || ''), 140)).filter(Boolean)
  }
  if (!s.title && firstTurnUserText) s.title = truncate(firstTurnUserText.replace(/\s+/g, ' ').trim(), 40)
  return { session: s, acc }
}

/**
 * Collect DayFacts for one local date.
 * @param {object} source - adapter with `list()`, `read(id)`, `titles(ids)`.
 * @param {string} dateStr - `YYYY-MM-DD`.
 * @param {object} [opts]
 * @param {boolean} [opts.includeSubagents=false] - fold subagent sessions into the totals.
 * @param {object} [opts.pricing] - pricing table.
 * @param {(msg:string)=>void} [opts.log]
 * @returns {Promise<object>} DayFacts without host/weather/idle (those are null).
 */
export async function collectDay(source, dateStr, opts = {}) {
  const { start, end } = dayRange(dateStr)
  const pricing = opts.pricing || DEFAULT_PRICING
  const log = opts.log || (() => {})
  const records = await source.list()
  const candidates = records.filter((r) => r && r.createdAt < end && (opts.includeSubagents || r.origin !== 'subagent'))
  let titles = {}
  try { titles = (await source.titles(candidates.map((r) => r.id))) || {} } catch (err) { log('titles failed: ' + String(err)) }

  let failedReads = 0
  const folded = await mapLimit(candidates, 4, async (r) => {
    let events
    try { events = await source.read(r.id) } catch (err) { failedReads++; log('read ' + r.id + ' failed: ' + String(err)); return null }
    // Cheap reject: no event inside the day.
    if (!events.some((e) => e && e.time >= start && e.time < end)) return null
    const out = foldSession({ id: r.id, cwd: r.cwd, createdAt: r.createdAt, title: titles[r.id] }, events, start, end, pricing)
    // A blank session that never received a human message or tool call is noise.
    if (!out || (out.session.userMessages === 0 && out.session.toolCalls === 0 && out.session.tokens.total === 0)) return null
    return out
  })
  const items = folded.filter(Boolean)

  const totals = {
    sessions: items.length, userMessages: 0, turns: 0, toolCalls: 0,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 0 },
    costCny: 0, turnEnds: {}, retries: 0, retryCodes: {},
  }
  const tools = {}
  const toolFailures = {}
  const commands = { git: 0, npm: 0, node: 0, python: 0, pwsh: 0, other: 0 }
  const commandLabels = []
  const files = {}
  const domains = {}
  const approvals = { count: 0, waitMs: 0 }
  const usageEvents = []
  const hourly = new Array(24).fill(0)
  const humanTimes = []
  let reworkCount = 0
  let outTok = 0
  let streamMs = 0
  const ttft = []
  const carryOver = []

  for (const { session: s, acc } of items) {
    totals.userMessages += s.userMessages
    totals.turns += s.turns
    totals.toolCalls += s.toolCalls
    for (const k of Object.keys(totals.tokens)) totals.tokens[k] += s.tokens[k]
    totals.costCny += s.costCny
    totals.retries += s.retries
    for (const [k, v] of Object.entries(acc.turnEnds)) totals.turnEnds[k] = (totals.turnEnds[k] || 0) + v
    for (const [k, v] of Object.entries(acc.retryCodes)) totals.retryCodes[k] = (totals.retryCodes[k] || 0) + v
    for (const [name, t] of Object.entries(acc.tools)) {
      const g = tools[name] || (tools[name] = { count: 0, errors: 0, durations: [] })
      g.count += t.count; g.errors += t.errors; g.durations.push(...t.durations)
    }
    for (const [k, v] of Object.entries(acc.toolFailures)) toolFailures[k] = (toolFailures[k] || 0) + v
    for (const [k, v] of Object.entries(acc.commands)) commands[k] = (commands[k] || 0) + v
    commandLabels.push(...acc.commandLabels)
    const prefix = items.length > 1 && s.workspace ? s.workspace + '/' : ''
    for (const [k, v] of Object.entries(acc.files)) files[prefix + k] = (files[prefix + k] || 0) + v
    for (const [k, v] of Object.entries(acc.domains)) domains[k] = (domains[k] || 0) + v
    approvals.count += acc.approvals.count
    approvals.waitMs += acc.approvals.waitMs
    usageEvents.push(...acc.usageEvents)
    acc.hourly.forEach((v, i) => { hourly[i] += v })
    humanTimes.push(...acc.humanTimes)
    reworkCount += acc.reworkCount
    outTok += acc.outputTokens
    streamMs += acc.streamMs
    ttft.push(...acc.ttft)
    for (const t of s.openTodos) carryOver.push({ text: t, sessionId: s.id, title: s.title, kind: 'todo' })
    if (s.interruptedTurns > 0 && s.openTodos.length === 0) {
      carryOver.push({ text: '「' + truncate(s.title || '未命名会话', 30) + '」有 ' + s.interruptedTurns + ' 轮被中断，可能需要接着做', sessionId: s.id, title: s.title, kind: 'interrupted' })
    }
  }
  totals.costCny = Math.round(totals.costCny * 10000) / 10000

  const top = Object.entries(tools).map(([name, t]) => {
    const ds = t.durations.slice().sort((a, b) => a - b)
    return { name, count: t.count, errors: t.errors, p50Ms: ds.length ? Math.round(quantile(ds, 0.5)) : null, p90Ms: ds.length ? Math.round(quantile(ds, 0.9)) : null }
  }).sort((a, b) => b.count - a.count)

  const sessions = items.map(({ session: s }) => s).sort((a, b) => (a.firstActive || 0) - (b.firstActive || 0))
  const allActive = sessions.filter((s) => s.firstActive !== null)
  humanTimes.sort((a, b) => a - b)

  // 待办按会话活跃度（当日 token 总数，其次工具调用、最近活跃）排序：
  // 卡片只露出前两条，先露最值得接着做的那个会话。
  const activity = new Map()
  for (const { session: s } of items) {
    activity.set(s.id, { tokens: (s.tokens && s.tokens.total) || 0, toolCalls: s.toolCalls || 0, lastActive: s.lastActive || 0 })
  }
  const rankOf = (item) => activity.get(item.sessionId) || { tokens: 0, toolCalls: 0, lastActive: 0 }
  carryOver.sort((a, b) => {
    const ra = rankOf(a)
    const rb = rankOf(b)
    return rb.tokens - ra.tokens || rb.toolCalls - ra.toolCalls || rb.lastActive - ra.lastActive
  })

  const facts = {
    version: 1,
    date: dateStr,
    generatedAt: Date.now(),
    sessions,
    totals,
    tools: {
      top,
      failures: Object.entries(toolFailures).map(([k, count]) => { const [name, detail] = k.split('\u0000'); return { name, detail, count } }).sort((a, b) => b.count - a.count),
      commands,
      hotFiles: Object.entries(files).map(([p, count]) => ({ path: p, count })).sort((a, b) => b.count - a.count).slice(0, 20),
      domains: Object.entries(domains).map(([domain, count]) => ({ domain, count })).sort((a, b) => b.count - a.count).slice(0, 20),
      approvals,
      speed: {
        outputTokPerSec: streamMs > 0 ? Math.round((outTok / (streamMs / 1000)) * 10) / 10 : null,
        ttftMsP50: ttft.length ? Math.round(quantile(ttft.slice().sort((a, b) => a - b), 0.5)) : null,
      },
    },
    usageEvents: usageEvents.sort((a, b) => a.t - b.t),
    activity: {
      firstActive: allActive.length ? Math.min(...allActive.map((s) => s.firstActive)) : null,
      lastActive: allActive.length ? Math.max(...allActive.map((s) => s.lastActive)) : null,
      hourly,
      userMessageTimes: humanTimes,
    },
    rework: { count: reworkCount, userMessages: totals.userMessages, ratio: totals.userMessages ? Math.round((reworkCount / totals.userMessages) * 100) / 100 : 0 },
    carryOver,
    commandLabels: commandLabels.slice(-50),
    failedReads,
    host: null,
    weather: null,
    idle: null,
  }
  // Raw material for the summarizer; not persisted (see buildFactPack).
  Object.defineProperty(facts, '_packs', {
    enumerable: false,
    value: Object.fromEntries(items.map(({ session: s, acc }) => [s.id, buildFactPack(s, acc)])),
  })
  return facts
}

/**
 * Build the compressed "fact pack" for one session (design §2): every human
 * message, the last reply of each turn, changed files, failures and open todos.
 * Bounded to roughly `maxChars` characters (≈ 2–4k tokens).
 * @param {object} s - folded session.
 * @param {object} acc - folded accumulators.
 * @param {number} [maxChars=9000]
 * @returns {string}
 */
export function buildFactPack(s, acc, maxChars = 9000) {
  const lines = []
  lines.push('会话标题：' + (s.title || '未命名'))
  if (s.workspace) lines.push('工作区：' + s.workspace)
  const human = acc.humanTexts.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const replies = acc.finalReplies.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const budgetHuman = Math.floor(maxChars * 0.4 / Math.max(1, human.length))
  const budgetReply = Math.floor(maxChars * 0.4 / Math.max(1, replies.length))
  lines.push('【用户消息】')
  human.slice(-12).forEach((t, i) => lines.push((i + 1) + '. ' + truncate(t, Math.max(200, budgetHuman))))
  if (replies.length) {
    lines.push('【每轮最后的助手回复】')
    replies.slice(-8).forEach((t, i) => lines.push((i + 1) + '. ' + truncate(t, Math.max(300, budgetReply))))
  }
  if (s.filesChanged.length) lines.push('【改动的文件】' + s.filesChanged.slice(0, 15).map((f) => f.path + '×' + f.count).join('，'))
  if (s.deliverables.length) lines.push('【交付物】' + s.deliverables.slice(0, 8).map((f) => path.basename(f.path)).join('，'))
  if (s.failures.length) lines.push('【失败】' + s.failures.slice(0, 8).map((f) => f.name + '：' + f.detail).join('；'))
  if (s.openTodos.length) lines.push('【未完成待办】' + s.openTodos.slice(0, 8).join('；'))
  if (s.interruptedTurns) lines.push('【被中断轮次】' + s.interruptedTurns)
  const text = lines.join('\n')
  return text.length > maxChars ? text.slice(0, maxChars) + '…' : text
}

/**
 * Adapter over the Host `sessionQuery` service (DSH ≥ 0.2).
 * @param {object} sq - `ctx.sessionQuery`.
 * @returns {{list: Function, read: Function, titles: Function}}
 */
export function sessionQuerySource(sq) {
  return {
    async list() {
      const records = await sq.listSessions()
      return records.map((r) => ({
        id: r.header.id,
        createdAt: r.header.createdAt,
        cwd: r.header.cwd || null,
        origin: r.header.origin || null,
        parentSession: r.header.parentSession || null,
      }))
    },
    async read(id) {
      const snap = await sq.readSession(id)
      return snap && Array.isArray(snap.events) ? snap.events : []
    },
    async titles(ids) {
      const out = {}
      if (!ids.length) return out
      const results = await sq.readTitleSnapshots(ids)
      results.forEach((r, i) => {
        if (r && r.status === 'fulfilled' && r.value && r.value.title) {
          const id = r.sessionId || (r.value.session && r.value.session.id) || ids[i]
          out[id] = r.value.title.title
        }
      })
      return out
    },
  }
}
