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
  const api = new Function('require', source.slice(0, source.lastIndexOf('return {\n  inject:')) + '\nreturn { MorningCard, formatBiliTokens, formatBiliPanelTokens, bindTokenCubeVisibility, advanceTokenCube };')((name) => name === 'react' ? React : name === 'react-dom' ? { createPortal: (node) => node } : {});
  return { ...api, effects };
}
function nodes(root) { return root && typeof root === 'object' ? [root, ...root.children.flatMap(nodes)] : []; }
function text(root) { return root && typeof root === 'object' ? root.children.map(text).join('') : String(root ?? ''); }
function find(root, name) { return nodes(root).find((node) => (node.props.className || '').split(' ').includes(name)); }
function render(bili, extra = {}) {
  const api = harness();
  const { usage = { tokens: '6822 万', cost: '¥19.58', trend: 'up', delta: '+12%' }, legacyUsage, alerts = ['连续 1h 未休息'], ...snapExtra } = extra;
  const snap = { state: { config: {}, card: { key: '2026-11-13', label: '11月13日', layer1: { usage, bili, alerts }, usage: legacyUsage } }, ...snapExtra };
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
  assert.equal(text(find(cube, 'dr-token-cube__face--bili')), 'bili-c当天净省 12.3万 tokens');
  assert.doesNotMatch(text(cube), /9999|93%|undefined|NaN/);
  assert.equal(cube.props.title, undefined, 'no hover tooltip on the cuboid');
  assert.match(cube.props['aria-label'], /估算花费约 ¥19\.58；bili-c当天净省 12\.3万 tokens（已扣除压缩及摘要开销）/);
  assert.ok(find(tree, 'ddr-alert'), 'the existing alert remains alongside the cube');
  // Both faces repeat once so the cuboid can keep turning in one direction.
  assert.equal(text(find(cube, 'dr-token-cube__face--usage-back')), text(find(cube, 'dr-token-cube__face--usage')));
  assert.equal(text(find(cube, 'dr-token-cube__face--bili-back')), text(find(cube, 'dr-token-cube__face--bili')));
});

test('estimated ledger savings are labelled approximate in the face and accessible name', () => {
  const { tree } = render({ netSavedTokens: 123456, estimated: true });
  const cube = find(tree, 'dr-token-cube');
  assert.equal(text(find(cube, 'dr-token-cube__face--bili')), 'bili-c当天净省约 12.3万 tokens');
  assert.match(cube.props['aria-label'], /bili-c当天净省约 12\.3万 tokens（bili 账本净收益估算，已扣除压缩及摘要开销；非账单实测\/非窗口回收量）/);
  assert.equal(text(find(render({ netSavedTokens: 123456, estimated: false }).tree, 'dr-token-cube__face--bili')), 'bili-c当天净省 12.3万 tokens');
  const negative = render({ netSavedTokens: -123456, estimated: true }).tree;
  assert.equal(find(negative, 'dr-token-cube'), undefined);
  assert.doesNotMatch(text(negative), /净增|节省|12\.3万 tokens/);
});

test('lifetime total matches the bili-c overview and takes precedence over the day figure', () => {
  // 328108141.33014405 is what GET /__bili/overview reports as netSavedTotal (the panel prints 328.1M).
  const { tree } = render({ netSavedTokens: 123456, totalNetSavedTokens: 328108141.33014405, estimated: true });
  const cube = find(tree, 'dr-token-cube');
  assert.equal(text(find(cube, 'dr-token-cube__face--bili')), 'bili-c净省约 328.1M tokens');
  assert.equal(cube.props.title, undefined);
  assert.match(cube.props['aria-label'], /bili-c净省约 328\.1M tokens（bili-c 面板「净节省」，理论上界：每次折叠的节省 × 其后每个请求累计）/);
  assert.equal(text(find(render({ totalNetSavedTokens: 250000000 }).tree, 'dr-token-cube__face--bili')), 'bili-c净省约 250.0M tokens');
  // A day without a mapped session still shows the lifetime figure; a negative one is not called savings.
  assert.ok(find(render({ netSavedTokens: null, totalNetSavedTokens: 123456 }).tree, 'dr-token-cube'));
  assert.equal(text(find(render({ totalNetSavedTokens: -123456 }).tree, 'dr-token-cube__face--bili')), 'bili-c净增约 123K tokens');
  // Zero lifetime total falls back to the day value instead of claiming a permanent zero face.
  assert.equal(find(render({ netSavedTokens: null, totalNetSavedTokens: 0 }).tree, 'dr-token-cube'), undefined);
});

test('missing plugin and invalid savings preserve static usage without a blank face', () => {
  for (const bili of [undefined, null, {}, { reclaimedTokens: 123456 }, ...[null, undefined, NaN, Infinity, -Infinity, '10000', {}, []].map((netSavedTokens) => ({ netSavedTokens }))]) {
    const { tree } = render(bili);
    assert.equal(find(tree, 'dr-token-cube'), undefined);
    assert.equal(text(find(tree, 'ddr-usage')), '6822 万 tokens▲ +12%');
    assert.doesNotMatch(text(tree), /bili-c|undefined|NaN|Infinity/);
    const usage = find(tree, 'ddr-usage');
    assert.equal(usage.props.title, undefined, 'static usage carries no hover tooltip either');
    if (!bili) assert.match(usage.props['aria-label'], /6822 万 tokens，与前一天相比 ▲ \+12%，估算花费约 ¥19\.58/);
  }
});

test('zero and negative day savings never claim positive or negative savings', () => {
  for (const netSavedTokens of [0, -0, -125000]) {
    const { tree } = render({ netSavedTokens });
    assert.equal(find(tree, 'dr-token-cube'), undefined);
    assert.doesNotMatch(text(tree), /bili-c|净增|节省/);
    assert.equal(find(tree, 'ddr-usage').props.title, undefined);
  }
});

test('lifetime figures borrow the bili-c panel notation so both screens read the same', () => {
  const { formatBiliPanelTokens } = harness();
  for (const [n, expected] of [[0, '0'], [999, '999'], [1000, '1.0K'], [12345, '12K'], [123456, '123K'], [1234567, '1.2M'], [355986284.330144, '356.0M'], [1234567890, '1.23B'], [NaN, ''], [-5, '']]) {
    assert.equal(formatBiliPanelTokens(n), expected, String(n));
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
  assert.match(cube.props['aria-label'], /6822 万 tokens，与前一天相比 ▲ \+12%，估算花费约 ¥19\.58；bili-c当天净省 12\.3万 tokens/);
  assert.equal(find(cube, 'dr-token-cube__rotor').props['aria-hidden'], true);
  assert.equal(cube.props.tabIndex, undefined, 'noninteractive metric adds no keyboard stop');
  assert.equal(typeof cube.props.onClick, 'function', 'click advances the rotation');
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

test('clicking the cuboid seeks to the next turn instead of unwinding the cube', () => {
  const { advanceTokenCube } = harness();
  const animation = { currentTime: 0, effect: { getTiming: () => ({ delay: 0 }) } };
  const rotor = { getAnimations: () => [animation] };
  const click = () => advanceTokenCube({ currentTarget: { querySelector: () => rotor } });
  click();
  assert.equal(animation.currentTime, 2400, 'mid-hold click jumps to the coming turn');
  animation.currentTime = 2600;
  click();
  assert.equal(animation.currentTime, 2600, 'a turn already in flight is allowed to finish');
  animation.currentTime = 2400;
  click();
  assert.equal(animation.currentTime, 2400, 'the very start of a turn is in flight too');
  animation.currentTime = 8000;
  click();
  assert.equal(animation.currentTime, 8400, 'still inside the 2.4s hold, so the coming turn starts at 8.4s');
  animation.currentTime = 8500;
  click();
  assert.equal(animation.currentTime, 8500, 'already turning, so the click does not skip a face');
  // 告警胶囊用负延迟错开半个台阶：负延迟不计入 currentTime，必须换算成本地时间再找台阶，
  // 否则会 seek 到某面的停留段，看起来像“文字瞬间变了、没有轮转特效”。
  const delayed = { currentTime: 0, effect: { getTiming: () => ({ delay: -1500 }) } };
  advanceTokenCube({ currentTarget: { querySelector: () => ({ getAnimations: () => [delayed] }) } });
  assert.equal(delayed.currentTime, 900, 'offset animation still lands on the local turn start (900 + 1500 = 2400)');
  [undefined, {}, { currentTarget: {} }, { currentTarget: { querySelector: () => null } }, { currentTarget: { querySelector: () => ({ getAnimations: () => [] }) } }].forEach((event) => {
    assert.doesNotThrow(() => advanceTokenCube(event), 'paused/hidden/reduced-motion cubes ignore clicks');
  });
  assert.match(source, /const CUBE_STEP_MS = 3000;/);
  assert.match(source, /const CUBE_HOLD_MS = 2400;/);
});

test('multiple alerts share one cuboid so the row still fits', () => {
  const alerts = ['连续 1h49m 未休息', '23:25 仍在工作'];
  const { tree } = render({ netSavedTokens: 123456 }, { alerts });
  const cube = find(tree, 'dr-alert-cube');
  assert.ok(cube, 'two alerts collapse into one rotating pill');
  assert.equal(cube.props.role, 'group');
  assert.equal(cube.props['aria-label'], alerts.join('；'));
  assert.equal(cube.props.title, undefined, 'no hover tooltip on the alert cuboid');
  assert.equal(typeof cube.props.onClick, 'function');
  assert.equal(find(tree, 'ddr-alert'), undefined, 'the per-alert pills are replaced, not duplicated');
  const faces = nodes(cube).filter((node) => (node.props.className || '').split(' ').includes('dr-alert-cube__face'));
  assert.deepEqual(faces.map(text), ['⚠ ' + alerts[0], '⚠ ' + alerts[1], '⚠ ' + alerts[0], '⚠ ' + alerts[1]],
    'four faces repeat the two alerts so the lap can keep turning upward');
  assert.deepEqual(faces.map((node) => node.props.className.includes('is-duplicate')), [false, false, true, true],
    'repeated faces are flagged so the static fallback shows each alert once');
  // A single alert keeps the plain pill: no cuboid for a one-item rotation.
  const single = render({ netSavedTokens: 123456 }).tree;
  assert.equal(find(single, 'dr-alert-cube'), undefined);
  assert.equal(text(find(single, 'ddr-alert')), '⚠ 连续 1h 未休息');
});

test('cube CSS steps 90° upward every 3s and drops hover/focus freezing', () => {
  assert.match(css, /\.dr-token-cube\{[^}]*max-width:100%[^}]*perspective:280px[^}]*overflow:hidden[^}]*cursor:pointer/);
  assert.match(css, /\.dr-token-cube__rotor\{[^}]*display:grid[^}]*grid-template-columns:minmax\(0,1fr\)[^}]*transform-style:preserve-3d[^}]*animation:dr-token-cube-turn 12s/);
  assert.match(css, /\.dr-token-cube__rotor\{[^}]*transform:translateZ\(-9px\) rotateX\(0deg\);animation:dr-token-cube-turn/);
  assert.match(css, /\.dr-token-cube__face\{[^}]*grid-area:1\/1[^}]*text-overflow:ellipsis[^}]*backface-visibility:hidden/);
  for (const face of ['usage', 'usage-back', 'bili', 'bili-back']) {
    assert.match(css, new RegExp('\\.dr-token-cube__face--' + face + '\\{transform:[^}]*translateZ\\(9px\\)'), face + ' must sit on its own face of the cuboid');
  }
  assert.match(css, /\.dr-token-cube__face--usage-back\{transform:rotateX\(-180deg\)/);
  assert.match(css, /\.dr-token-cube__face--bili\{transform:rotateX\(-90deg\)/);
  assert.match(css, /\.dr-token-cube__face--bili-back\{transform:rotateX\(-270deg\)/);
  // One continuous 0→360° lap: 3s per step (2.4s hold + .6s turn), never back down.
  const frames = css.match(/@keyframes dr-token-cube-turn\{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(frames, /0%,20%\{transform:translateZ\(-9px\) rotateX\(0deg\)\}/);
  assert.match(frames, /25%,45%\{transform:translateZ\(-9px\) rotateX\(90deg\)\}/);
  assert.match(frames, /50%,70%\{transform:translateZ\(-9px\) rotateX\(180deg\)\}/);
  assert.match(frames, /75%,95%\{transform:translateZ\(-9px\) rotateX\(270deg\)\}/);
  assert.match(frames, /100%\{transform:translateZ\(-9px\) rotateX\(360deg\)\}/);
  assert.doesNotMatch(frames, /rotateX\(-90deg\)/, 'the lap must not reverse direction');
  // Pause/hidden still reset the face; hover and card focus no longer hijack the cube.
  assert.match(css, /@media \(prefers-reduced-motion:no-preference\)\{\s*\.dr-token-cube\[data-hidden=true\] \.dr-token-cube__rotor,\.dr-token-cube\[data-paused=true\] \.dr-token-cube__rotor\{animation:none;transform:translateZ\(-9px\) rotateX\(0deg\)\}/);
  assert.doesNotMatch(css, /\.ddr-card:focus-within \.dr-token-cube__rotor/);
  assert.doesNotMatch(css, /\.dr-token-cube:hover/);
  assert.doesNotMatch(css, /\.dr-token-cube[^}]*animation-play-state:paused/, 'pause must not freeze a half-turned cuboid');
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\s*\.dr-token-cube\{cursor:default\}\s*\.dr-token-cube__rotor\{display:flex;align-items:center;gap:4px;animation:none;transform:none;transform-style:flat\}/);
  assert.match(css, /\.dr-token-cube__face--usage-back,\.dr-token-cube__face--bili-back\{display:none\}/);
  // Alert pills ride the same lap, offset half a step so the two cuboids never flip together.
  assert.match(css, /\.dr-alert-cube\{[^}]*--ddr-alert-fill:color-mix[^}]*height:20px[^}]*border-radius:999px[^}]*perspective:280px[^}]*cursor:pointer/);
  assert.match(css, /\.dr-alert-cube\{[^}]*flex:0 0 auto[^}]*box-sizing:border-box/,
    'the pill keeps one width instead of being squeezed by the flex row');
  assert.match(css, /\.dr-alert-cube__rotor\{[^}]*animation:dr-token-cube-turn 12s cubic-bezier\(\.4,0,\.2,1\) infinite;animation-delay:-1\.5s/);
  assert.match(css, /\.dr-alert-cube__face\{[^}]*backface-visibility:hidden[^}]*background:var\(--ddr-alert-fill\)/,
    'faces reuse the pill fill so the orange rectangle itself never appears to rotate');
  for (const rule of css.matchAll(/\.dr-alert-cube__face\{display:inline-block[^}]*\}/g)) {
    assert.match(rule[0], /background:var\(--ddr-alert-fill\)/,
      'static fallbacks keep the same fill as the rotating pill');
  }
  const alertFaces = ['.dr-alert-cube__face--0{transform:translateZ(9px)}', '.dr-alert-cube__face--1{transform:rotateX(-90deg) translateZ(9px)}', '.dr-alert-cube__face--2{transform:rotateX(-180deg) translateZ(9px)}', '.dr-alert-cube__face--3{transform:rotateX(-270deg) translateZ(9px)}'];
  for (const rule of alertFaces) assert.ok(css.includes(rule), rule);
  assert.equal(css.split('.dr-alert-cube__face.is-duplicate{display:none}').length - 1, 2,
    'both static fallbacks (reduced motion, no preserve-3d) hide the repeated faces');
});
