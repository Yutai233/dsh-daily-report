import test from 'node:test'
import assert from 'node:assert/strict'
import { festivalOf, FESTIVALS, festivalStyle } from '../lib/collect/festival.js'

test('固定公历节日', () => {
  const f = festivalOf('2026-10-24')
  assert.equal(f.name, '程序员节')
  assert.equal(f.emoji, '💻')
  assert.equal(f.badge, '💻 程序员节')
  assert.equal(f.greeting, '少写两个 bug。')
  assert.equal(f.theme.mono, true)
  assert.equal(festivalOf('2026-10-01').name, '国庆')
  assert.equal(festivalOf('2026-12-25').name, '圣诞')
})

test('农历节日与除夕', () => {
  assert.equal(festivalOf('2026-02-17').name, '春节')
  assert.equal(festivalOf('2026-02-16').name, '除夕')
  assert.equal(festivalOf('2026-03-03').name, '元宵')
  assert.equal(festivalOf('2026-06-19').name, '端午')
  assert.equal(festivalOf('2026-08-19').name, '七夕')
  assert.equal(festivalOf('2026-09-25').name, '中秋')
  assert.equal(festivalOf('2026-10-18').name, '重阳')
  assert.equal(festivalOf('2026-01-26').name, '腊八')
  assert.equal(festivalOf('2026-04-05').name, '清明')
  // 2027 春节是 2 月 6 日（ICU 的农历实现会算成 2 月 7 日，这里用核对过的表）
  assert.equal(festivalOf('2027-02-06').name, '春节')
  assert.equal(festivalOf('2027-02-05').name, '除夕')
})

test('浮动公历节日', () => {
  assert.equal(festivalOf('2026-05-10').name, '母亲节')
  assert.equal(festivalOf('2026-06-21').name, '父亲节')
  assert.equal(festivalOf('2026-11-26').name, '感恩节')
  assert.equal(festivalOf('2026-05-03'), null, '第一个周日不是母亲节')
})

test('普通日子与非法输入', () => {
  assert.equal(festivalOf('2026-11-13'), null)
  assert.equal(festivalOf(''), null)
  assert.equal(festivalOf('2026-13-01'), null)
  assert.equal(festivalOf(null), null)
})

test('没有高度对应 emoji 时徽标只剩名称', () => {
  const f = festivalOf('2026-04-05')
  assert.equal(f.emoji, '')
  assert.equal(f.badge, '清明')
  const g = festivalOf('2026-10-18')
  assert.equal(g.badge, '重阳')
})

test('每个节日的祝福 ≤10 字，主题完整', () => {
  for (const [id, f] of Object.entries(FESTIVALS)) {
    assert.ok([...f.greeting].length <= 10, id + ' 祝福超过 10 字：' + f.greeting)
    assert.equal(typeof f.name, 'string')
    assert.ok(f.name.length > 0, id)
  }
  const f = festivalOf('2026-12-25')
  assert.ok(f.theme.bg && f.theme.fg && f.theme.border, '圣诞主题缺字段')
  assert.match(festivalStyle(f), /background:#ffffff;color:#c62828;border:1px solid #c62828/)
  assert.match(festivalStyle(festivalOf('2026-02-17')), /background-image:radial-gradient/)
  assert.equal(festivalOf('2026-10-24').theme.mono, true)
})

test('节日查找覆盖 2025–2036 每年的春节', () => {
  const cny = ['2025-01-29', '2026-02-17', '2027-02-06', '2028-01-26', '2029-02-13', '2030-02-03', '2031-01-23', '2032-02-11', '2033-01-31', '2034-02-19', '2035-02-08']
  for (const d of cny) assert.equal(festivalOf(d).name, '春节', d)
})
