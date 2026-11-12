// End-to-end smoke test against the real ~/.dsh/sessions corpus (read-only).
// Usage: node test/e2e-real.mjs [YYYY-MM-DD]
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
process.env.DSH_DAILY_REPORT_DIR = mkdtempSync(path.join(tmpdir(), 'ddr-e2e-'))
const { rawLogSource } = await import('../lib/collect/rawlog.js')
const { generateDaily, generatePeriod } = await import('../lib/engine.js')
const { normalizeConfig } = await import('../lib/config.js')
const { readIdleDay } = await import('../lib/collect/idle.js')
const { previousWeekRange } = await import('../lib/analyze/report.js')
const { writeFile, mkdir } = await import('node:fs/promises')

const date = process.argv[2] || '2026-11-10'
const cfg = normalizeConfig({ weather: { enabled: true, location: '上海' }, budget: { dailyCny: 10 } })
const deps = { cfg, source: rawLogSource(), readIdleDay, log: (m) => console.log('[log]', m) }
const t0 = Date.now()
const out = await generateDaily(deps, date)
console.log('daily ok in', Date.now() - t0, 'ms →', out.files.html)
console.log(JSON.stringify(out.report.layer1, null, 1))
console.log('sections:', Object.entries(out.report.sections).map(([k, v]) => k + '=' + (v ? 'Y' : '-')).join(' '))
const outDir = path.join(import.meta.dirname, 'out')
await mkdir(outDir, { recursive: true })
await writeFile(path.join(outDir, 'real-daily.html'), out.html)
await writeFile(path.join(outDir, 'real-daily.md'), out.markdown)
const wk = await generatePeriod(deps, 'weekly', previousWeekRange('2026-11-12'))
await writeFile(path.join(outDir, 'real-weekly.html'), wk.html)
console.log('weekly', wk.key, wk.report.label, wk.report.layer1.headline)
console.log('tmp data dir', process.env.DSH_DAILY_REPORT_DIR)
