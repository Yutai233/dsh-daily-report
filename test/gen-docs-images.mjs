/**
 * Regenerate the README screenshots in docs/images from synthetic fixtures only.
 *
 * Guarantees: no network, no real session data, no test/out/ input, no hard-coded
 * temp path, no browser profile inside the repo. Output is deterministic for a
 * given browser build, so re-running the script is safe and diff-stable.
 *
 *   node test/gen-docs-images.mjs                 # playwright + msedge, 2x DPR
 *   node test/gen-docs-images.mjs --dry-run       # render themed HTML only, no browser
 *   node test/gen-docs-images.mjs --engine=edge   # Edge CLI fallback (viewport only)
 *   node test/gen-docs-images.mjs --full-page     # whole report (over README budget)
 *
 * Playwright discovery: PLAYWRIGHT_MODULE, then DDR_PLAYWRIGHT, then the bundled
 * CodeX runtime copy. Edge CLI fallback: EDGE_PATH, then the default install path.
 *
 * Note for confined/sandboxed shells: Chromium builds its IPC out of named pipes.
 * Where the host denies named-pipe creation, playwright raises `spawn EPERM` and
 * Edge CLI aborts with `FATAL:...platform_channel.cc... 拒绝访问`, so no screenshot
 * can be produced at all. Run this script from an ordinary shell instead of
 * escalating anything: it needs no privileges and opens no network sockets.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { renderHtml } from '../lib/render/html.js'
import { sampleDaily, sampleWeekly } from './fixtures/sample-report.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repo = dirname(here)
const outDir = process.env.DDR_IMAGES_DIR ? resolve(process.env.DDR_IMAGES_DIR) : join(repo, 'docs', 'images')
const WIDTH = 900
const DPR = 2
// README budget: 1800px per side, 500KB per file, 1.5MB total.
const MAX_SIDE = 1800
const MAX_BYTES = 500 * 1024
const MAX_TOTAL = 1.5 * 1024 * 1024
// Edge CLI can only capture the viewport, so its height is fixed up front.
const CLI_HEIGHT = Number(process.env.DDR_SHOT_HEIGHT || 900)

const playwrightPath = process.env.PLAYWRIGHT_MODULE || process.env.DDR_PLAYWRIGHT
  || `${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`
const edgePath = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

/** Fixture, theme and file name of every published screenshot. */
const shots = [
  { file: 'demo-daily-light.png', label: 'daily', fixture: sampleDaily, theme: 'light' },
  { file: 'demo-daily-dark.png', label: 'daily dark', fixture: sampleDaily, theme: 'dark' },
  { file: 'demo-weekly-light.png', label: 'weekly', fixture: sampleWeekly, theme: 'light' },
]

const PALETTES = {
  light: /@media\s*\(prefers-color-scheme:light\)\s*\{\s*:root\s*\{([^{}]*)\}\s*\}/,
  dark: /:root\s*\{([^{}]*)\}/,
}

/** Pull the theme's custom-property block out of the renderer's own stylesheet. */
function palette(cssText, theme) {
  const declarations = cssText.match(PALETTES[theme])?.[1]?.trim()
  if (!declarations) throw new Error(`renderer has no ${theme} palette block; update test/gen-docs-images.mjs`)
  return declarations
}

/** Force one theme regardless of the browser's prefers-color-scheme default. */
function withTheme(html, theme) {
  const cssText = html.match(/<style>([\s\S]*?)<\/style>/)?.[1]
  if (!cssText) throw new Error('renderer no longer emits a single <style> block')
  if (!html.includes('</head>')) throw new Error('renderer no longer emits </head>')
  // Appended last, so it beats both the dark :root rule and the light
  // prefers-color-scheme block at the same specificity.
  const override = `<style id="ddr-docs-theme">:root{${palette(cssText, theme)}}</style>`
  return html.replace('</head>', `${override}</head>`)
}

/** Fail the run if any real host path or session artifact leaks into a screenshot. */
function assertSynthetic(html, name) {
  const leaks = [/[A-Za-z]:\\Users\\/i, /\bAppData\b/i, /\.dsh[\\/]/i, /[\\/]test[\\/]out[\\/]/i]
  const bad = leaks.find((re) => re.test(html))
  if (bad) throw new Error(`${name}: rendered HTML matches real-data guard ${bad}`)
}

/** Read pixel dimensions straight out of the PNG IHDR chunk. */
function pngSize(buffer) {
  if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') throw new Error('not a PNG')
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

/** Clip height: the whole layer-1 card plus its margin, capped to the budget. */
function clipHeight(heroBottom, scrollHeight) {
  const wanted = Math.ceil(heroBottom) + 12 // trailing card margin: cut lands on background
  return Math.min(MAX_SIDE / DPR, Math.max(360, wanted), Math.ceil(scrollHeight))
}

async function openBrowser() {
  if (!existsSync(playwrightPath)) throw new Error(`playwright not found: ${playwrightPath}`)
  const { chromium } = await import(pathToFileURL(playwrightPath).href)
  return chromium.launch({ channel: 'msedge', headless: true })
}

/** One browser context per shot so scroll, media and font state stay isolated. */
async function captureWithBrowser(browser, shot, opts) {
  // Viewport is taller than any clip, so the clip always sits inside the layout.
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: 1200 }, deviceScaleFactor: DPR,
    colorScheme: shot.theme, reducedMotion: 'reduce', locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
  })
  try {
    const page = await context.newPage()
    const requests = []
    page.on('request', (request) => requests.push(request.url()))
    await page.setContent(shot.html, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready.then(() => true))
    const geom = await page.evaluate(() => {
      const root = document.documentElement
      const hero = document.querySelector('header.hero')
      if (!hero) throw new Error('report has no layer-1 card')
      const rect = hero.getBoundingClientRect()
      return {
        heroBottom: rect.bottom + window.scrollY,
        scrollHeight: root.scrollHeight,
        overflow: root.scrollWidth > root.clientWidth,
      }
    })
    if (geom.overflow) throw new Error('report overflows horizontally at 900px')
    const external = requests.filter((url) => !/^(?:about:|data:)/.test(url))
    if (external.length) throw new Error(`report requested external resources: ${external.join(', ')}`)
    if (opts.fullPage) {
      const full = await page.screenshot({ fullPage: true })
      return { buffer: full, clip: { x: 0, y: 0, width: WIDTH, height: Math.ceil(geom.scrollHeight) } }
    }
    const clip = { x: 0, y: 0, width: WIDTH, height: clipHeight(geom.heroBottom, geom.scrollHeight) }
    const buffer = await page.screenshot({ clip, fullPage: false })
    const cropped = clip.height < Math.ceil(geom.heroBottom) + 12
    return { buffer, clip, warning: cropped ? 'layer-1 card is taller than the 900px clip budget' : '' }
  } finally {
    await context.close()
  }
}

/** Edge CLI captures the viewport only; profile lives in the OS temp dir. */
async function captureWithEdge(shot, workDir) {
  const stem = shot.file.replace(/\.png$/, '')
  const htmlPath = join(workDir, `${stem}.html`)
  const pngPath = join(workDir, `${stem}.png`)
  const logPath = join(workDir, `${stem}.log`)
  const profileDir = join(workDir, `edge-profile-${stem}`)
  await writeFile(htmlPath, shot.html)
  const args = [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--disable-crash-reporter', '--disable-breakpad',
    '--edge-skip-compat-layer-relaunch', `--force-device-scale-factor=${DPR}`,
    `--window-size=${WIDTH},${CLI_HEIGHT}`, `--user-data-dir=${profileDir}`,
    '--enable-logging', `--log-file=${logPath}`, `--screenshot=${pngPath}`,
    pathToFileURL(htmlPath).href,
  ]
  // stdio: 'ignore' keeps this clear of the pipes a confined shell denies.
  const run = spawnSync(edgePath, args, { stdio: 'ignore', windowsHide: true, timeout: 180_000 })
  if (!existsSync(pngPath)) {
    const tail = existsSync(logPath)
      ? (await readFile(logPath, 'utf8')).trim().split(/\r?\n/).slice(-6).join('\n')
      : ''
    throw new Error([
      `[${shot.file}] Edge CLI produced no PNG (status ${run.status}).`,
      tail ? `last log lines:\n${tail}` : '',
      /platform_channel|EPERM|拒绝访问|access is denied/i.test(tail)
        ? 'Chromium needs named-pipe IPC and this shell denies it; run the script from an ordinary shell.'
        : '',
    ].filter(Boolean).join('\n'))
  }
  return { buffer: await readFile(pngPath), clip: { x: 0, y: 0, width: WIDTH, height: CLI_HEIGHT } }
}

function usage() {
  return [
    'Generate README screenshots from synthetic fixtures (docs/images/*.png).',
    '',
    '  node test/gen-docs-images.mjs [--engine auto|playwright|edge] [--full-page] [--dry-run]',
    '',
    '  --engine auto   playwright first, Edge CLI when the browser cannot start (default)',
    '  --engine edge   Edge CLI only (viewport-sized capture, needs msedge)',
    '  --full-page     capture the whole report instead of the layer-1 card (over budget)',
    '  --dry-run       write themed HTML to a temp dir only; no browser at all',
    '',
    `playwright: ${playwrightPath}`,
    `edge:       ${edgePath}`,
    `edge viewport: ${WIDTH}x${CLI_HEIGHT} CSS at dpr ${DPR} -> ${WIDTH * DPR}x${CLI_HEIGHT * DPR} px`,
  ].join('\n')
}

function parseArgs(argv) {
  const opts = { engine: 'auto', fullPage: false, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') opts.help = true
    else if (arg === '--engine' || arg.startsWith('--engine=')) {
      opts.engine = arg === '--engine' ? argv[++i] : arg.slice('--engine='.length)
      if (!['auto', 'playwright', 'edge'].includes(opts.engine)) throw new Error(`unknown --engine: ${opts.engine}`)
    } else if (arg === '--full-page') opts.fullPage = true
    else if (arg === '--dry-run') opts.dryRun = true
    else throw new Error(`unknown argument: ${arg}\n\n${usage()}`)
  }
  return opts
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) { console.log(usage()); return }
  if (opts.engine === 'edge' && opts.fullPage) throw new Error('--full-page needs --engine playwright: Edge CLI captures the viewport only')
  if (CLI_HEIGHT * DPR > MAX_SIDE) throw new Error(`DDR_SHOT_HEIGHT=${CLI_HEIGHT} exceeds the ${MAX_SIDE}px budget at dpr ${DPR}`)
  const workDir = await mkdtemp(join(tmpdir(), 'ddr-docs-images-'))
  const prepared = shots.map((shot) => {
    const html = withTheme(renderHtml(shot.fixture), shot.theme)
    assertSynthetic(html, shot.file)
    return { ...shot, html }
  })
  const results = []
  let engine = opts.engine
  try {
    if (opts.dryRun) {
      for (const shot of prepared) {
        const path = join(workDir, `${shot.file.replace(/\.png$/, '')}.html`)
        await writeFile(path, shot.html)
        results.push({ file: shot.file, html: path, fixture: shot.label, theme: shot.theme })
      }
      console.log(JSON.stringify({ dryRun: true, workDir, results }, null, 2))
      return
    }
    await mkdir(outDir, { recursive: true })
    let browser = null
    if (engine !== 'edge') {
      try {
        browser = await openBrowser()
      } catch (error) {
        if (engine === 'playwright') throw error
        const message = String(error?.message || error).split('\n')[0]
        console.error(`playwright could not start (${message}); falling back to the Edge CLI`)
        engine = 'edge'
      }
    }
    if (browser) engine = 'playwright'
    try {
      for (const shot of prepared) {
        const capture = browser
          ? await captureWithBrowser(browser, shot, opts)
          : await captureWithEdge(shot, workDir)
        const { width, height } = pngSize(capture.buffer)
        await writeFile(join(outDir, shot.file), capture.buffer)
        const problems = []
        if (!opts.fullPage && (width > MAX_SIDE || height > MAX_SIDE)) problems.push(`${width}x${height} exceeds the ${MAX_SIDE}px side budget`)
        if (!opts.fullPage && capture.buffer.length > MAX_BYTES) problems.push(`${Math.round(capture.buffer.length / 1024)}KB exceeds 500KB`)
        let warning = capture.warning || ''
        if (engine === 'edge' && (width !== WIDTH * DPR || height !== CLI_HEIGHT * DPR)) {
          warning = `expected ${WIDTH * DPR}x${CLI_HEIGHT * DPR} from the Edge viewport, got ${width}x${height} (force-device-scale-factor may be ignored)`
        }
        const record = { file: shot.file, fixture: shot.label, theme: shot.theme, width, height, bytes: capture.buffer.length, clip: capture.clip, warning }
        results.push(record)
        if (problems.length) throw new Error(`[${shot.file}] ${problems.join('; ')}`)
      }
    } finally {
      await browser?.close()
    }
    const total = results.reduce((sum, r) => sum + r.bytes, 0)
    if (!opts.fullPage && total > MAX_TOTAL) throw new Error(`total ${Math.round(total / 1024)}KB exceeds the 1.5MB budget`)
    console.log(JSON.stringify({
      engine,
      deviceScaleFactor: DPR,
      viewportWidth: WIDTH,
      outDir: relative(process.cwd(), outDir) || outDir,
      totalKB: Math.round(total / 1024),
      images: results,
    }, null, 2))
  } finally {
    // --dry-run exists to hand a human the themed HTML, so its dir survives.
    if (opts.dryRun || process.env.DDR_KEEP_TMP) console.error(`kept work dir: ${workDir}`)
    else await rm(workDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error))
  process.exit(1)
})
