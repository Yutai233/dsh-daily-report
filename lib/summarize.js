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

const CACHE_FILE = () => path.join(DATA_DIR, 'cache', 'summaries.json')
const CACHE_LIMIT = 2000

const SESSION_SYSTEM =
  '你是工作日报助手。根据给定的会话事实包，用中文写 1~2 句话总结这个会话。' +
  '句式必须是「做了什么 + 结果如何」：先说做的事，再说结论/产出/卡在哪。' +
  '不要复述用户意图，不要写“用户想…”“我进行了…”。不要编造事实包里没有的信息，不要写数字（除非事实包里有）。' +
  '只输出这 1~2 句话本身，不要前缀、不要引号、不要 Markdown。'

const DAY_SYSTEM =
  '你是工作日报助手。根据当天各会话的一句话摘要，写一句不超过 40 字的“今日一句话”，概括今天最主要的进展。' +
  '只输出这一句话，不要前缀、不要引号、不要数字统计、不要 Markdown。'

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

function cleanSentence(text) {
  let t = String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  t = t.replace(/^["“'「]+|["”'」]+$/g, '').replace(/^\s*(摘要|总结|今日一句话)[:：]\s*/, '')
  t = t.split('\n').map((x) => x.trim()).filter(Boolean).join(' ')
  return truncate(t, 220)
}

/**
 * Build the text-completion function for the configured mode.
 * @param {object} cfg - plugin config (`privacy`, `cloudRoute`, `localModel`).
 * @param {object} deps - `{ llm, agentDefaultModel, fetchImpl, log }` (Host services, may be absent).
 * @returns {null | ((system:string, prompt:string, maxTokens:number) => Promise<string|null>)}
 */
export function createCompleter(cfg, deps = {}) {
  const log = deps.log || (() => {})
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
      try {
        for await (const chunk of llm.stream({
          provider: route.provider,
          model: route.model,
          system,
          messages: [{ id: 'dsh-daily-report-' + Date.now(), role: 'user', content: [{ type: 'text', text: prompt }], source: { kind: 'user' } }],
          maxTokens,
          reasoningEffort: route.reasoningEffort || 'off',
        })) {
          if (chunk && chunk.type === 'text-delta' && typeof chunk.text === 'string') out += chunk.text
        }
      } catch (err) {
        log('cloud summary failed: ' + String((err && err.message) || err))
        return null
      }
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
        const text = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content
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
 * the day one-liner.
 * @param {object} facts - DayFacts from collectDay (with the hidden `_packs`).
 * @param {object} cfg - plugin config.
 * @param {object} deps - Host services (see createCompleter).
 * @returns {Promise<{oneLiner: string|null, mode: string, llmCalls: number}>}
 */
export async function summarizeDay(facts, cfg, deps = {}) {
  const log = deps.log || (() => {})
  const mode = cfg.privacy || 'local-only'
  const complete = createCompleter(cfg, deps)
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
  if (complete && facts.sessions.some((s) => s.summarySource !== 'template')) {
    const lines = facts.sessions.map((s) => '- ' + (s.title || '未命名') + '：' + s.summary).join('\n')
    llmCalls++
    oneLiner = cleanSentence(await complete(DAY_SYSTEM, '日期：' + facts.date + '\n' + lines, 120))
    if (oneLiner) oneLiner = truncate(oneLiner, 60)
  }
  if (!oneLiner) oneLiner = templateOneLiner(facts)

  if (dirty) {
    const entries = Object.entries(cache).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, CACHE_LIMIT)
    try { await writeJson(CACHE_FILE(), Object.fromEntries(entries)) } catch (err) { log('cache write failed: ' + String(err)) }
  }
  return { oneLiner, mode, llmCalls }
}

/** Deterministic one-liner: the busiest sessions' titles. */
export function templateOneLiner(facts) {
  const ss = (facts.sessions || []).slice().sort((a, b) => (b.toolCalls + b.userMessages * 5) - (a.toolCalls + a.userMessages * 5))
  if (!ss.length) return null
  const names = ss.slice(0, 2).map((s) => '「' + truncate(s.title || '未命名会话', 18) + '」')
  return '主要在做' + names.join('和') + (ss.length > 2 ? '等 ' + ss.length + ' 件事' : '') + '。'
}
