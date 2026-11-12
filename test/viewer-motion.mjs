// Synthetic, server-free checks of the same motion controller used by Viewer.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.DDR_PLAYWRIGHT || `${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`;
const { chromium } = await import(pathToFileURL(modulePath));
const source = readFileSync(new URL('../client/client-source.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../client/ui.css', import.meta.url), 'utf8');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'no-preference' });
  await page.setContent('<html data-windows-titlebar><head></head><body></body></html>');
  await page.addStyleTag({ content: ':root{--dsw-alias-bg-layer-2:#2c2c2e;--dsw-alias-bg-mask-1:#0006;--dsw-radius-panel:28px}body{margin:0}' + css });
  await page.evaluate((source) => {
    const api = new Function('require', source.slice(0, source.lastIndexOf('return {\n  inject:')) + '\nreturn {captureViewerOrigin, createViewerMotion};')(() => ({}));
    window.setup = (withOrigin = true) => {
      document.body.innerHTML = '<button id="trigger" style="position:fixed;left:850px;top:600px;width:120px;height:28px">详细报告</button><div class="ddr-root ddr-viewer"><div class="ddr-viewer-mask"></div><div class="ddr-viewer-panel"><div class="ddr-viewer-content"><div class="ddr-viewer-head">合成报告</div></div></div></div>';
      const panel = document.querySelector('.ddr-viewer-panel');
      window.closeCount = 0;
      window.controller = api.createViewerMotion(panel, document.querySelector('.ddr-viewer-mask'), document.querySelector('.ddr-viewer-content'), withOrigin ? api.captureViewerOrigin(document.querySelector('#trigger')) : null, () => window.closeCount++);
    };
    window.finishAll = () => document.getAnimations().forEach((a) => a.finish());
    window.near = (a, b) => ['left', 'top', 'width', 'height'].every((k) => Math.abs(a[k] - b[k]) < 1);
    window.setup();
  }, source);
  const opening = await page.evaluate(() => {
    const p = document.querySelector('.ddr-viewer-panel');
    const a = p.getAnimations()[0]; a.pause(); a.currentTime = 0;
    const startMatchesButton = window.near(p.getBoundingClientRect(), document.querySelector('#trigger').getBoundingClientRect());
    a.currentTime = 140;
    return { startMatchesButton, midwayWidth: p.getBoundingClientRect().width, contentWidth: document.querySelector('.ddr-viewer-content').getBoundingClientRect().width, textTransform: getComputedStyle(document.querySelector('.ddr-viewer-content')).transform };
  });
  assert.equal(opening.startMatchesButton, true);
  assert.ok(opening.midwayWidth > 120 && opening.midwayWidth < 800);
  assert.ok(Math.abs(opening.contentWidth - 800) < .1, 'text layout stays at final width while surface grows');
  assert.equal(opening.textTransform, 'none', 'no text scaling');
  const reveal = await page.evaluate(() => {
    const c = document.querySelector('.ddr-viewer-content');
    const animations = document.getAnimations();
    const frames = [];
    for (const t of [0, 70, 140, 210, 279, 280, 310, 350, 400]) {
      for (const a of animations) { a.pause(); a.currentTime = t; }
      const r = c.getBoundingClientRect();
      frames.push({ t, opacity: Number(getComputedStyle(c).opacity), top: r.top, left: r.left });
    }
    return frames;
  });
  assert.ok(reveal.filter((f) => f.t <= 280).every((f) => f.opacity < .001), 'document remains hidden while the shell travels');
  const visible = reveal.filter((f) => f.opacity > .001);
  assert.ok(visible.length >= 2);
  assert.ok(visible.every((f) => Math.abs(f.top - visible[0].top) < .1 && Math.abs(f.left - visible[0].left) < .1), 'document reveals in place, never slides down with the shell');
  await page.evaluate(() => window.finishAll());
  await page.waitForFunction(() => document.querySelector('.ddr-viewer-panel').dataset.motion === 'idle');
  const closing = await page.evaluate(() => {
    document.querySelector('#trigger').style.left = '40px';
    window.controller.close(); window.controller.close();
    const p = document.querySelector('.ddr-viewer-panel');
    const a = p.getAnimations()[0]; a.pause(); a.currentTime = 200;
    return { returnsToLiveButton: window.near(p.getBoundingClientRect(), document.querySelector('#trigger').getBoundingClientRect()), inertDuringExit: document.querySelector('.ddr-viewer-content').inert };
  });
  assert.equal(closing.returnsToLiveButton, true);
  assert.equal(closing.inertDuringExit, true);
  await page.evaluate(() => window.finishAll());
  await page.waitForFunction(() => window.closeCount === 1);
  await page.evaluate(() => { window.controller.dispose(); window.setup(); window.controller.close(); window.finishAll(); });
  await page.waitForFunction(() => window.closeCount === 1);
  await page.evaluate(() => { window.controller.dispose(); window.setup(); window.controller.close(); window.controller.dispose(); });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await page.evaluate(() => window.closeCount), 0, 'unmount cancels late close callbacks');
  await page.evaluate(() => { window.setup(); window.finishAll(); });
  await page.waitForFunction(() => document.querySelector('.ddr-viewer-panel').dataset.motion === 'idle');
  const removed = await page.evaluate(() => {
    document.querySelector('#trigger').remove(); window.controller.close();
    return document.querySelector('.ddr-viewer-panel').getAnimations()[0].effect.getKeyframes().every((k) => !('transform' in k) && !('width' in k));
  });
  assert.equal(removed, true, 'no flight to a removed opener');
  await page.evaluate(() => window.finishAll());
  await page.waitForFunction(() => window.closeCount === 1);
  await page.evaluate(() => { window.controller.dispose(); window.setup(); });
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.waitForFunction(() => document.querySelector('.ddr-viewer-panel').dataset.motion === 'idle');
  assert.equal(await page.locator('.ddr-viewer-panel').evaluate((p) => p.getAnimations().length), 0, 'resize settles without orphaned animation');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { window.controller.dispose(); window.setup(); });
  assert.equal(await page.locator('.ddr-viewer-panel').evaluate((p) => p.getAnimations().length), 0);
  await page.evaluate(() => { window.controller.close(); window.controller.close(); });
  assert.equal(await page.evaluate(() => window.closeCount), 1, 'reduced-motion close is synchronous and idempotent');
  console.log('PASS button-origin opening and return to live button; fixed text layout; rapid close; unmount; removed opener; resize; reduced motion');
} finally { await browser.close(); }
