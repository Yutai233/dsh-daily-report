/**
 * Layered summaries (design §2) with the three privacy modes of design §8.1:
 *
 *   A `cloud` — fact packs (conversation text) go to the DSH default model or a
 *               user-chosen provider/model from the DSH catalog.
 *   B `local-only` (default) — no text leaves the machine; deterministic
 *               template sentences built from titles + statistics.
 *   C `local-model` — fact packs go to a local OpenAI-compatible endpoint
 *               (Ollama / LM Studio / llama.cpp server). Never falls back to cloud.
 *
 * Cache key = sessionId + last event seq + mode: yesterday's sessions never
 * change, so they cost nothing the next day.
 * @module dsh-daily-report/summarize
 */

import path from 'node:path'
import { isIP } from 'node:net'
import { DATA_DIR, readJson, writeJson, truncate, mapLimit } from './util.js'
import { normalizeBili } from './analyze/bili.js'

const CACHE_FILE = () => path.join(DATA_DIR, 'cache', 'summaries.json')
const CACHE_LIMIT = 2000

/** Non-negative finite number, else 0. */
function numOf(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Rough token count used only when a provider reports no usage at all:
 * CJK costs about one token per character, Latin about four characters per token.
 * Documented as an estimate in the UI, never presented as a measurement.
 */
export function approxTokens(text) {
  const s = String(text || '')
  let wide = 0
  for (const ch of s) if (ch.codePointAt(0) > 0x2e7f) wide += 1
  return Math.ceil(wide + (s.length - wide) / 4)
}

/**
 * Sum one provider usage record into `meter`. Accepts the DSH `TokenUsage`
 * shape (camelCase), OpenAI `prompt_tokens`/`completion_tokens` and Ollama
 * `prompt_eval_count`/`eval_count`; the first non-zero candidate wins so a
 * provider never gets counted twice.
 */
function addUsage(meter, usage) {
  if (!meter || !usage || typeof usage !== 'object') return
  const pick = (...values) => {
    for (const value of values) {
      const n = numOf(value)
      if (n) return n
    }
    return 0
  }
  const cached = usage.prompt_tokens_details && usage.prompt_tokens_details.cached_tokens
  const input = pick(usage.inputTokens, usage.prompt_tokens, usage.prompt_eval_count)
  const output = pick(usage.outputTokens, usage.completion_tokens, usage.eval_count)
  const cacheRead = pick(usage.cacheReadTokens, cached)
  const cacheWrite = pick(usage.cacheWriteTokens)
  meter.inputTokens += input
  meter.outputTokens += output
  meter.cacheReadTokens += cacheRead
  meter.cacheWriteTokens += cacheWrite
  if (input || output || cacheRead || cacheWrite) meter.reported = true
}

/** Fresh per-generation meter; `textIn`/`textOut` feed the estimate fallback. */
export function createMeter() {
  return { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, textIn: '', textOut: '', reported: false, estimated: false }
}

const SESSION_SYSTEM =
  '你是工作日报助手。根据给定的会话事实包，用中文写 1~2 句话总结这个会话。' +
  '句式必须是「做了什么 + 结果如何」：先说做的事，再说结论/产出/卡在哪。' +
  '不要复述用户意图，不要写“用户想…”“我进行了…”。不要编造事实包里没有的信息，不要写数字（除非事实包里有）。' +
  '只输出这 1~2 句话本身，不要前缀、不要引号、不要 Markdown。'

const DAY_SYSTEM =
  '你是工作日报助手。根据当天各会话的一句话摘要，写一句不超过 40 字的“今日一句话”，概括今天最主要的进展。' +
  '另判断是否有真正有用、令人意外且值得展示的小发现：如有证据的重复摩擦可自动化、被忽略的点子、不同工作的关联。' +
  'discovery 不是必填内容：证据不足、只有泛泛建议或没有值得展示的发现时必须返回 null；不要为了填满而编造或套模板。' +
  '不要重复今日一句话、会话摘要、待办、成本建议或健康提醒，不要把待办改写成发现。发现用不超过 60 字的中文简述具体依据和新意。' +
  '只输出 JSON 对象 {"oneLiner":"今日一句话","discovery":null}，有发现时 discovery 为字符串。不要前缀、数字统计或 Markdown。'

const LINKED_DISCOVERY_SYSTEM =
  '本次另有【插件联动数值证据】：bili 与 context 均运行时采集的当日数字账本，可与会话摘要一起判断跨插件异常解释是否比普通发现更值得展示。' +
  '仍只选一条每日发现，不增加第二段，正文总长不超过 60 字；没有有用且充分的关联证据时照常返回普通发现或 null，不强制写联动。' +
  '不要仅复述统计或重复成本建议；缺测、账本不全、unknown 不等于异常，未提供的上下文组成不得猜测。' +
  '压缩次数或缓存率只能说明相关性，不足以断言失败、缓存变化由压缩导致；无因果证据只写可核对的伴随现象或待验证判断。' +
  '窗口回收量不等于净节省，净收益为估算且可能为负，未知值不得写成零或精确节约。' +
  '输出 JSON 增加布尔字段 discoveryLinked：仅 discovery 真正采用插件证据解释异常时为 true；普通发现或 null 为 false。不要在正文手写“插件联动”标签。'

/** Whitelisted aggregate numbers only; no raw plugin text, ids, paths or bodies. */
function linkedDiscoveryEvidence(facts) {
  const raw = facts.bili
  if (raw?.source !== 'billion-context' || raw.date !== facts.date) return null
  const b = normalizeBili(raw)
  if (!b || ![b.compressionCount, b.reclaimedTokens, b.cacheHitRate, b.netSavedTokens].some(Number.isFinite)) return null
  return { compressionCount: b.compressionCount, reclaimedTokens: b.reclaimedTokens, inputTokens: b.inputTokens, cachedTokens: b.cachedTokens, cacheHitRate: b.cacheHitRate, netSavedTokens: b.netSavedTokens, estimated: b.estimated === true, status: b.status }
}

/** Template sentence when no model is allowed or available. */
export function templateSummary(s) {
  const parts = []
  const files = (s.filesChanged || []).length
  const dels = (s.deliverables || []).map((d) => path.basename(String(d.path).replace(/\\/g, '/')))
  if (files) parts.push('改动 ' + files + ' 个文件')
  if (dels.length) parts.push('交付 ' + truncate(dels.slice(0, 3).join('、'), 60))
  if ((s.failures || []).length) parts.push((s.failures || []).length + ' 处失败')
  if ((s.openTodos || []).length) parts.push((s.openTodos || []).length + ' 项待办未完成')
  if (s.interruptedTurns) parts.push(s.interruptedTurns + ' 轮被中断')
  const head = truncate(s.title || '未命名会话', 40)
  return parts.length ? head + '：' + parts.join('，') + '。' : head + '。'
}

function cleanSentence(text, maxLength = 220) {
  let t = String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  t = t.replace(/^["“'「]+|["”'」]+$/g, '').replace(/^\s*(摘要|总结|今日一句话)[:：]\s*/, '')
  t = t.split('\n').map((x) => x.trim()).filter(Boolean).join(' ')
  return maxLength === null ? t : truncate(t, maxLength)
}

/** Parse the structured DAY reply, while accepting old plain-sentence models. */
function parseDayReply(text) {
  const empty = { oneLiner: null, discovery: null }
  const raw = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  if (!raw) return empty
  const fence = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/i)
  const candidate = fence ? fence[1].trim() : raw
  let value
  try {
    value = JSON.parse(candidate)
  } catch {
    // Broken structured responses must never appear as a summary sentence.
    if (fence || /```|^[{\[]|["']?(?:oneLiner|discovery)["']?\s*:/i.test(raw)) return empty
    return { oneLiner: cleanSentence(raw, null) || null, discovery: null }
  }
  if (typeof value === 'string') return { oneLiner: cleanSentence(value, null) || null, discovery: null }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return empty
  const oneLiner = typeof value.oneLiner === 'string' ? cleanSentence(value.oneLiner, null) || null : null
  let discovery = typeof value.discovery === 'string' ? cleanSentence(value.discovery, 60) || null : null
  if (discovery && /^(?:null|none|undefined|n\/a)[.!。！]?$/i.test(discovery)) discovery = null
  if (discovery && oneLiner && discovery === oneLiner) discovery = null
  return { oneLiner, discovery, discoveryLinked: discovery !== null && value.discoveryLinked === true }
}

/**
 * Build the text-completion function for the configured mode.
 * @param {object} cfg - plugin config (`privacy`, `cloudRoute`, `localModel`).
 * @param {object} deps - `{ llm, agentDefaultModel, fetchImpl, log, meter }` (Host services, may be absent).
 *   `meter` (see `createMeter`) accumulates the tokens every model call actually spent.
 * @returns {null | ((system:string, prompt:string, maxTokens:number) => Promise<string|null>)}
 */
export function createCompleter(cfg, deps = {}) {
  const log = deps.log || (() => {})
  const meter = deps.meter || createMeter()
  const noteIn = (system, prompt) => { meter.textIn += String(system || '') + '\n' + String(prompt || '') }
  if (cfg.privacy === 'cloud') {
    const llm = deps.llm
    if (!llm || typeof llm.stream !== 'function') return null
    return async (system, prompt, maxTokens) => {
      let route = cfg.cloudRoute && cfg.cloudRoute.provider && cfg.cloudRoute.model ? { ...cfg.cloudRoute } : null
      if (!route && deps.agentDefaultModel) {
        const sel = deps.agentDefaultModel.currentSelection()
        if (sel && sel.provider && sel.model) route = { provider: sel.provider, model: sel.model }
      }
      if (!route) return null
      let out = ''
      noteIn(system, prompt)
      try {
        for await (const chunk of llm.stream({
          provider: route.provider,
          model: route.model,
          system,
          messages: [{ id: 'dsh-daily-report-' + Date.now(), role: 'user', content: [{ type: 'text', text: prompt }], source: { kind: 'user' } }],
          maxTokens,
          reasoningEffort: route.reasoningEffort || 'off',
        })) {
          if (!chunk) continue
          if (chunk.type === 'text-delta' && typeof chunk.text === 'string') out += chunk.text
          else if (chunk.type === 'usage') addUsage(meter, chunk.usage)
        }
      } catch (err) {
        log('cloud summary failed: ' + String((err && err.message) || err))
        return null
      }
      meter.textOut += out
      return out.trim() || null
    }
  }
  if (cfg.privacy === 'local-model') {
    const lm = cfg.localModel || {}
    const base = String(lm.baseUrl || '').replace(/\/+$/, '')
    if (!base || !lm.model) return null
    let endpoint
    try { endpoint = new URL(base) } catch { return null }
    const host = endpoint.hostname
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) return null
    // Guard rail: neither a lookalike 127.* domain nor an HTTP redirect may
    // silently turn local-model mode into an external conversation upload.
    const loopback = host === 'localhost' || host === '[::1]' || (isIP(host) === 4 && host.startsWith('127.'))
    if (!loopback && !lm.allowLan) {
      log('local-model baseUrl is not loopback; refusing (enable allowLan to use a LAN host)')
      return null
    }
    const fetchImpl = deps.fetchImpl || fetch
    return async (system, prompt, maxTokens) => {
      const ctl = new AbortController()
      const timer = setTimeout(() => ctl.abort(), Number(lm.timeoutMs) || 120000)
      noteIn(system, prompt)
      try {
        const res = await fetchImpl(base + '/chat/completions', {
          method: 'POST',
          redirect: 'error',
          signal: ctl.signal,
          headers: { 'content-type': 'application/json', ...(lm.apiKey ? { authorization: 'Bearer ' + lm.apiKey } : {}) },
          body: JSON.stringify({ model: lm.model, max_tokens: maxTokens, temperature: 0.2, stream: false, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }),
        })
        if (!res.ok) { log('local model HTTP ' + res.status); return null }
        const j = await res.json()
        // OpenAI-compatible servers report `usage`; Ollama reports the same counts at the root.
        addUsage(meter, (j && j.usage) || (j && { inputTokens: j.prompt_eval_count, outputTokens: j.eval_count }))
        const text = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content
        if (typeof text === 'string') meter.textOut += text
        return typeof text === 'string' ? text.trim() || null : null
      } catch (err) {
        log('local model failed: ' + String((err && err.message) || err))
        return null
      } finally {
        clearTimeout(timer)
      }
    }
  }
  return null
}

/**
 * Attach `summary` / `summarySource` to every session of `facts` and return
 * the day one-liner and optional model-judged discovery.
 * @param {object} facts - DayFacts from collectDay (with the hidden `_packs`).
 * @param {object} cfg - plugin config.
 * @param {object} deps - Host services (see createCompleter).
 * @returns {Promise<{oneLiner: string|null, discovery: string|null, discoveryLinked: boolean, mode: string, llmCalls: number, genUsage: {calls:number, inputTokens:number, outputTokens:number, cacheReadTokens:number, cacheWriteTokens:number, estimated:boolean}}>}
 */
export async function summarizeDay(facts, cfg, deps = {}) {
  const log = deps.log || (() => {})
  const mode = cfg.privacy || 'local-only'
  const meter = createMeter()
  const complete = createCompleter(cfg, { ...deps, meter })
  const cache = (await readJson(CACHE_FILE(), {})) || {}
  const packs = facts._packs || {}
  let llmCalls = 0
  let dirty = false

  await mapLimit(facts.sessions, 3, async (s) => {
    const key = facts.date + ':' + s.lastSeq + ':' + mode
    const hit = cache[s.id]
    if (hit && hit.key === key && hit.summary) {
      s.summary = hit.summary
      s.summarySource = 'cache'
      return
    }
    let summary = null
    if (complete && packs[s.id]) {
      llmCalls++
      meter.calls++
      summary = cleanSentence(await complete(SESSION_SYSTEM, packs[s.id], 160))
      if (summary && summary.length < 6) summary = null
    }
    if (summary) {
      s.summary = summary
      s.summarySource = 'llm'
      cache[s.id] = { key, summary, source: mode, at: Date.now() }
      dirty = true
    } else {
      s.summary = templateSummary(s)
      s.summarySource = 'template'
    }
  })

  let oneLiner = null
  let discovery = null
  let discoveryLinked = false
  const linkedEvidence = linkedDiscoveryEvidence(facts)
  if (complete && facts.sessions.some((s) => s.summarySource !== 'template')) {
    const lines = facts.sessions.map((s) => '- ' + (s.title || '未命名') + '：' + s.summary).join('\n')
    const todos = (facts.carryOver || []).map((c) => '- ' + c.text).join('\n')
    llmCalls++
    meter.calls++
    const dayPrompt = '日期：' + facts.date + '\n【会话摘要】\n' + lines + (todos ? '\n【已有待办，不要重复】\n' + todos : '') + (linkedEvidence ? '\n【插件联动数值证据】\n' + JSON.stringify(linkedEvidence) : '')
    const day = parseDayReply(await complete(DAY_SYSTEM + (linkedEvidence ? LINKED_DISCOVERY_SYSTEM : ''), dayPrompt, 600))
    oneLiner = day.oneLiner
    discovery = day.discovery
    if (discovery && facts.sessions.some((s) => s.summary === discovery)) discovery = null
    if (discovery && (facts.carryOver || []).some((c) => c.text === discovery)) discovery = null
    // Provenance without current numeric evidence must not create linked UI.
    if (day.discoveryLinked && !linkedEvidence) discovery = null
    discoveryLinked = !!(discovery && day.discoveryLinked && linkedEvidence)
  }
  if (!oneLiner) oneLiner = templateOneLiner(facts)

  // Some providers omit usage; fall back to a character estimate over what we sent and received.
  if (meter.calls && !meter.reported) {
    meter.inputTokens = approxTokens(meter.textIn)
    meter.outputTokens = approxTokens(meter.textOut)
    meter.estimated = true
  }

  if (dirty) {
    const entries = Object.entries(cache).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, CACHE_LIMIT)
    try { await writeJson(CACHE_FILE(), Object.fromEntries(entries)) } catch (err) { log('cache write failed: ' + String(err)) }
  }
  const genUsage = {
    calls: meter.calls,
    inputTokens: meter.inputTokens,
    outputTokens: meter.outputTokens,
    cacheReadTokens: meter.cacheReadTokens,
    cacheWriteTokens: meter.cacheWriteTokens,
    estimated: meter.estimated,
  }
  return { oneLiner, discovery, discoveryLinked, mode, llmCalls, genUsage }
}

/** Deterministic one-liner: the busiest sessions' titles. */
export function templateOneLiner(facts) {
  const ss = (facts.sessions || []).slice().sort((a, b) => (b.toolCalls + b.userMessages * 5) - (a.toolCalls + a.userMessages * 5))
  if (!ss.length) return null
  const names = ss.slice(0, 2).map((s) => '「' + truncate(s.title || '未命名会话', 18) + '」')
  return '主要在做' + names.join('和') + (ss.length > 2 ? '等 ' + ss.length + ' 件事' : '') + '。'
}
