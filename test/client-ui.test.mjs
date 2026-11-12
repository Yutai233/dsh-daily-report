import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeConfig } from '../lib/config.js';

const source = readFileSync(new URL('../client/client-source.js', import.meta.url), 'utf8');
function harness() {
  let slots = [], cursor = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
    Fragment: 'fragment', useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (v) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useEffect() {}, useLayoutEffect() {}, useRef: () => ({ current: null }), useCallback: (f) => f,
    useSyncExternalStore: (_, get) => get(),
  };
  const api = new Function('require', source.slice(0, source.lastIndexOf('return {\n  inject:')) + '\nreturn { makeStore, NumberInput, ReportDirectory, SettingsSection, MorningCard, Viewer, Seg };')((name) => name === 'react' ? React : name === 'react-dom' ? { createPortal: (x) => x } : {});
  return { api, render(fn, props) { cursor = 0; return fn(props); } };
}
function nodes(root) { return root && typeof root === 'object' ? [root, ...root.children.flatMap(nodes)] : []; }
function text(root) { return root && typeof root === 'object' ? root.children.map(text).join(' ') : String(root ?? ''); }
function mockStore(state, extra = {}) { const snap = { state, ...extra }; return { get: () => snap, subscribe() {}, refresh() {}, call() { return Promise.resolve({}); }, ...extra }; }

test('report empty, RPC and open failures remain visible after successful polling', async () => {
  const { api } = harness();
  let mode = 'empty';
  const store = api.makeStore({ rpc: { async call(_, route) {
    if (route.endsWith('/state')) return { ok: true, value: { config: {}, dataBytes: null } };
    if (mode === 'rpc') return { ok: false, error: { message: 'owner only' } };
    if (route.endsWith('/open')) throw Error('browser unavailable');
    return { ok: true, value: { html: '  ' } };
  } } });
  await store.view('daily', '2026-11-10');
  assert.match(store.get().error, /内容为空/);
  assert.equal(store.get().viewer, null);
  await store.refresh();
  assert.match(store.get().error, /内容为空/);
  mode = 'rpc';
  await store.view('daily', '2026-11-10');
  assert.match(store.get().error, /owner only/);
  mode = 'empty';
  await store.open('daily', '2026-11-10');
  assert.match(store.get().error, /browser unavailable/);
  store.showHtml('empty', '', 'daily', 'key');
  assert.equal(store.get().viewer, null);
  store.showHtml('valid', '<h1>sample</h1>', 'daily', 'key');
  assert.equal(store.get().error, null);
  assert.equal(store.get().viewer.title, 'valid');
  store.dispose();
});

test('viewer captures the clicked button before RPC and discards obsolete requests', async () => {
  const { api } = harness(); const pending = [];
  const store = api.makeStore({ rpc: { call: (_base, _route, payload) => new Promise((resolve) => pending.push({ payload, resolve })) } });
  let left = 32;
  const button = { isConnected: true, getBoundingClientRect: () => ({ left, top: 50, width: 100, height: 28 }) };
  const first = store.view('daily', 'one', 'One', button);
  left = 300;
  pending[0].resolve({ ok: true, value: { html: '<h1>One</h1>' } }); await first;
  assert.equal(store.get().viewer.origin.rect.left, 32);
  assert.equal(store.get().viewer.origin.element, button);
  const older = store.view('daily', 'older', 'Older', button);
  const newer = store.view('daily', 'newer', 'Newer', button);
  pending[2].resolve({ ok: true, value: { html: '<h1>Newer</h1>' } }); await newer;
  pending[1].resolve({ ok: true, value: { html: '<h1>Older</h1>' } }); await older;
  assert.equal(store.get().viewer.key, 'newer');
  const cancelled = store.view('daily', 'cancelled', 'Cancelled', button);
  store.closeViewer();
  pending[3].resolve({ ok: true, value: { html: '<h1>Cancelled</h1>' } }); await cancelled;
  assert.equal(store.get().viewer, null);
  store.dispose();
});

test('numeric drafts restore empty input, clamp visibly, round integer fields and skip unchanged commits', () => {
  for (const [draft, expected, commits] of [['', '50', []], ['999', '180', [180]], ['20.8', '21', [21]], ['50', '50', []]]) {
    const { api, render } = harness(); const seen = [];
    const props = { value: 50, min: 20, max: 180, label: '久坐提醒分钟数', onCommit: (v) => seen.push(v) };
    let input = render(api.NumberInput, props);
    input.props.onChange({ target: { value: draft } });
    input = render(api.NumberInput, props); input.props.onBlur();
    input = render(api.NumberInput, props);
    assert.equal(input.props.value, expected); assert.deepEqual(seen, commits);
    assert.equal(input.props['aria-label'], props.label);
  }
  const { api, render } = harness(); const seen = [];
  const props = { value: 1, min: 0, max: 1000, step: 0.1, onCommit: (v) => seen.push(v) };
  render(api.NumberInput, props).props.onChange({ target: { value: '0.07' } });
  render(api.NumberInput, props).props.onBlur(); assert.deepEqual(seen, [0.07]);
});

test('settings show available, unavailable and legacy tool diagnostics without config writes', () => {
  for (const [toolAvailable, expected] of [[true, '已注册'], [false, '未注册'], [undefined, '未返回工具状态']]) {
    const { api, render } = harness();
    const state = { config: normalizeConfig({ privacy: 'local-only' }), toolAvailable, platform: 'win32', idle: {}, reports: {}, dataDir: 'C:/synthetic/' + 'long/'.repeat(30) };
    const tree = render(api.SettingsSection, { store: mockStore(state) });
    const row = nodes(tree).find((n) => n.props.title === 'Agent 工具状态');
    assert.match(row.props.desc, new RegExp(expected));
    const numeric = nodes(tree).filter((n) => n.type === api.NumberInput);
    assert.ok(numeric.filter((n) => n.props.label).length >= 4);
  }
});

test('morning card labels fallback and weather date separately from report date', () => {
  global.document = { body: {} };
  const { api, render } = harness();
  const state = { config: {}, card: { key: '2026-11-10', label: '11月10日', fallbackNote: '11-11 无活动，显示 11-10', layer1: { headline: '合成数据', weather: { date: '2026-11-12', label: '今日天气 11-12', text: '晴' } } } };
  const tree = render(api.MorningCard, { store: mockStore(state), anchorRef: { current: null }, onClose() {} });
  assert.match(text(tree), /11-11 无活动，显示 11-10/);
  assert.match(text(tree), /今日天气 11-12/);
  assert.match(text(tree), /11月10日/);
});

test('report directory form edits only reportsDir and supports restoring default', async () => {
  const { api, render } = harness(); const patches = [];
  const props = { store: { patch: async (p) => { patches.push(p); } }, value: '', actualPath: 'C:/default/reports', defaultPath: 'C:/default/reports' };
  let tree = render(api.ReportDirectory, props);
  const input = nodes(tree).find((n) => n.props['aria-label'] === '报告保存目录');
  input.props.onChange({ target: { value: 'E:/报告 archives' } });
  tree = render(api.ReportDirectory, props);
  await nodes(tree).find((n) => n.type === 'button' && text(n) === '保存目录').props.onClick();
  assert.deepEqual(patches, [{ reportsDir: 'E:/报告 archives' }]);
  assert.match(text(render(api.ReportDirectory, props)), /已保存/);
  await nodes(tree).find((n) => n.type === 'button' && text(n) === '恢复默认目录').props.onClick();
  assert.deepEqual(patches.at(-1), { reportsDir: '' });
});

test('segmented radios use one tab stop and arrow-key selection', () => {
  const { api, render } = harness(); const selected = []; const focused = [];
  const tree = render(api.Seg, { value: 'b', label: 'Synthetic', options: ['a', 'b', 'c'].map((value) => ({ value, label: value })), onChange: (v) => selected.push(v) });
  assert.deepEqual(tree.children.map((n) => n.props.tabIndex), [-1, 0, -1]);
  tree.children[1].props.onKeyDown({ key: 'ArrowRight', preventDefault() {}, currentTarget: { parentElement: { children: [0, 1, 2].map((i) => ({ focus: () => focused.push(i) })) } } });
  assert.deepEqual(selected, ['c']); assert.deepEqual(focused, [2]);
});

test('viewer keeps empty sandbox and denies external resources before report markup', () => {
  global.document = { body: {} };
  const { api, render } = harness();
  const html = '<html><head><meta http-equiv="refresh" content="0; url=https://example.com"></head><body><script>top.pwned=true</script><h1>sample</h1></body></html>';
  const tree = render(api.Viewer, { store: mockStore({}, { viewer: { title: 'synthetic', html, key: 'sample', kind: 'daily' } }) });
  const frame = nodes(tree).find((n) => n.type === 'iframe');
  assert.equal(frame.props.sandbox, ''); assert.equal(frame.props.referrerPolicy, 'no-referrer');
  assert.match(frame.props.srcDoc, /default-src 'none'/);
  assert.ok(frame.props.srcDoc.indexOf('Content-Security-Policy') < frame.props.srcDoc.indexOf('<script>'));
  assert.doesNotMatch(frame.props.srcDoc, /http-equiv="refresh"/);
  assert.ok(nodes(tree).find((n) => n.props['aria-label'] === '关闭报告'));
  frame.props.onError();
  const failed = render(api.Viewer, { store: mockStore({}, { viewer: { title: 'synthetic', html, key: 'sample', kind: 'daily' } }) });
  assert.match(text(failed), /报告视图载入失败/);
});
