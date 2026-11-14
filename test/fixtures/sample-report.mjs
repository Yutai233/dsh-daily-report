/** Complete, deterministic renderer fixtures; paths intentionally use Windows syntax. */
export const sampleDaily = {
  kind: 'daily', label: '11月12日 周四', range: { start: '2026-11-12', end: '2026-11-12' },
  generatedAt: new Date(2026, 10, 12, 18, 30).getTime(), language: 'zh', summaryMode: 'local-only',
  layer1: {
    weather: { text: '☁ 9~14°C 小雨 · 上海', tip: '建议带伞' }, host: 'dsh 08:52 启动，在线 6h20m',
    headline: '3 个会话 · 105 次工具 · 84 万 tokens（约 ¥1.20）', oneLiner: '完成插件调研，开始设计日报功能方案。',
    alerts: ['连续 2h10m 未休息', '23:40 仍在工作'], carryOverCount: 2,
  },
  sections: {
    mainline: [{ time: '09:12', title: '每日简报 | 设计', summary: '完成架构设计\n实现离线报告 <安全>。', sessionId: 'session-demo', source: 'template' }],
    usage: {
      rows: [{ label: 'Tokens', value: '84 万', delta: '+23%', trend: 'up' }, { label: '估算花费', value: '¥1.20', delta: '-12%', trend: 'down' }, { label: '会话', value: '3', delta: '0%', trend: 'flat' }, { label: '工具调用', value: '105', delta: null, trend: null }],
      baselineDays: 6, cacheHitRate: '62%', peakShare: '60%', tips: ['可将批处理安排在谷时。'], priciest: '每日简报设计 第 3 轮 ¥0.31',
      budget: { label: '每日预算', used: '¥1.20', limit: '¥2.00', ratio: .6, over: false },
      spark: [120000, 420000, 200000, 680000, 610000, 300000, 840000].map((value, i) => ({ date: `11-${String(i + 6).padStart(2, '0')}`, value })),
    },
    tools: {
      top: 'pwsh×38  read×21', latency: 'pwsh p50 4.2s / p90 61s', commands: 'git 12 · node 15',
      hotFiles: 'E:\\work\\demo\\src\\index.js ×9 · E:\\work\\demo\\README.md ×4', domains: 'github.com ×5',
      approvals: '2 次，合计 1.5s', speed: '42 tok/s · 首字 1.8s',
      deliverables: [{ path: 'E:\\work\\demo\\report.md', description: '离线调研报告' }],
    },
    blockers: { items: ['pwsh 失败 2 次（exit code: 1）', 'LLM 重试 3 次（SERVER×3）'] },
    health: { rough: true, lines: ['连续用机超过两小时，记得休息。'] },
    carryOver: [{ text: '补 Windows 通知分支', title: '每日简报', kind: 'todo' }, { text: '完善报告测试', title: '离线渲染', kind: 'interrupted' }],
    weekly: null,
  },
  appendix: {
    sessions: [{ title: '每日简报 | 设计', time: '09:12–11:40', stats: '消息 3 · 工具 105 · tokens 84 万', summary: '设计报告结构\n完成初稿。', cwd: 'E:\\work\\demo' }],
    commands: ['git status', 'node --test E:\\work\\demo\\test\\render.test.mjs'],
    raw: { totals: { sessions: 3, toolCalls: 105, tokens: { total: 840000 }, costCny: 1.2 }, commands: { git: 12, node: 15 }, rework: { count: 1 }, host: { firstStart: 1794444720000, onlineMs: 22800000, boots: [{ bootId: 'boot-demo', start: 1794444720000, end: 1794467520000, endKind: 'beat' }] }, idle: { activeMs: 18000000, sedentaryCount: 2 } },
  },
}

/** Weekly fixture matches nullable fields in buildPeriodReport. */
export const sampleWeekly = structuredClone(sampleDaily)
sampleWeekly.kind = 'weekly'
sampleWeekly.label = '2026 第46周（11/09–11/15）'
sampleWeekly.range = { start: '2026-11-09', end: '2026-11-15' }
sampleWeekly.layer1.weather = null
sampleWeekly.layer1.host = '5 天有 DSH 活动，累计在线 32h'
sampleWeekly.sections.mainline = null
sampleWeekly.sections.usage.cacheHitRate = null
sampleWeekly.sections.usage.peakShare = null
sampleWeekly.sections.usage.priciest = null
sampleWeekly.sections.usage.budget = null
for (const key of ['latency', 'commands', 'domains', 'approvals', 'speed']) sampleWeekly.sections.tools[key] = null
sampleWeekly.sections.weekly = {
  days: [3, 2, 5, 3, 2, 0, 0].map((sessions, i) => ({ date: `11-${String(i + 9).padStart(2, '0')}`, sessions, tokens: sessions * 280000, costCny: sessions * .4 })),
  topProjects: 'dsh-daily-report · demo', mainline: ['11-09 周一：完成插件调研。', '11-12 周四：实现三层报告。'],
}

/** No section-level details, weather, host, alerts or carry-over. */
export const sampleEmpty = {
  kind: 'daily', label: '11月13日 周五', range: { start: '2026-11-13', end: '2026-11-13' },
  generatedAt: sampleDaily.generatedAt, language: 'zh', summaryMode: 'cloud',
  layer1: { weather: null, host: null, headline: '这一天没有 DSH 会话', oneLiner: null, alerts: [], carryOverCount: 0 },
  sections: { mainline: null, usage: null, tools: null, blockers: null, health: null, carryOver: null, weekly: null },
  appendix: { sessions: [], commands: [], raw: { totals: { sessions: 0 }, host: null, idle: null } },
}
