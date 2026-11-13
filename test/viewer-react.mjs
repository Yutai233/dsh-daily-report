// Real React 18 browser integration; local extracted DSH runtime only, no server/network/profile.
// DDR_REACT_BUNDLE optionally points at the installed DSH frontend index bundle.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const bundlePath = process.env.DDR_REACT_BUNDLE || resolve('../_research/dsh-src/dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-BgUyXZcc.js');
assert.ok(existsSync(bundlePath), 'Supply DDR_REACT_BUNDLE pointing at an already installed DSH frontend bundle');
const bundle = readFileSync(bundlePath, 'utf8');
// Preserve the real bundled implementations and exact namespace helper, excluding application boot.
const helperStart = bundle.indexOf('function oc(');
const helperEnd = bundle.indexOf('(function(){', helperStart);
const runtimeStart = bundle.indexOf('function ua(');
const runtimeEnd = bundle.indexOf(';var rp;', runtimeStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart && runtimeStart > helperEnd && runtimeEnd > runtimeStart, 'Known DSH React bundle extraction boundaries');
const runtime = bundle.slice(helperStart, helperEnd) + bundle.slice(runtimeStart, runtimeEnd + 1) + '\nwindow.__realReact={React:fk,ReactDOM:xk,ReactDOMClient:Ck};';
const source = process.env.DDR_VIEWER_REV
  ? execFileSync('git', ['show', process.env.DDR_VIEWER_REV + ':client/client-source.js'], { encoding: 'utf8' })
  : readFileSync(new URL('../client/client-source.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../client/ui.css', import.meta.url), 'utf8');
const playwrightPath = process.env.DDR_PLAYWRIGHT || `${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`;
const { chromium } = await import(pathToFileURL(playwrightPath));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'no-preference' });
  const errors = [], navigations = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('framenavigated', frame => { if (frame !== page.mainFrame()) navigations.push(frame.url()); });
  await page.route('**/*', route => { requests.push(route.request().url()); return route.abort(); });
  await page.setContent('<html data-windows-titlebar><head></head><body><button id="trigger" style="position:fixed;left:850px;top:600px;width:120px;height:28px">Open report</button><div id="mount"></div></body></html>');
  await page.addStyleTag({ content: ':root{--dsw-alias-bg-layer-2:#252525;--dsw-alias-bg-mask-1:#0006;--dsw-alias-label-primary:#eee;--dsw-alias-label-secondary:#ccc;--dsw-radius-panel:28px}body{margin:0}' + css });
  await page.addScriptTag({ content: runtime });
  await page.evaluate(source => {
    const { React, ReactDOM, ReactDOMClient } = window.__realReact;
    if (React.version !== '18.3.1' || !ReactDOMClient.createRoot) throw Error('Expected real React 18 runtime');
    const api = new Function('require', source.slice(0, source.lastIndexOf('return {\n  inject:')) + '\nreturn {Viewer,makeStore};')(name => name === 'react' ? React : name === 'react-dom' ? ReactDOM : {});
    window.__store = api.makeStore({ rpc: { async call(_base, route, payload) { if (route.endsWith('/report')) return { ok: true, value: { html: window.__report(payload.key) } }; throw Error('Unexpected synthetic RPC: ' + route); } } });
    window.__report = id => `<!doctype html><html><head><title>Synthetic ${id}</title><style>body{margin:0;font:18px Arial;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#111)}h1{margin:24px}</style></head><body><h1>Report ${id}</h1><p>Real React iframe integration</p></body></html>`;
    window.__frameTrace = [];
    new MutationObserver(records => {
      for (const record of records) if (record.type === 'attributes' && record.attributeName === 'srcdoc' && record.target.tagName === 'IFRAME') window.__frameTrace.push({ type: 'srcdoc', title: record.target.title, time: performance.now() });
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['srcdoc'] });
    document.addEventListener('load', event => { if (event.target.tagName === 'IFRAME') window.__frameTrace.push({ type: 'load', title: event.target.title, time: performance.now() }); }, true);
    window.__root = ReactDOMClient.createRoot(document.querySelector('#mount'));
    window.__root.render(React.createElement(api.Viewer, { store: window.__store }));
    window.openReport = (id, viaRpc = false) => viaRpc ? window.__store.view('daily', id, 'Report ' + id, document.querySelector('#trigger')) : window.__store.showHtml('Report ' + id, window.__report(id), 'daily', id, document.querySelector('#trigger'));
    window.closeReport = () => document.querySelector('[data-viewer-close]').click();
    window.toggleTheme = n => { document.documentElement.style.setProperty('--dsw-alias-bg-base', n % 2 ? '#151515' : '#fafafa'); document.documentElement.style.setProperty('--dsw-alias-label-primary', n % 2 ? '#eeeeee' : '#111111'); };
    window.viewerState = () => {
      const p = document.querySelector('.ddr-viewer-panel'), c = document.querySelector('.ddr-viewer-content'), f = document.querySelector('.ddr-viewer iframe');
      const rect = el => { const r = el.getBoundingClientRect(); return { width: r.width, height: r.height, top: r.top, left: r.left }; };
      return { exists: !!p, panel: p && rect(p), iframe: f && rect(f), opacity: c && getComputedStyle(c).opacity, panelOpacity: p && getComputedStyle(p).opacity, inert: c && c.inert, ancestorInert: c && c.closest('[inert]')?.className, motion: p?.dataset.motion, loading: !!document.querySelector('[role=status]'), animations: document.getAnimations().map(a => ({ playState: a.playState, currentTime: a.currentTime })) };
    };
  }, source);
  async function settleAndCheck(id, label) {
    const frame = page.frameLocator('.ddr-viewer iframe');
    await frame.getByRole('heading', { name: 'Report ' + id, exact: true }).waitFor({ timeout: 5000 });
    await page.waitForFunction(() => document.querySelector('.ddr-viewer-panel')?.dataset.motion === 'idle', null, { timeout: 5000 });
    const state = await page.evaluate(() => window.viewerState());
    assert.ok(state.iframe.width > 600 && state.iframe.height > 300, label + ': visible iframe geometry ' + JSON.stringify(state));
    assert.equal(state.opacity, '1', label + ': visible content');
    assert.equal(state.panelOpacity, '1', label + ': visible panel');
    assert.equal(state.inert, false, label + ': content must not retain closing inert');
    assert.equal(state.loading, false, label + ': load state must settle');
    results.push(label);
  }
  for (let i = 0; i < 12; i++) {
    await page.evaluate(i => window.openReport('normal-' + i, i % 2 === 0), i);
    await settleAndCheck('normal-' + i, 'normal-' + i);
    await page.evaluate(i => window.toggleTheme(i), i);
    await settleAndCheck('normal-' + i, 'theme-' + i);
    await page.evaluate(() => window.closeReport());
    await page.locator('.ddr-viewer').waitFor({ state: 'detached' });
  }
  // Mutate theme while opening/replacing srcDoc before its initial load settles.
  for (let i = 0; i < 12; i++) {
    await page.evaluate(async i => {
      window.openReport('raced-before-' + i);
      await new Promise(requestAnimationFrame);
      window.toggleTheme(i + 1);
      window.openReport('raced-after-' + i, true);
      await new Promise(requestAnimationFrame);
      window.toggleTheme(i + 2);
    }, i);
    await settleAndCheck('raced-after-' + i, 'raced-after-' + i);
    await page.evaluate(() => window.closeReport());
    await page.locator('.ddr-viewer').waitFor({ state: 'detached' });
  }
  // Reuse the same mounted Viewer/content DOM while cancelling an outgoing motion.
  for (let i = 0; i < 4; i++) {
    await page.evaluate(i => window.openReport('quick-before-' + i), i);
    await settleAndCheck('quick-before-' + i, 'quick-before-' + i);
    await page.evaluate(i => { window.closeReport(); window.openReport('quick-after-' + i); }, i);
    await settleAndCheck('quick-after-' + i, 'quick-after-' + i);
    await page.evaluate(() => window.closeReport());
    await page.locator('.ddr-viewer').waitFor({ state: 'detached' });
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  console.log(JSON.stringify({ result: 'passed', revision: process.env.DDR_VIEWER_REV || 'working-tree', runtime: bundlePath, react: '18.3.1', checks: results, iframeNavigations: navigations.length, iframeTrace: await page.evaluate(() => window.__frameTrace) }, null, 2));
} catch (error) {
  const failedPage = browser.contexts()[0]?.pages()[0];
  const diagnostics = failedPage ? {
    state: await failedPage.evaluate(() => ({ ...window.viewerState(), currentViewer: window.__store.get().viewer?.title, srcdoc: document.querySelector('.ddr-viewer iframe')?.getAttribute('srcdoc'), trace: window.__frameTrace })).catch(() => null),
    frames: await Promise.all(failedPage.frames().filter(f => f !== failedPage.mainFrame()).map(f => f.evaluate(() => ({ title: document.title, body: document.body?.innerText, html: document.documentElement.outerHTML, ready: document.readyState, visibility: document.visibilityState, rootDisplay: getComputedStyle(document.documentElement).display, bodyDisplay: getComputedStyle(document.body).display, heading: [...document.querySelectorAll('h1')].map(h => ({ text: h.textContent, rect: { width: h.getBoundingClientRect().width, height: h.getBoundingClientRect().height }, display: getComputedStyle(h).display, visibility: getComputedStyle(h).visibility })) })).catch(e => ({ error: e.message })))),
  } : null;
  console.error(JSON.stringify({ result: 'failed', runtime: bundlePath, checks: results, message: error.message, diagnostics }, null, 2));
  throw error;
} finally { await browser.close(); }
