// Synthetic browser smoke. No server, profile access, report generation or configuration RPC.
// Usage: node test/ui-smoke-client.mjs [path/to/playwright/index.mjs]
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { renderHtml } from '../lib/render/html.js';
import { sampleDaily } from './fixtures/sample-report.mjs';
import { pathToFileURL } from 'node:url';
import { normalizeConfig } from '../lib/config.js';
const candidates = [process.argv[2], process.env.DDR_PLAYWRIGHT, `${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`].filter(Boolean);
const modulePath = candidates.find(existsSync);
if (!modulePath) throw Error('Provide the installed Playwright index.mjs path as argument or DDR_PLAYWRIGHT.');
const { chromium } = await import(pathToFileURL(modulePath));
const source = readFileSync(new URL('../client/client-source.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../client/ui.css', import.meta.url), 'utf8');
const cfg = normalizeConfig({ privacy: 'local-model', localModel: { baseUrl: 'http://127.0.0.1:11434/v1/' + 'long-model-path/'.repeat(10), model: 'synthetic-model-'.repeat(12) }, weather: { enabled: true, location: 'Synthetic city '.repeat(12) } });
const browser = await chromium.launch({ headless: true, executablePath: process.env.DDR_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  const requests = [];
  await page.route('**/*', (route) => { requests.push(route.request().url()); return route.abort(); });
  await page.setContent('<html><head></head><body><button id="previous">Previous focus</button><main id="mount"></main></body></html>');
  await page.addStyleTag({ content: ':root{--dsw-alias-label-primary:#ddd;--dsw-alias-label-secondary:#bbb;--dsw-alias-label-tertiary:#aaa;--dsw-alias-bg-layer-2:#202020;--dsw-alias-brand-primary:#5686fe;--dsw-alias-border-l3:#666;--dsw-alias-border-l2:#555}body{margin:0;background:#181818;font-family:Arial}#mount{width:100%;max-width:760px;margin:auto;padding:12px;box-sizing:border-box}' + css });
  await page.evaluate(({ source, cfg }) => {
    let effects = [];
    const Fragment = Symbol();
    const React = {
      Fragment,
      createElement(type, props, ...children) {
        props ||= {}; children = children.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false);
        if (typeof type === 'function') return type({ ...props, children });
        const node = type === Fragment ? document.createDocumentFragment() : document.createElement(type);
        for (const [k, v] of Object.entries(props)) {
          if (v == null || k === 'key') continue;
          if (k === 'ref') { v.current = node; continue; }
          if (k === 'style') { Object.assign(node.style, v); continue; }
          if (k.startsWith('on')) { node.addEventListener(k.slice(2).toLowerCase(), v); continue; }
          if (k === 'srcDoc') { node.srcdoc = v; continue; }
          if (k === 'className') node.className = v;
          else if (k === 'tabIndex') node.tabIndex = v;
          else if (k === 'disabled') node.disabled = v;
          else node.setAttribute(k, v);
        }
        for (const child of children) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
        return node;
      },
      useState: (v) => [v, () => {}], useEffect: (f) => effects.push(f), useLayoutEffect() {},
      useRef: () => ({ current: null }), useCallback: (f) => f, useSyncExternalStore: (_, get) => get(),
    };
    const api = new Function('require', source.slice(0, source.lastIndexOf('return {\n  inject:')) + '\nreturn {SettingsSection, Viewer};')((name) => name === 'react' ? React : name === 'react-dom' ? { createPortal: (x) => x } : {});
    const state = { config: cfg, toolAvailable: false, platform: 'win32', idle: {}, dataDir: 'C:/synthetic/' + 'very-long-directory/'.repeat(20), reports: { daily: ['2026-11-10-' + 'long-report-key-'.repeat(20)] } };
    const store = { get: () => ({ state }), subscribe() {}, refresh() {}, call() { throw Error('Unexpected RPC'); }, open() {}, view() {} };
    document.querySelector('#mount').append(api.SettingsSection({ store }));
    effects = [];
    window.mountViewer = (html) => {
      document.querySelector('#previous').focus();
      let close;
      const vStore = { ...store, get: () => ({ viewer: { title: html ? 'DSH 每日简报 · 11月12日 周四' : 'Synthetic report title '.repeat(10), kind: 'daily', key: 'synthetic', html: html || '<h1>Synthetic report</h1><details><summary>Expand</summary>Details work</details><script>parent.__escaped=true</script><img src="https://example.invalid/tracker"><meta http-equiv="refresh" content="0; url=https://example.invalid/refresh">' } }), closeViewer() { close(); } };
      const modal = api.Viewer({ store: vStore }); document.body.append(modal);
      const cleanups = effects.map((f) => f()); effects = [];
      close = () => { modal.remove(); cleanups.forEach((f) => f?.()); };
    };
  }, { source, cfg });
  for (const width of [320, 375, 520, 900]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => [...document.querySelectorAll('.ddr-set, .ddr-row, .ddr-report, .ddr-input, .ddr-field')].filter((el) => el.getBoundingClientRect().right > innerWidth + 1 || el.getBoundingClientRect().left < -1).map((el) => el.className));
    if (overflow.length) throw Error(`Overflow at ${width}px: ${overflow.join(', ')}`);
    console.log(`PASS settings ${width}px: long fields, numeric controls, report rows within viewport`);
  }
  await page.setViewportSize({ width: 375, height: 800 });
  await page.evaluate(() => window.mountViewer());
  await page.locator('.ddr-viewer iframe').waitFor();
  await page.waitForFunction(() => document.querySelector('.ddr-viewer iframe').contentWindow !== null);
  if (await page.locator('.ddr-viewer iframe').getAttribute('sandbox') !== '') throw Error('Sandbox must stay empty');
  if (!(await page.getByRole('button', { name: '关闭报告' }).evaluate((el) => el === document.activeElement))) throw Error('Close control did not receive initial focus');
  if (!(await page.locator('#mount').evaluate((el) => el.inert))) throw Error('Background is not inert');
  const frame = page.frames().find((f) => f !== page.mainFrame());
  await frame.getByText('Synthetic report', { exact: true }).waitFor();
  await frame.locator('summary').click();
  if (!(await frame.locator('details').evaluate((el) => el.open))) throw Error('Report details cannot expand');
  if (await page.evaluate(() => window.__escaped)) throw Error('Report script escaped sandbox');
  if (requests.length) throw Error('Report requested external resources: ' + requests.join(', '));
  await page.getByRole('button', { name: '关闭报告' }).click();
  if (!(await page.locator('#previous').evaluate((el) => el === document.activeElement))) throw Error('Focus was not restored');
  if (await page.locator('#mount').evaluate((el) => el.inert)) throw Error('Background inert was not restored');
  console.log('PASS viewer: sandbox, external-resource CSP, native details, initial/restored focus, background inert');
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate((html) => {
    document.documentElement.setAttribute('data-windows-titlebar', '');
    window.mountViewer(html);
  }, renderHtml(sampleDaily));
  const dimensions = await page.locator('.ddr-viewer-panel').evaluate((el) => {
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return { width: r.width, height: r.height, radius: s.borderRadius, animation: s.animationName };
  });
  if (dimensions.width !== 800 || dimensions.height !== 800 || dimensions.radius !== '28px' || dimensions.animation !== 'none') throw Error('Native settings geometry/reduced motion mismatch: ' + JSON.stringify(dimensions));
  await page.frameLocator('.ddr-viewer iframe').getByRole('heading', { name: 'DSH 每日简报 · 11月12日 周四', exact: true }).waitFor();
  // This fixture's minimal hook adapter does not rerender useState; real React
  // removes the loading status on iframe load. Mirror that settled view only
  // after asserting the report heading is really present.
  const beforeLoaded = await page.locator('.ddr-viewer iframe').boundingBox();
  await page.locator('.ddr-viewer-status[role=status]').evaluateAll((items) => items.forEach((el) => el.remove()));
  const afterLoaded = await page.locator('.ddr-viewer iframe').boundingBox();
  if (Math.abs(beforeLoaded.y - afterLoaded.y) > .1 || Math.abs(beforeLoaded.height - afterLoaded.height) > .1) throw Error('Loading indicator removal shifted report layout');
  mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
  await page.screenshot({ path: new URL('./out/viewer-redesign-desktop.png', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') });
  console.log('PASS desktop viewer: native settings 800×800 / 28px; reduced motion disables animation');
  console.log('Boundary: synthetic DOM adapter, not real DSH React integration; no real GUI/config/report RPC used.');
} finally { await browser.close(); }
