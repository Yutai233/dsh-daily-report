import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeConfig } from '../lib/config.js';

const source = readFileSync(new URL('../client/client-source.js', import.meta.url), 'utf8');
function harness() {
  let slots = [], cursor = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
    Fragment: 'fragment', useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], (v) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useEffect() {}, useLayoutEffect() {}, useRef: () => ({ current: null }), useCallback: (f) => f,
    useSyncExternalStore: (_, get) => get(),
  };
  const api = new Function('require', source.slice(0, source.lastIndexOf('return {\n  inject:')) + '\nreturn { makeStore, NumberInput, ReportDirectory, SettingsSection, MorningCard, Viewer, Seg, reportFrameHtml, bindReportSessionBridge, reportSessionIds };')((name) => name === 'react' ? React : name === 'react-dom' ? { createPortal: (x) => x } : {});
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

test('morning card merges weather into the date row and drops the duplicated weather date', () => {
  global.document = { body: {} };
  const { api, render } = harness();
  const weather = { date: '2026-11-13', label: '天气 11-13', text: '天气 11-13 · ☁ 12~18°C 阵雨 · 南京', tip: '记得带伞' };
  const card = { key: '2026-11-13', label: '11月13日 周五', layer1: { headline: '9 个会话 · 580 次工具 · 6822 万 tokens', host: 'dsh 12:45 启动，在线 8h51m（启动 4 次）', weather } };
  const tree = render(api.MorningCard, { store: mockStore({ config: {}, card }), anchorRef: { current: null }, onClose() {} });
  const title = text(nodes(tree).find((n) => n.props.className === 'ddr-title'));
  assert.match(title, /11月13日 周五/);
  assert.match(title, /☁ 12~18°C 阵雨 · 南京/);
  assert.match(title, /记得带伞/);
  assert.doesNotMatch(title, /天气 11-13/);
  assert.ok(!nodes(tree).some((n) => n.props.className === 'ddr-line' && text(n).includes('阵雨')), 'weather must not keep its own body line');
  assert.doesNotMatch(text(tree), /dsh 12:45 启动/, 'card drops the dsh uptime line');
  // 天气日期与报告日期不是同一天时，保留天气日期，避免丢掉"这份天气属于哪天"。
  card.layer1 = { headline: '合成数据', weather: { date: '2026-11-12', label: '天气 11-12', text: '晴' } };
  const other = text(nodes(render(api.MorningCard, { store: mockStore({ config: {}, card }), anchorRef: { current: null }, onClose() {} })).find((n) => n.props.className === 'ddr-title'));
  assert.match(other, /11月13日 周五/);
  assert.match(other, /天气 11-12 ·\s*晴/);
});

test('morning card puts tokens beside the alert pill and shows the report generation cost', () => {
  global.document = { body: {} };
  const { api, render } = harness();
  const state = (gen, usage) => ({
    config: {},
    card: {
      key: '2026-11-13', label: '11月13日 周五', gen,
      layer1: { headline: '9 个会话 · 580 次工具 · 6822 万 tokens（约 ¥19.58）', usage, alerts: ['连续用机 1h07m 未休息'], oneLiner: '一句话' },
      usage: { rows: [{ label: 'Tokens', value: '6822 万', delta: '+5%', trend: 'up' }], spark: [1, 2, 3] },
    },
  });
  const usage = { sessions: 9, toolCalls: 580, tokens: '6822 万', cost: '¥19.58', trend: 'up', delta: '+12%' };
  const tree = render(api.MorningCard, { store: mockStore(state({ calls: 11, tokens: '12.3 万', cny: '¥0.12', estimated: false }, usage)), anchorRef: { current: null }, onClose() {} });
  const row = nodes(tree).find((n) => n.props.className === 'ddr-alerts');
  assert.ok(row, 'usage shares the alert row');
  assert.match(text(row), /连续用机 1h07m 未休息/);
  assert.match(text(row), /6822 万 tokens/);
  assert.match(text(row), /▲ \+12%/);
  assert.match(text(row), /（约 ¥19\.58）/);
  assert.doesNotMatch(text(tree), /9 个会话/, 'card keeps only tokens and cost of the usage line');
  assert.doesNotMatch(text(tree), /580 次工具/);
  assert.match(text(tree), /生成 12\.3 万 tokens（¥0\.12）/);
  assert.ok(!nodes(tree).some((n) => n.props.className === 'ddr-spark'), 'the usage figure no longer carries the spark bars');

  // Provider reported no usage → the estimate is labelled.
  const estimated = render(api.MorningCard, { store: mockStore(state({ calls: 3, tokens: '4.1 万', cny: '<¥0.01', estimated: true }, usage)), anchorRef: { current: null }, onClose() {} });
  assert.match(text(estimated), /生成约 4\.1 万 tokens（<¥0\.01）/);

  // Reports written before 0.3.4 have no structured usage/gen: rows fallback, no trend marker.
  const legacy = nodes(render(api.MorningCard, { store: mockStore(state(null, null)), anchorRef: { current: null }, onClose() {} })).find((n) => n.props.className === 'ddr-alerts');
  assert.match(text(legacy), /6822 万 tokens/);
  assert.doesNotMatch(text(legacy), /▲|▼/);
  assert.doesNotMatch(text(legacy), /生成/);
});

test('morning card retains all six carry-over items and has a keyboard scroll region', () => {
  global.document = { body: {} };
  const { api, render } = harness();
  const carryOver = Array.from({ length: 6 }, (_, i) => ({ kind: 'todo', text: '待办正文 ' + (i + 1), title: '来源会话 ' + (i + 1) }));
  const card = { key: '2026-11-12', label: '11月12日', layer1: { carryOverCount: 4, oneLiner: '保留完整摘要。'.repeat(20) }, carryOver, mainline: [{ title: '旧版主线不应出现' }] };
  const store = mockStore({ config: {}, card });
  const tree = render(api.MorningCard, { store, anchorRef: { current: null }, onClose() {} });
  assert.match(text(tree), /明日待续 · 6/);
  assert.ok(text(tree).includes(card.layer1.oneLiner));
  for (const item of carryOver) { assert.ok(text(tree).includes(item.text)); assert.ok(!text(tree).includes(item.title), '来源会话标题不再显示在待办下面'); }
  assert.doesNotMatch(text(tree), /旧版主线/);
  assert.equal(nodes(tree).find(n => n.props.className === 'ddr-card-scroll').props.tabIndex, 0);
  card.carryOver = [];
  const empty = render(api.MorningCard, { store, anchorRef: { current: null }, onClose() {} });
  assert.doesNotMatch(text(empty), /旧版主线/);
});

test('festival day swaps the carry-over title for a themed pill and keeps the list', () => {
  global.document = { body: {} };
  const { api, render } = harness();
  const theme = { bg: '#ffffff', fg: '#c62828', border: '#c62828', deco: 'repeating-linear-gradient(135deg, rgba(198,40,40,.16) 0 4px, transparent 4px 10px)' };
  const festival = { id: 'xmas', name: '圣诞', emoji: '🎄', greeting: '圣诞快乐，早点歇。', badge: '🎄 圣诞', theme };
  const card = { key: '2026-12-25', label: '12月25日 周五', layer1: { carryOverCount: 2, festival }, carryOver: [{ kind: 'todo', text: '写测试' }] };
  const state = { config: {}, card };
  const tree = render(api.MorningCard, { store: mockStore(state), anchorRef: { current: null }, onClose() {} });
  assert.match(text(tree), /🎄 圣诞/);
  assert.match(text(tree), /圣诞快乐，早点歇。/);
  assert.doesNotMatch(text(tree), /明日待续/);
  const pill = nodes(tree).find((n) => n.props.className === 'ddr-fest');
  assert.ok(pill, 'the themed pill is rendered');
  assert.equal(pill.props.style.background, '#ffffff');
  assert.equal(pill.props.style.color, '#c62828');
  assert.equal(pill.props.style.borderColor, '#c62828');
  assert.match(pill.props.style.backgroundImage, /repeating-linear-gradient/);
  assert.ok(text(tree).includes('写测试'), 'carry-over list survives the swap');
  // 节日当天没有待续时，胶囊也单独出现
  card.carryOver = [];
  assert.match(text(render(api.MorningCard, { store: mockStore(state), anchorRef: { current: null }, onClose() {} })), /🎄 圣诞/);
  // 无节日 / 关掉开关 → 回退「明日待续 · N」
  card.layer1 = { carryOverCount: 2 };
  card.carryOver = [{ kind: 'todo', text: '写测试' }];
  assert.match(text(render(api.MorningCard, { store: mockStore(state), anchorRef: { current: null }, onClose() {} })), /明日待续 · 1/);
  // 没有高度对应 emoji 的节日
  card.layer1 = { festival: { badge: '清明', greeting: '清明，出去走走。', theme: {} } };
  assert.match(text(render(api.MorningCard, { store: mockStore(state), anchorRef: { current: null }, onClose() {} })), /清明/);
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

test('viewer ignores stale load and error events when reopening the same report', () => {
  global.document = { body: {} };
  const { api, render } = harness();
  const makeProps = (id) => ({ store: mockStore({}, { viewer: { id, title: '同一报告', html: '<h1>每日简报</h1>', key: 'day', kind: 'daily' } }) });
  const oldProps = makeProps(1);
  const oldTree = render(api.Viewer, oldProps);
  const oldFrame = nodes(oldTree).find(n => n.type === 'iframe');
  oldFrame.props.onLoad();
  assert.doesNotMatch(text(render(api.Viewer, oldProps)), /正在载入报告/);
  const newProps = makeProps(2);
  let tree = render(api.Viewer, newProps);
  const newFrame = nodes(tree).find(n => n.type === 'iframe');
  assert.notEqual(oldFrame.props.key, newFrame.props.key);
  assert.match(text(tree), /正在载入报告/);
  oldFrame.props.onError();
  oldFrame.props.onLoad();
  tree = render(api.Viewer, newProps);
  assert.doesNotMatch(text(tree), /视图载入失败/);
  assert.match(text(tree), /正在载入报告/);
  newFrame.props.onLoad();
  tree = render(api.Viewer, newProps);
  assert.doesNotMatch(text(tree), /正在载入报告|视图载入失败/);
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

test('morning card adds inline session buttons only for known sources and conditionally shows discovery', async () => {
  global.document = { body: {} };
  const { api, render } = harness(); const opened = [];
  const card = { layer1: { oneLiner: '今天完成了报告样式。', discovery: '多次手动校验同一组布局，可合并为一个回归脚本。' }, carryOver: [
    { kind: 'todo', text: '补窄屏测试', title: '报告改版', sessionId: 'source-1' },
    { kind: 'interrupted', text: '旧版待续记录' },
  ] };
  const store = mockStore({ config: {}, card }, { openSession: async (id) => opened.push(id) });
  let tree = render(api.MorningCard, { store, anchorRef: {}, onClose() {} });
  const button = nodes(tree).filter(n => n.props.className === 'ddr-session-link');
  assert.equal(button.length, 1); assert.equal(button[0].props.title, '打开会话：报告改版');
  await button[0].props.onClick(); assert.deepEqual(opened, ['source-1']);
  assert.match(text(tree), /每日发现：/);
  assert.ok(text(tree).indexOf(card.layer1.oneLiner) < text(tree).indexOf('每日发现'));
  assert.ok(text(tree).indexOf('每日发现') < text(tree).indexOf('明日待续'));
  const discoveryNode = nodes(tree).filter(n => n.props.className === 'ddr-discovery')[0];
  assert.equal(discoveryNode.children[0].children[0], '每日发现：');
  assert.equal(discoveryNode.children[1], card.layer1.discovery);
  for (const value of [null, undefined, '', '   ']) {
    card.layer1.discovery = value;
    tree = render(api.MorningCard, { store, anchorRef: {}, onClose() {} });
    assert.doesNotMatch(text(tree), /每日发现/);
  }
});

test('native session navigation closes report and card on success, but preserves them on failure', async () => {
  const { api } = harness(); const opened = []; let fail = false;
  const store = api.makeStore({ rpc: {} }, async (id) => { if (fail) throw Error('会话已删除'); opened.push(id); });
  store.showHtml('report', '<h1>Report</h1>'); store.openCard();
  await store.openSession('source-1');
  assert.deepEqual(opened, ['source-1']); assert.equal(store.get().viewer, null); assert.equal(store.get().cardOpen, false);
  store.showHtml('report', '<h1>Report</h1>'); store.openCard(); fail = true;
  await store.openSession('missing');
  assert.match(store.get().error, /无法打开相关会话.*会话已删除/); assert.ok(store.get().viewer); assert.equal(store.get().cardOpen, true);
  const legacy = api.makeStore({ rpc: {} }); await legacy.openSession('source-1');
  assert.match(legacy.get().error, /不支持会话跳转/);
  store.dispose(); legacy.dispose();
});

test('interactive viewer permits only its nonce bridge with source, token, current-view and destination checks', () => {
  global.document = { body: {} };
  const { api, render } = harness(); const opened = []; let listener, removed;
  global.window = { addEventListener: (type, fn) => { assert.equal(type, 'message'); listener = fn; }, removeEventListener: (_, fn) => { removed = fn; } };
  const frame = { contentWindow: {} }; const v = { html: '<h1>Report</h1>', sessionIds: ['source-1'] };
  const store = { get: () => ({ viewer: v }), openSession: (id) => opened.push(id) };
  const dispose = api.bindReportSessionBridge(frame, v, 'random-token', store);
  const data = { type: 'ddr-open-session', token: 'random-token', sessionId: 'source-1' };
  listener({ source: {}, data }); listener({ source: frame.contentWindow, data: { ...data, token: 'wrong' } });
  listener({ source: frame.contentWindow, data: { ...data, sessionId: 'arbitrary' } });
  assert.deepEqual(opened, []);
  listener({ source: frame.contentWindow, data }); assert.deepEqual(opened, ['source-1']);
  store.get = () => ({ viewer: { ...v } }); listener({ source: frame.contentWindow, data }); assert.equal(opened.length, 1);
  dispose(); assert.equal(removed, listener);
  const tree = render(api.Viewer, { store: mockStore({}, { viewer: v }) });
  const iframe = nodes(tree).find(n => n.type === 'iframe');
  assert.equal(iframe.props.sandbox, 'allow-scripts');
  assert.match(iframe.props.srcDoc, /script-src 'nonce-[a-f0-9]{32}'/);
  assert.doesNotMatch(iframe.props.srcDoc, /allow-same-origin|allow-popups|allow-top-navigation/);
  assert.match(iframe.props.srcDoc, /if\(!e.isTrusted\)return/);
  delete global.window;
});
