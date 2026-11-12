/**
 * Fallback session source that reads `~/.dsh/sessions/**\/session.v4.jsonl.zstd`
 * directly. Used by tests and the CLI preview; the Host plugin prefers the
 * `sessionQuery` service. Requires Node ≥ 22.15 for `zlib.zstdDecompressSync`.
 * @module dsh-daily-report/collect/rawlog
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/** Decode every concatenated zstd frame independently (the log appends frames). */
export function decodeFrames(buf) {
  const offs = []
  let p = 0
  while ((p = buf.indexOf(MAGIC, p)) !== -1) { offs.push(p); p += 4 }
  offs.push(buf.length)
  let out = ''
  for (let i = 0; i < offs.length - 1; i++) {
    try { out += zlib.zstdDecompressSync(buf.subarray(offs[i], offs[i + 1])).toString('utf8') } catch { /* magic inside payload */ }
  }
  return out
}

async function walk(dir, files) {
  let entries
  try { entries = await readdir(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) await walk(p, files)
    else if (/^session\.v\d+\.jsonl\.zstd$/.test(e.name)) files.push(p)
  }
}

/**
 * Build a source adapter over raw session logs.
 * @param {string} [root] - sessions directory.
 * @returns {{list: Function, read: Function, titles: Function}}
 */
export function rawLogSource(root = path.join(homedir(), '.dsh', 'sessions')) {
  const byId = new Map()
  const cache = new Map()
  async function load(file) {
    const st = await stat(file)
    const hit = cache.get(file)
    if (hit && hit.mtimeMs === st.mtimeMs) return hit.lines
    const lines = []
    for (const l of decodeFrames(await readFile(file)).split('\n')) {
      if (!l) continue
      try { lines.push(JSON.parse(l)) } catch { /* torn tail */ }
    }
    cache.set(file, { mtimeMs: st.mtimeMs, lines })
    return lines
  }
  return {
    async list() {
      const files = []
      await walk(root, files)
      const out = []
      for (const f of files) {
        try {
          const lines = await load(f)
          const h = lines.find((x) => x.type === 'session')
          if (!h) continue
          byId.set(h.id, f)
          out.push({ id: h.id, createdAt: h.createdAt, cwd: h.cwd || null, origin: h.origin || null, parentSession: h.parentSession || null })
        } catch { /* unreadable log */ }
      }
      return out.sort((a, b) => b.createdAt - a.createdAt)
    },
    async read(id) {
      const f = byId.get(id)
      if (!f) return []
      return (await load(f)).filter((x) => x.type !== 'session')
    },
    async titles(ids) {
      const out = {}
      for (const id of ids) {
        const events = await this.read(id)
        for (const e of events) if (e.type === 'session/title' && e.data && e.data.title) out[id] = e.data.title
      }
      return out
    },
  }
}
