import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const source = readFileSync(new URL('../client/client-source.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../client/ui.css', import.meta.url), 'utf8');
global.document = { body: {} };

// Same source-level element harness as client-ui.test.mjs; not a visual preview.
function harness() {
  const effects = [];
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
    Fragment: 'fragment', useState: (initial) => [initial, () => {}],
    useEffect: (effect) => effects.push(effect), useLayoutEffect() {},
    useRef: () => ({ current: null }), useCallback: (fn) => fn,
    useSyncExternalStore: (_, get) => get(),
  };
  const api = new Function('require', source.slice(0, source.lastIndexOf('return {\n  inject:')) + '\nreturn { MorningCard, formatBiliTokens, bindTokenCubeVisibility };')((name) => name === 'react' ? React : name === 'react-dom' ? { createPortal: (node) => node } : {});
  return { ...api, effects };
}
function nodes(root) { return root && typeof root === 'object' ? [root, ...root.children.flatMap(nodes)] : []; }
function text(root) { return root && typeof root === 'object' ? root.children.map(text).join('') : String(root ?? ''); }
function find(root, name) { return nodes(root).find((node) => (node.props.className || '').split(' ').includes(name)); }
function render(bili, extra = {}) {
  const api = harness();
  const { usage = { tokens: '6822 万', cost: '¥19.58', trend: 'up', delta: '+12%' }, legacyUsage, ...snapExtra } = extra;
  const snap = { state: { config: {}, card: { key: '2026-11-13', label: '11月13日', layer1: { usage, bili, alerts: ['连续 1h 未休息'] }, usage: legacyUsage } }, ...snapExtra };
  const store = { subscribe() {}, get: () => snap };
  const tree = api.MorningCard({ store, anchorRef: { current: null }, onClose() {} });
  return { tree, ...api };
}

test('production module factory parses without generating or loading a client artifact', () => {
  const fish = readFileSync(new URL('../client/fish-paths.js', import.meta.url), 'utf8');
  const artifact = "window.__ModuleLoader__.load({\n id: 'dsh-daily-report',\n factory(require) {\n" +
    ' const CSS_TEXT = ' + JSON.stringify(css) + ';\n' + fish + '\n' + source + '\n }\n});\n';
  assert.doesNotThrow(() => new Script(artifact, { filename: 'client.js' }));
});

test('only actual positive net savings adds the second cuboid face and retains tokens/trend', () => {
  const { tree } = render({ netSavedTokens: 123456, reclaimedTokens: 99999999, compressionCount: 4, cacheHitRate: .93 });
  const cube = find(tree, 'dr-token-cube');
  assert.ok(cube);
  assert.match(text(find(cube, 'dr-token-cube__face--usage')), /6822 万 tokens▲ \+12%/);
  assert.equal(text(find(cube, 'dr-token-cube__face--bili')), 'bili-c节省12.3万');
  assert.doesNotMatch(text(cube), /9999|93%|undefined|NaN/);
  assert.match(cube.props.title, /¥19\.58；bili-c净节省 12\.3万 tokens（已扣除压缩及摘要开销）/);
  assert.ok(find(tree, 'ddr-alert'), 'the existing alert remains alongside the cube');
});

test('estimated ledger savings are labelled approximate in the face title and accessible name', () => {
  const { tree } = render({ netSavedTokens: 123456, estimated: true });
  const cube = find(tree, 'dr-token-cube');
  assert.equal(text(find(cube, 'dr-token-cube__face--bili')), 'bili-c节省约12.3万');
  assert.match(cube.props.title, /bili-c净节省约 12\.3万 tokens（bili 账本净收益估算，已扣除压缩及摘要开销；非账单实测\/非窗口回收量）/);
  assert.match(cube.props['aria-label'], /净节省约 12\.3万/);
  assert.equal(text(find(render({ netSavedTokens: 123456, estimated: false }).tree, 'dr-token-cube__face--bili')), 'bili-c节省12.3万');
  const negative = render({ netSavedTokens: -123456, estimated: true }).tree;
  assert.equal(find(negative, 'dr-token-cube'), undefined);
  assert.match(find(negative, 'ddr-usage').props.title, /净增加约 12\.3万/);
});

test('missing plugin and invalid savings preserve static usage without a blank face', () => {
  for (const bili of [undefined, null, {}, { reclaimedTokens: 123456 }, ...[null, undefined, NaN, Infinity, -Infinity, '10000', {}, []].map((netSavedTokens) => ({ netSavedTokens }))]) {
    const { tree } = render(bili);
    assert.equal(find(tree, 'dr-token-cube'), undefined);
    assert.equal(text(find(tree, 'ddr-usage')), '6822 万 tokens▲ +12%');
    assert.doesNotMatch(text(tree), /bili-c|undefined|NaN|Infinity/);
    if (!bili) assert.equal(find(tree, 'ddr-usage').props.title, '这一天用掉的 token，估算花费约 ¥19.58');
  }
});

test('zero and negative net savings never claim positive or negative savings', () => {
  for (const netSavedTokens of [0, -0, -125000]) {
    const { tree } = render({ netSavedTokens });
    assert.equal(find(tree, 'dr-token-cube'), undefined);
    assert.doesNotMatch(text(tree), /bili-c节省|净增加/);
    const title = find(tree, 'ddr-usage').props.title;
    assert.doesNotMatch(title, /节省 -/);
    assert.match(title, netSavedTokens < 0 ? /净增加 12\.5万 tokens（压缩及摘要开销超过节省）/ : /净节省 0 tokens/);
  }
});

test('Chinese token units stay compact across 万 and 亿 rounding boundaries', () => {
  const { formatBiliTokens } = harness();
  for (const [n, expected] of [[0, '0'], [.2, '<1'], [1, '1'], [9999, '9999'], [9999.5, '1万'], [10000, '1万'], [123456, '12.3万'], [99994000, '9999.4万'], [99995000, '1亿'], [100000000, '1亿'], [123456789, '1.2亿'], [1200000000, '12亿']]) {
    assert.equal(formatBiliTokens(n), expected, String(n));
  }
  for (const n of [null, undefined, NaN, Infinity, -1, '10000']) assert.equal(formatBiliTokens(n), '');
});

test('legacy usage keeps its old fallback and absent usage cannot create an empty cube', () => {
  const { tree } = render({ netSavedTokens: 12000 }, { usage: null, legacyUsage: { rows: [{ value: '10 万' }, { value: '¥1.00' }] } });
  assert.equal(text(find(tree, 'dr-token-cube__face--usage')), '10 万 tokens');
  assert.doesNotMatch(text(tree), /▲|▼|undefined/);
  const empty = render({ netSavedTokens: 12000 }, { usage: null }).tree;
  assert.equal(find(empty, 'dr-token-cube'), undefined);
  assert.equal(find(empty, 'ddr-usage'), undefined);
  assert.doesNotMatch(text(empty), /undefined|bili-c/);
});

test('one accessible group describes both values while decorative faces never repeat or announce', () => {
  const { tree } = render({ netSavedTokens: 123456 });
  const cube = find(tree, 'dr-token-cube');
  assert.equal(cube.props.role, 'group');
  assert.match(cube.props['aria-label'], /6822 万 tokens，与前一天相比 ▲ \+12%；bili-c净节省 12\.3万 tokens/);
  assert.equal(find(cube, 'dr-token-cube__rotor').props['aria-hidden'], true);
  assert.equal(cube.props.tabIndex, undefined, 'noninteractive metric adds no keyboard stop');
  assert.ok(!nodes(cube).some((node) => node.props['aria-live']), 'rotation is not a repeating live announcement');
});

test('viewer and busy interaction pause only the cube', () => {
  assert.equal(find(render({ netSavedTokens: 5 }).tree, 'dr-token-cube').props['data-paused'], 'false');
  for (const extra of [{ viewer: { id: 1 } }, { busy: 'daily' }]) {
    assert.equal(find(render({ netSavedTokens: 5 }, extra).tree, 'dr-token-cube').props['data-paused'], 'true');
  }
});

test('page visibility pause initializes immediately and is removed on disposal', () => {
  const { bindTokenCubeVisibility } = harness();
  const events = new Map(); const removed = [];
  const previous = global.document;
  global.document = { hidden: true, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: (name, fn) => { removed.push([name, fn]); events.delete(name); } };
  try {
    const node = { dataset: {} };
    const cleanup = bindTokenCubeVisibility(node);
    const listener = events.get('visibilitychange');
    assert.equal(node.dataset.hidden, 'true');
    global.document.hidden = false; listener();
    assert.equal(node.dataset.hidden, 'false');
    cleanup(); assert.equal(events.size, 0); assert.deepEqual(removed, [['visibilitychange', listener]]);
    assert.equal(bindTokenCubeVisibility(null), undefined);
  } finally { global.document = previous; }
  assert.match(source, /useEffect\(\(\) => tokText && showBili \? bindTokenCubeVisibility\(tokenCubeRef\.current\)/);
});

test('cube CSS reserves both faces, constrains narrow widths, and respects static reduced motion', () => {
  assert.match(css, /\.dr-token-cube\{[^}]*max-width:100%[^}]*perspective:280px[^}]*overflow:hidden/);
  assert.match(css, /\.dr-token-cube__rotor\{[^}]*display:grid[^}]*grid-template-columns:minmax\(0,1fr\)[^}]*transform-style:preserve-3d[^}]*animation:dr-token-cube-turn 10s/);
  assert.match(css, /\.dr-token-cube__face\{[^}]*grid-area:1\/1[^}]*text-overflow:ellipsis[^}]*backface-visibility:hidden/);
  assert.match(css, /\.dr-token-cube__face--bili\{transform:rotateX\(-90deg\) translateZ\(9px\)/);
  assert.match(css, /@keyframes dr-token-cube-turn\{0%,42%.*47%,92%.*97%,100%/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\s*\.dr-token-cube__rotor\{display:flex;align-items:center;gap:4px;animation:none;transform:none;transform-style:flat\}\s*\.dr-token-cube__face--usage\{flex:0 1 auto;transform:none\}\s*\.dr-token-cube__face--bili\{flex:0 1 auto;transform:none;font-size:11px\}\s*\.dr-token-cube__face--bili::before\{content:"· "\}/);
  assert.match(css, /\.dr-token-cube__rotor\{[^}]*transform:translateZ\(-9px\) rotateX\(0deg\);animation:dr-token-cube-turn/);
  assert.match(css, /@media \(prefers-reduced-motion:no-preference\)\{\s*\.dr-token-cube\[data-hidden=true\].*\.dr-token-cube\[data-paused=true\].*\.ddr-card:focus-within.*\{animation:none;transform:translateZ\(-9px\) rotateX\(0deg\)\}/);
  assert.match(css, /@media \(hover:hover\) and \(prefers-reduced-motion:no-preference\)\{\.dr-token-cube:hover.*\{animation:none;transform:translateZ\(-9px\) rotateX\(0deg\)\}/);
  assert.doesNotMatch(css, /\.dr-token-cube[^}]*animation-play-state:paused/, 'pause must not freeze a half-turned cuboid');
});
