// Regression check: preserve the original immediate hover swim, without fades.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../client/client-source.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../client/ui.css', import.meta.url), 'utf8');
const React = {
  createElement: (type, props, ...children) => ({ type, props, children: children.flat().filter(Boolean) }),
  useState() { throw new Error('The original whale must not retain fading state'); },
  useEffect() { throw new Error('The original whale must not defer stopping'); },
};
const P = { FISH_LOGO_PATH: 'M0 0L10 0L10 10Z', FISH_LOGO_VIEWBOX: { width: 24, height: 18 } };
const Hero = new Function('require', 'HERO_SWIM_UP_PATH', 'HERO_SWIM_DOWN_PATH', source.slice(0, source.lastIndexOf('return {\n  inject:')) + '\nreturn HeroFishSvg;')((name) => name === 'react' ? React : name === 'react-dom' ? {} : P, 'up', 'down');
const walk = (n) => [n, ...n.children.flatMap(walk)];
for (const hovering of [false, true, false, true, false]) {
  const tree = Hero({ size: 34, hovering });
  assert.equal(tree.children.length, 1, 'one unchanged whale silhouette');
  assert.equal(walk(tree).filter((n) => n.type === 'animate').length, hovering ? 1 : 0);
  assert.equal(tree.children[0].props.style, undefined, 'no opacity crossfade');
}
assert.doesNotMatch(css, /ddr-fish-rest|ddr-fish-swim/);
console.log('PASS original whale hover: starts immediately, stops immediately, one silhouette and no fade state');
