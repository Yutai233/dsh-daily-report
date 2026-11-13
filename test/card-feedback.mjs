// Real React regression for animated/fractional card measurement feedback.
// DDR_CARD_BASELINE=1 runs the last built artifact for a red/green comparison.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const bundle = readFileSync('../_research/dsh-src/dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-BgUyXZcc.js', 'utf8');
const runtime = bundle.slice(bundle.indexOf('function oc('), bundle.indexOf('(function(){', bundle.indexOf('function oc('))) + bundle.slice(bundle.indexOf('function ua('), bundle.indexOf(';var rp;', bundle.indexOf('function ua(')) + 1) + ';window.R={React:fk,DOM:xk,Client:Ck}';
const built = readFileSync('client/client.js', 'utf8');
const source = process.env.DDR_CARD_BASELINE ? built.slice(built.indexOf("const React = require('react');"), built.lastIndexOf('return {\n  inject:')) : readFileSync('client/client-source.js', 'utf8').split('return {\n  inject:')[0];
const css = readFileSync('client/ui.css', 'utf8');
const { chromium } = await import(pathToFileURL(`${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<body><div id="mount"></div></body>');
  await page.addScriptTag({ content: runtime });
  await page.addStyleTag({ content: ':root{--dsw-alias-label-primary:#eee;--dsw-alias-label-secondary:#ccc;--dsw-alias-bg-layer-2:#252525}body{margin:0;background:#151515}.ddr-card{animation:none}' + css });
  await page.evaluate(source => {
    const { React, DOM, Client } = window.R;
    const { MorningCard } = new Function('require', source + '\nreturn {MorningCard};')(name => name === 'react' ? React : name === 'react-dom' ? DOM : {});
    // Reproduce subpixel geometry changes without timing-dependent CSS frames.
    // The actual browser still performs all layout; only the third row's
    // visual bottom varies by < 1px, as it does during the card scale animation.
    const original = Element.prototype.getBoundingClientRect;
    let samples = 0;
    Element.prototype.getBoundingClientRect = function () {
      const r = original.call(this);
      if (this.matches('.ddr-carry-scroll li:nth-child(3)')) {
        const jitter = ++samples % 2 ? .6 : -.6;
        return { x: r.x, y: r.y, top: r.top, left: r.left, right: r.right, bottom: r.bottom + jitter, width: r.width, height: r.height + jitter };
      }
      return r;
    };
    class SlotBoundary extends React.Component {
      state = { failed: false };
      static getDerivedStateFromError() { return { failed: true }; }
      componentDidCatch(error) { window.cardError = error.message; }
      render() { return this.state.failed ? React.createElement('span', { 'data-slot-error': 'conversation.hero.brand.mark' }) : this.props.children; }
    }
    const state = { config: {}, card: { label: '合成日报', layer1: { oneLiner: '短摘要' }, carryOver: Array.from({ length: 6 }, (_, i) => ({ kind: 'todo', text: '待办 ' + i, title: '会话来源' })) } };
    const snapshot = { state };
    const store = { get: () => snapshot, subscribe() { return () => {}; } };
    function Brand() {
      const anchor = React.useRef(null);
      return React.createElement(React.Fragment, null,
        React.createElement('button', { ref: anchor, id: 'whale', style: { position: 'fixed', left: '50%', top: '65%' } }, 'whale'),
        React.createElement(MorningCard, { anchorRef: anchor, store, onClose() {} }));
    }
    window.root = Client.createRoot(document.querySelector('#mount'));
    DOM.flushSync(() => window.root.render(React.createElement(SlotBoundary, null, React.createElement(Brand))));
  }, source);
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 600)));
  const result = await page.evaluate(() => ({ whale: !!document.querySelector('#whale'), card: !!document.querySelector('.ddr-card'), error: window.cardError, retired: !!document.querySelector('[data-slot-error]') }));
  console.log(JSON.stringify({ baseline: !!process.env.DDR_CARD_BASELINE, errors, result }, null, 2));
  assert.equal(result.retired, false, 'card geometry must not retire the whole whale slot');
  assert.equal(result.whale && result.card, true, 'whale and card must both remain mounted');
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
