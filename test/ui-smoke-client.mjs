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
    let effects = [], layoutEffects = [], writeState = () => {};
    const flushEffects = () => {
      // Refs are attached while building the DOM; never measure until it is inserted.
      const cleanups = [...layoutEffects, ...effects].map((f) => f());
      layoutEffects = []; effects = [];
      return () => cleanups.forEach((f) => { if (typeof f === 'function') f(); });
    };
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
      useState(initial) {
        let value = typeof initial === 'function' ? initial() : initial;
        const commit = writeState;
        return [value, (next) => { value = typeof next === 'function' ? next(value) : next; commit(value); }];
      },
      useEffect: (f) => effects.push(f), useLayoutEffect: (f) => layoutEffects.push(f),
      useRef: (initial) => ({ current: initial }), useCallback: (f) => f, useSyncExternalStore: (_, get) => get(),
    };
    const api = new Function('require', source.slice(0, source.lastIndexOf('return {\n  inject:')) + '\nreturn {SettingsSection, Viewer, MorningCard};')((name) => name === 'react' ? React : name === 'react-dom' ? { createPortal: (x) => x } : {});
    const state = { config: cfg, toolAvailable: false, platform: 'win32', idle: {}, dataDir: 'C:/synthetic/' + 'very-long-directory/'.repeat(20), reports: { daily: ['2026-11-10-' + 'long-report-key-'.repeat(20)] } };
    const store = { get: () => ({ state }), subscribe() {}, refresh() {}, call() { throw Error('Unexpected RPC'); }, open() {}, view() {} };
    document.querySelector('#mount').append(api.SettingsSection({ store }));
    effects = []; layoutEffects = [];
    window.mountMorningCard = () => {
      const anchor = document.createElement('button');
      anchor.id = 'morning-card-anchor';
      anchor.textContent = 'Synthetic hero anchor';
      Object.assign(anchor.style, { position: 'fixed', left: 'calc(50vw - 12px)', top: innerWidth < 600 ? '20vh' : '70vh', width: '24px', height: '24px', overflow: 'hidden' });
      document.body.append(anchor);
      const card = {
        key: 'synthetic', label: '11月12日 周四',
        layer1: {
          headline: 'Synthetic long morning digest',
          oneLiner: '这是一段合成长摘要，用于验证小窗口内的内容可滚动，而非被卡片高度裁切；所有文字都只存在于测试页面中。'.repeat(40),
        },
        carryOver: Array.from({ length: 6 }, (_, i) => ({
          kind: 'todo', text: `第${i + 1}项长待办：` + '继续验证跨会话任务的完整上下文、重试步骤和验收结果，不应隐藏末尾内容。'.repeat(2),
          title: `合成会话 ${i + 1} · 保留任务来源与后续检查说明`,
        })),
      };
      const section = api.MorningCard({ store: { ...store, get: () => ({ state: { ...state, card } }) }, anchorRef: { current: anchor }, onClose() {} });
      document.body.append(section);
      const cleanup = flushEffects();
      window.unmountMorningCard = () => { cleanup(); section.remove(); anchor.remove(); };
    };
    window.mountViewer = (html, sessionIds = []) => {
      document.querySelector('#previous').focus();
      let close;
      const viewer = { title: html ? 'DSH 每日简报 · 11月12日 周四' : 'Synthetic report title '.repeat(10), kind: 'daily', key: 'synthetic', sessionIds, html: html || '<h1>Synthetic report</h1><details><summary>Expand</summary>Details work</details><script>parent.__escaped=true</script><img src="https://example.invalid/tracker"><meta http-equiv="refresh" content="0; url=https://example.invalid/refresh">' };
      window.openedSessions = [];
      const vStore = { ...store, get: () => ({ viewer }), openSession(id) { window.openedSessions.push(id); }, closeViewer() { close(); } };
      const modal = api.Viewer({ store: vStore }); document.body.append(modal);
      const cleanup = flushEffects();
      close = () => { modal.remove(); cleanup(); };
    };
  }, { source, cfg });
  for (const width of [320, 375, 520, 900]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => [...document.querySelectorAll('.ddr-set, .ddr-row, .ddr-report, .ddr-input, .ddr-field')].filter((el) => el.getBoundingClientRect().right > innerWidth + 1 || el.getBoundingClientRect().left < -1).map((el) => el.className));
    if (overflow.length) throw Error(`Overflow at ${width}px: ${overflow.join(', ')}`);
    console.log(`PASS settings ${width}px: long fields, numeric controls, report rows within viewport`);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const { width, height, overlayTop } of [
    { width: 1280, height: 800, overlayTop: 0 },
    { width: 1280, height: 500, overlayTop: 32 },
    { width: 375, height: 640, overlayTop: 0 },
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((top) => {
      document.documentElement.style.setProperty('--dsh-frame-overlay-top', top + 'px');
      window.mountMorningCard();
    }, overlayTop);
    const before = await page.locator('.ddr-card').evaluate((card) => {
      const scroll = card.querySelector('.ddr-card-scroll');
      const header = card.querySelector('header');
      const sixth = card.querySelectorAll('.ddr-list li')[5];
      const button = [...card.querySelectorAll('button')].find((el) => el.textContent === '查看完整报告');
      const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
      return { anchor: rect(document.querySelector('#morning-card-anchor')), card: rect(card), header: rect(header), scroll: rect(scroll), sixth: sixth && rect(sixth), button: button && rect(button), count: card.querySelectorAll('.ddr-list li').length, clientHeight: scroll.clientHeight, scrollHeight: scroll.scrollHeight, overflowY: getComputedStyle(scroll).overflowY, placement: card.dataset.placement, top: card.style.top };
    });
    const inViewport = (r) => r && r.left >= -1 && r.right <= width + 1 && r.top >= -1 && r.bottom <= height + 1;
    if (before.count !== 6 || !inViewport(before.card) || !inViewport(before.header) || before.card.left < 15 || before.card.top < Math.max(16, overlayTop + 12) - 1 || before.card.bottom > height - 15 || !before.top) throw Error(`MorningCard not placed within ${width}×${height}: ${JSON.stringify(before)}`);
    if (before.placement === 'above' ? before.card.bottom > before.anchor.top - 11 : before.card.top < before.anchor.bottom + 11) throw Error(`MorningCard covers whale anchor at ${width}×${height}: ${JSON.stringify(before)}`);
    if (before.placement !== (width < 600 ? 'below' : 'above')) throw Error(`MorningCard did not use expected source placement at ${width}×${height}: ${before.placement}`);
    if (!['auto', 'scroll'].includes(before.overflowY) || before.scrollHeight <= before.clientHeight + 1 || before.sixth?.top < before.scroll.bottom || before.button?.top < before.scroll.bottom) throw Error(`Long MorningCard fixture did not overflow at ${width}×${height}: ${JSON.stringify(before)}`);
    const listState = await page.getByRole('region', { name: '明日待续列表' }).evaluate((el) => {
      const items = [...el.querySelectorAll('li')];
      const before = el.getBoundingClientRect();
      // 卡片只露出一部分待续，数量取决于行高（条目越短露出的越多），所以只断言「露出若干条且必须滚动」。
      const visible = items.filter((li) => {
        const r = li.getBoundingClientRect();
        return r.top >= before.top - 1 && r.bottom <= before.bottom + 1;
      }).length;
      const result = { visible, overflow: el.scrollHeight > el.clientHeight };
      el.scrollTop = el.scrollHeight;
      const sixth = items[5].getBoundingClientRect();
      result.sixthReachable = sixth.bottom <= before.bottom + 1 && sixth.top >= before.top - 1;
      return result;
    });
    if (listState.visible < 2 || listState.visible >= 6 || !listState.overflow || !listState.sixthReachable) throw Error(`carry-over viewport failed: ${JSON.stringify(listState)}`);
    await page.getByRole('region', { name: '简报内容' }).evaluate((el) => { el.scrollTop = el.scrollHeight; });
    const after = await page.locator('.ddr-card').evaluate((card) => {
      const scroll = card.querySelector('.ddr-card-scroll');
      const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
      const button = [...card.querySelectorAll('button')].find((el) => el.textContent === '查看完整报告');
      const r = button.getBoundingClientRect();
      return { header: rect(card.querySelector('header')), scroll: rect(scroll), sixth: rect(card.querySelectorAll('.ddr-list li')[5]), button: rect(button), buttonExposed: button.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)), scrollTop: scroll.scrollTop, remaining: scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop };
    });
    const withinScroll = (r) => inViewport(r) && r.top >= after.scroll.top - 1 && r.bottom <= after.scroll.bottom + 1;
    if (after.scrollTop <= 0 || Math.abs(after.remaining) > 1 || !withinScroll(after.sixth) || !withinScroll(after.button) || !after.buttonExposed) throw Error(`MorningCard end clipped at ${width}×${height}: ${JSON.stringify(after)}`);
    if (!inViewport(after.header) || Math.abs(after.header.top - before.header.top) > .1 || Math.abs(after.header.bottom - before.header.bottom) > .1) throw Error(`MorningCard header moved while scrolling at ${width}×${height}: ${JSON.stringify({ before: before.header, after: after.header })}`);
    await page.evaluate(() => window.unmountMorningCard());
    console.log(`PASS MorningCard ${width}×${height}: real source placement; long summary and 6 long todos scroll; sixth item and full-report button exposed at end; header stays in viewport`);
  }
  await page.evaluate(() => document.documentElement.style.removeProperty('--dsh-frame-overlay-top'));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
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
  await page.locator('.ddr-viewer').waitFor({ state: 'detached' });
  if (!(await page.locator('#previous').evaluate((el) => el === document.activeElement))) throw Error('Focus was not restored');
  if (await page.locator('#mount').evaluate((el) => el.inert)) throw Error('Background inert was not restored');
  console.log('PASS viewer: sandbox, external-resource CSP, native details, initial/restored focus, background inert');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const interactiveReport = structuredClone(sampleDaily);
  interactiveReport.layer1.discovery = '反复手工验证的布局可以沉淀为回归脚本。';
  interactiveReport.sections.carryOver = [{ kind: 'todo', text: '继续验证', title: '合成来源', sessionId: 'allowed-session' }];
  const malicious = '<script>window.__reportScriptRan=true;parent.postMessage({type:"evil"},"*")</script><button data-ddr-session="rogue-session">伪造来源</button><button onclick="window.__handlerRan=true">恶意事件</button>';
  await page.evaluate((html) => window.mountViewer(html, ['allowed-session']), renderHtml(interactiveReport, { sessionLinks: true }) + malicious);
  const interactiveFrame = page.frameLocator('.ddr-viewer iframe');
  await interactiveFrame.locator('.discovery').waitFor();
  if (await interactiveFrame.locator('.discovery').textContent() !== '每日发现：反复手工验证的布局可以沉淀为回归脚本。') throw Error('Discovery was not rendered as one inline line');
  if (await page.locator('.ddr-viewer iframe').getAttribute('sandbox') !== 'allow-scripts') throw Error('Interactive frame permissions are not minimal');
  await page.evaluate(() => window.postMessage({ type: 'ddr-open-session', token: 'fake', sessionId: 'allowed-session' }, '*'));
  await interactiveFrame.getByRole('button', { name: '伪造来源' }).click();
  await interactiveFrame.getByRole('button', { name: '恶意事件' }).click();
  if ((await page.evaluate(() => window.openedSessions)).length) throw Error('Forged source or message was accepted');
  const realFrame = page.frames().find((f) => f !== page.mainFrame());
  if (await realFrame.evaluate(() => window.__reportScriptRan || window.__handlerRan)) throw Error('Untrusted report scripts executed');
  await interactiveFrame.getByRole('button', { name: '相关会话', exact: true }).click();
  await page.waitForFunction(() => window.openedSessions.length === 1);
  await interactiveFrame.getByRole('button', { name: '相关会话', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.openedSessions.length === 2);
  if ((await page.evaluate(() => window.openedSessions)).some((id) => id !== 'allowed-session')) throw Error('Unexpected session destination');
  if (requests.length) throw Error('Interactive report requested external resources');
  await page.getByRole('button', { name: '关闭报告' }).click();
  await page.locator('.ddr-viewer').waitFor({ state: 'detached' });
  console.log('PASS interactive report: optional discovery; inline source opens by click/keyboard; forged messages, unknown sessions and imported scripts rejected');
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
