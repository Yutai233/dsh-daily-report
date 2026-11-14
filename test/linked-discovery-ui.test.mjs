import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { renderHtml } from '../lib/render/html.js';
import { renderMarkdown } from '../lib/render/markdown.js';

const source = readFileSync(new URL('../client/client-source.js', import.meta.url), 'utf8');
const clientCss = readFileSync(new URL('../client/ui.css', import.meta.url), 'utf8');
const body = '上下文压缩后缓存命中回落，可核对压缩时点与重读记录。';
const available = { netSavedTokens: 0, status: 'warning' };

// Follow client-ui.test.mjs: inspect React element data only, never fake a browser or visual renderer.
function cardTree(layer1) {
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
    Fragment: 'fragment', useEffect() {}, useLayoutEffect() {},
    useRef: () => ({ current: null }), useCallback: (fn) => fn,
    useSyncExternalStore: (_, get) => get(),
  };
  const boundary = source.lastIndexOf('return {\n  inject:');
  assert.ok(boundary > 0, 'client registration boundary must exist');
  const MorningCard = vm.runInNewContext('(function(require) {\n' + source.slice(0, boundary) + '\nreturn MorningCard;\n})', { document: { body: {} } })(
    (name) => name === 'react' ? React : name === 'react-dom' ? { createPortal: (x) => x } : {},
  );
  const snap = { state: { config: {}, card: { key: '2026-11-13', label: '11月13日', layer1 } } };
  return MorningCard({ store: { get: () => snap, subscribe() {} }, anchorRef: { current: null }, onClose() {} });
}
function nodes(root) { return root && typeof root === 'object' ? [root, ...root.children.flatMap(nodes)] : []; }
function content(root) { return root && typeof root === 'object' ? root.children.map(content).join('') : String(root ?? ''); }
function report(layer1) {
  return { kind: 'daily', key: '2026-11-13', label: '11月13日', generatedAt: '2026-11-14T03:00:00Z', layer1, sections: {}, appendix: {} };
}
function surfaces(layer1) {
  const tree = cardTree(layer1);
  return {
    tree,
    discovery: nodes(tree).find((node) => node.props.className === 'ddr-discovery'),
    html: renderHtml(report(layer1)),
    md: renderMarkdown(report(layer1)),
  };
}

test('linked discovery needs strict model selection and available bili; zero savings does not disable it', () => {
  for (const bili of [available, {}]) {
    const layer1 = { discovery: body, discoveryLinked: true, bili };
    const before = structuredClone(layer1);
    const { discovery, html, md } = surfaces(layer1);
    assert.ok(discovery);
    assert.equal(discovery.children[1], body);
    const badge = discovery.children[2];
    assert.equal(badge.type, 'span');
    assert.equal(badge.props.className, 'ddr-discovery-linked');
    assert.equal(content(badge), '插件联动');
    assert.equal(content(discovery), '每日发现：' + body + '插件联动');
    assert.equal(nodes(discovery).filter((node) => node.type === 'span').length, 1);
    assert.ok(nodes(discovery).every((node) => node.type !== 'button' && node.type !== 'br'));
    assert.equal(badge.props.onClick, undefined);
    assert.equal(badge.props.role, undefined);
    assert.ok(html.includes('<p><b>每日发现：</b>' + body + '<span class="discovery-linked">插件联动</span></p>'));
    assert.equal((html.match(/<span class="discovery-linked">/g) || []).length, 1);
    assert.ok(md.includes('**每日发现：**' + body + '（插件联动）\n'));
    assert.deepEqual(layer1, before, 'renderers must not alter the report contract');
  }
});

test('ordinary false and legacy discoveries remain visible without any linkage marker', () => {
  for (const fields of [{}, { discoveryLinked: false }, { discoveryLinked: null }, { discoveryLinked: 'true' }, { discoveryLinked: 1 }]) {
    for (const bili of [undefined, null, available]) {
      const { discovery, html, md } = surfaces({ discovery: body, bili, ...fields });
      assert.ok(discovery);
      assert.equal(content(discovery), '每日发现：' + body);
      assert.ok(!nodes(discovery).some((node) => node.props.className === 'ddr-discovery-linked'));
      assert.ok(html.includes('<p><b>每日发现：</b>' + body + '</p>'));
      assert.doesNotMatch(html, /插件联动|<span class="discovery-linked"/);
      assert.ok(md.includes('**每日发现：**' + body + '\n'));
      assert.doesNotMatch(md, /插件联动/);
    }
  }
});

test('unavailable plugins hide the entire previously linked discovery across all surfaces', () => {
  for (const fields of [{}, { bili: null }, { bili: undefined }]) {
    const { tree, discovery, html, md } = surfaces({ discovery: body, discoveryLinked: true, ...fields });
    assert.equal(discovery, undefined);
    assert.ok(!content(tree).includes(body));
    assert.doesNotMatch(content(tree), /每日发现|插件联动/);
    assert.doesNotMatch(html, /<aside class="discovery"|插件联动/);
    assert.ok(!html.includes(body));
    assert.doesNotMatch(md, /每日发现|插件联动/);
    assert.ok(!md.includes(body));
  }
});

test('missing, empty, whitespace and nonstring bodies show the placeholder and never an orphan marker', () => {
  for (const discovery of [undefined, null, '', '  ', '\n\t', 0, {}, []]) {
    for (const discoveryLinked of [true, false, undefined]) {
      const result = surfaces({ discovery, discoveryLinked, bili: available });
      assert.ok(result.discovery);
      assert.match(content(result.tree), /每日发现：当天没有什么发现喵~/);
      assert.doesNotMatch(content(result.tree), /插件联动/);
      assert.match(result.html, /<aside class="discovery" aria-label="每日发现"><p><b>每日发现：<\/b>当天没有什么发现喵~<\/p><\/aside>/);
      assert.doesNotMatch(result.html, /插件联动/);
      assert.match(result.md, /^\*\*每日发现：\*\*当天没有什么发现喵~$/m);
      assert.doesNotMatch(result.md, /插件联动/);
    }
  }
});

test('linked discovery content is React text and escaped in HTML and Markdown', () => {
  const discovery = '<script>"x" & *重读* [记录]</script>';
  const result = surfaces({ discovery, discoveryLinked: true, bili: available });
  assert.equal(result.discovery.children[1], discovery);
  assert.ok(nodes(result.discovery).every((node) => !['script', 'img'].includes(node.type)));
  assert.ok(nodes(result.discovery).every((node) => !Object.hasOwn(node.props, 'dangerouslySetInnerHTML')));
  assert.ok(result.html.includes('&lt;script&gt;&quot;x&quot; &amp; *重读* [记录]&lt;/script&gt;<span class="discovery-linked">'));
  assert.doesNotMatch(result.html, /<script/);
  assert.ok(result.md.includes(String.raw`&lt;script&gt;"x" &amp; \*重读\* \[记录\]&lt;/script&gt;（插件联动）`));
  assert.doesNotMatch(result.md, /<script/);
});

test('a sixty-character body stays unchanged and the marker remains outside its text budget', () => {
  const discovery = '发'.repeat(60);
  const result = surfaces({ discovery, discoveryLinked: true, bili: available });
  assert.equal(result.discovery.children[1].length, 60);
  assert.equal(result.discovery.children[1], discovery);
  assert.ok(result.html.includes(discovery + '<span class="discovery-linked">'));
  assert.ok(result.md.includes(discovery + '（插件联动）'));
});

test('linkage badges use lightweight transparent theme-token styling without interaction or motion', () => {
  const html = renderHtml(report({}));
  const rules = [
    clientCss.match(/\.ddr-discovery-linked\{([^}]+)\}/)?.[1],
    html.match(/\.discovery-linked\{([^}]+)\}/)?.[1],
  ];
  for (const rule of rules) {
    assert.ok(rule);
    assert.match(rule, /display:inline-block/);
    assert.match(rule, /margin-left:6px/);
    assert.match(rule, /padding:0 5px/);
    assert.match(rule, /border-radius:4px/);
    assert.match(rule, /background:color-mix\(in srgb,var\(--(?:dsw-alias-brand-primary|blue)/);
    assert.match(rule, /12%,transparent\)/);
    assert.match(rule, /font-size:1[01]px/);
    assert.match(rule, /white-space:nowrap/);
    assert.doesNotMatch(rule, /#[0-9a-f]|rgba?\(|cursor:|animation:|transition:|box-shadow:|border:/i);
  }
  assert.match(clientCss, /\.ddr-discovery-linked\{[^}]*var\(--dsw-alias-brand-primary-new-colorprimary-new-color,var\(--dsw-alias-brand-primary\)\)/);
  assert.match(html, /--blue:var\(--dsw-alias-brand-primary-new-colorprimary-new-color,/);
});
