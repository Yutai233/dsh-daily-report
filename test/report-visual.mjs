/** Local Edge checks with synthetic data only. No server or network resources. */
// Playwright module: PLAYWRIGHT_MODULE or DDR_PLAYWRIGHT env var, else the bundled runtime under %USERPROFILE%.
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { renderHtml } from '../lib/render/html.js'
import { sampleDaily, sampleWeekly, sampleEmpty } from './fixtures/sample-report.mjs'

const playwrightPath = process.env.PLAYWRIGHT_MODULE || process.env.DDR_PLAYWRIGHT || `${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`
const { chromium } = await import(pathToFileURL(playwrightPath).href)
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const out = await mkdtemp(join(tmpdir(), 'dsh-report-visual-'))
const checks = []

// Record real layout during keyboard activation; no script is added to the report.
async function toggleSamples(page, summary) {
  await summary.focus()
  const sampling = page.evaluate(async () => {
    const details = document.activeElement.parentElement
    const content = details.querySelector('.section-content')
    const frames = []
    const start = performance.now()
    do {
      const rect = details.getBoundingClientRect()
      const style = getComputedStyle(content)
      frames.push({ height: rect.height, top: rect.top, opacity: style.opacity, transform: style.transform,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth })
      await new Promise(requestAnimationFrame)
    } while (performance.now() - start < 420)
    return frames
  })
  await summary.press('Enter')
  return sampling
}

function verifyToggle(frames, expanding, smooth, label) {
  const first = frames[0].height
  const last = frames.at(-1).height
  assert.ok(expanding ? last > first + 20 : first > last + 20, `${label}: height must change`)
  assert.ok(frames.every(x => Math.abs(x.top - frames[0].top) < 1), `${label}: section must stay in place`)
  assert.ok(frames.every(x => x.opacity === '1' && x.transform === 'none' && !x.overflow), `${label}: no content fade, transform or page overflow`)
  if (smooth) assert.ok(frames.some(x => x.height > Math.min(first, last) + 1 && x.height < Math.max(first, last) - 1), `${label}: height must have intermediate frames`)
}

try {
  for (const motion of ['no-preference', 'reduce']) {
    for (const theme of ['light', 'dark']) {
      for (const width of [800, 320]) {
        const page = await browser.newPage({ viewport: { width, height: 1050 }, colorScheme: theme, reducedMotion: motion })
        const requests = []
        page.on('request', request => requests.push(request.url()))
        for (const [name, report] of Object.entries({ daily: sampleDaily, weekly: sampleWeekly, monthly: { ...sampleWeekly, kind: 'monthly' }, empty: sampleEmpty })) {
          await page.setContent(renderHtml(report))
          const state = await page.evaluate(() => ({
            width: document.documentElement.clientWidth,
            scroll: document.documentElement.scrollWidth,
            blue: getComputedStyle(document.querySelector('h1')).color,
            animations: document.getAnimations().length,
            transforms: [...document.querySelectorAll('header,details,.metric,.bar,.section-content')].map(x => getComputedStyle(x).transform),
            open: [...document.querySelectorAll('details[open]>summary')].map(x => x.textContent),
            text: [...document.querySelectorAll('.section-content')].map(x => x.textContent),
          }))
          const label = `${motion}/${theme}/${width}/${name}`
          assert.ok(state.scroll <= state.width, `${label}: default overflow`)
          assert.equal(state.blue, theme === 'light' ? 'rgb(65, 118, 230)' : 'rgb(86, 134, 254)')
          assert.equal(state.animations, 0, `${label}: no automatic entrance animation`)
          assert.ok(state.transforms.every(x => x === 'none'), `${label}: no initial transforms`)
          const expected = report.sections?.carryOver != null ? ['明日待续'] : []
          assert.deepEqual(state.open, expected, `${label}: default open semantics`)
          if (width === 800 && report.sections?.usage) {
            const metrics = await page.locator('.overview .metric').evaluateAll(items => items.map(el => {
              const parts = [...el.children].map(x => x.getBoundingClientRect());
              const r = el.getBoundingClientRect();
              return { top: r.top, height: r.height, inline: parts.every(x => Math.min(...parts.map(p => p.bottom)) > x.top) };
            }))
            assert.equal(metrics.length, 3)
            assert.ok(metrics.every(x => Math.abs(x.top - metrics[0].top) < 1 && x.inline && x.height < 40), `${label}: labels, values and changes share one compact row`)
          }
          assert.ok(!state.open.includes('今日主线'))
          if (name === 'daily' && motion === 'reduce') await page.screenshot({ path: join(out, `${theme}-${width}.png`), fullPage: true })
          await page.locator('details').evaluateAll(elements => elements.forEach(el => { el.open = true }))
          await page.evaluate(async () => { await Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))) })
          const expanded = await page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            allOpen: [...document.querySelectorAll('details')].every(x => x.open),
            text: [...document.querySelectorAll('.section-content')].map(x => x.textContent),
            clipped: [...document.querySelectorAll('.section-content')].some(x => {
              const parent = x.parentElement.getBoundingClientRect()
              const content = x.getBoundingClientRect()
              return content.right > parent.right + 1 || content.bottom > parent.bottom + 1
            }),
          }))
          assert.ok(!expanded.overflow && !expanded.clipped, `${label}: expanded content must fit`)
          assert.ok(expanded.allOpen)
          assert.deepEqual(expanded.text, state.text, `${label}: expanding preserves full content`)
          checks.push(label)
        }

        await page.setContent(renderHtml(sampleDaily))
        const kpi = page.locator('.overview .metric').first()
        const before = await kpi.boundingBox()
        await kpi.hover()
        const hover = await kpi.evaluate(el => ({ transform: getComputedStyle(el).transform, shadow: getComputedStyle(el).boxShadow, animations: document.getAnimations().length }))
        assert.equal(hover.transform, 'none')
        assert.equal(hover.shadow, 'none')
        assert.equal(hover.animations, 0)
        assert.deepEqual(await kpi.boundingBox(), before, 'hover must not move the KPI')
        const summary = page.locator('details.sec > summary').filter({ hasText: '用量与成本' })
        const supported = await page.evaluate(() => CSS.supports('interpolate-size:allow-keywords') && CSS.supports('selector(details::details-content)'))
        verifyToggle(await toggleSamples(page, summary), true, supported && motion === 'no-preference', `${motion}/${theme}/${width}/open`)
        assert.equal(await summary.evaluate(el => el.parentElement.open), true)
        verifyToggle(await toggleSamples(page, summary), false, supported && motion === 'no-preference', `${motion}/${theme}/${width}/close`)
        assert.equal(await summary.evaluate(el => el.parentElement.open), false)
        if (motion === 'reduce') {
          const durations = await summary.evaluate(el => [getComputedStyle(el, '::after').transitionDuration, getComputedStyle(el.parentElement, '::details-content').transitionDuration])
          assert.ok(durations.every(x => x.split(',').every(value => parseFloat(value) === 0)), 'reduced motion disables both pseudo transitions')
        }
        // Remove only the enhancement rule to exercise the unsupported-browser path.
        await page.evaluate(() => {
          const sheet = document.styleSheets[0]
          for (let i = sheet.cssRules.length - 1; i >= 0; i--) if (sheet.cssRules[i].type === CSSRule.SUPPORTS_RULE) sheet.deleteRule(i)
        })
        const closedHeight = await summary.evaluate(el => el.parentElement.getBoundingClientRect().height)
        await summary.press('Space')
        assert.ok(await summary.evaluate(el => el.parentElement.open), 'native fallback remains keyboard operable')
        assert.ok(await summary.evaluate(el => el.parentElement.getBoundingClientRect().height) > closedHeight + 20)
        await summary.press('Space')
        assert.equal(await summary.evaluate(el => el.parentElement.open), false)

        await page.evaluate(() => {
          document.documentElement.style.setProperty('--dsw-font-family', 'Georgia')
          document.documentElement.style.setProperty('--dsw-alias-brand-primary-new-colorprimary-new-color', '#123456')
          document.documentElement.style.setProperty('--dsw-alias-bg-base', '#234567')
        })
        assert.equal(await page.locator('h1').evaluate(el => getComputedStyle(el).color), 'rgb(18, 52, 86)')
        assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(35, 69, 103)')
        assert.match(await page.locator('body').evaluate(el => getComputedStyle(el).fontFamily), /Georgia/)
        assert.equal(requests.length, 0, 'standalone report must not request external resources')
        checks.push(`${motion}/${theme}/${width}/keyboard-height-hover-fallback-theme`)
        await page.close()
      }
    }
  }
  console.log(JSON.stringify({ checks, screenshots: out, result: 'passed' }, null, 2))
} finally {
  await browser.close()
}
