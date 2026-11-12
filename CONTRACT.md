# dsh-daily-report · 模块接口契约（开发用）

> 所有模块：**纯 ESM**（`.js`，`package.json` 里 `"type": "module"`），Node ≥ 18，**零第三方依赖**（只用 `node:*` 内置模块与全局 `fetch`）。
> 中文注释可以，标识符用英文。每个导出函数都要有 JSDoc。不要 `console.log`，日志一律通过可选参数 `log(msg)` 输出。
> 时间一律是**毫秒时间戳（本地时区解释）**；日期字符串一律 `YYYY-MM-DD`（本地日期）。

## 0. 目录与数据落盘

```
plugin/
  lib/index.js              Host 插件入口（cordis apply）
  lib/util.js               公共工具（见 §1）
  lib/config.js             配置读写
  lib/store.js              事实库 / 报告 / 缓存落盘
  lib/collect/sessions.js   会话日志 → 当日事实（sessionQuery）
  lib/collect/heartbeat.js  dsh 启停心跳
  lib/collect/weather.js    Open-Meteo 天气
  lib/collect/idle.js       Windows 键鼠空闲采样
  lib/analyze/cost.js       成本 / 峰谷 / 缓存命中
  lib/analyze/health.js     健康提醒
  lib/analyze/report.js     事实 → 报告模型（含 7 日对比、周/月报聚合）
  lib/summarize.js          分层摘要 + 缓存
  lib/render/html.js        单文件 HTML（三层，折叠）
  lib/render/markdown.js    Markdown 归档
```

数据根目录 `DATA_DIR = ~/.dsh/dsh-daily-report/`：

| 路径 | 内容 |
|---|---|
| `config.json` | 用户设置（0600） |
| `heartbeat/YYYY-MM-DD.jsonl` | 每行一个心跳 `{"bootId","t","kind":"start"|"beat"}` |
| `idle/YYYY-MM-DD.jsonl` | 每行一个采样 `{"t":ms,"idleMs":ms}` |
| `facts/YYYY-MM-DD.json` | 当日事实（DayFacts，见 §2） |
| `reports/daily/YYYY-MM-DD.{md,html}` | 日报 |
| `reports/weekly/YYYY-Www.{md,html}`、`reports/monthly/YYYY-MM.{md,html}` | 周报 / 月报 |
| `cache/summaries.json` | 摘要缓存 `{ [sessionId]: { key, summary, source, at } }` |
| `cache/weather.json` | 天气缓存 |
| `state.json` | `{ lastShownDate, lastGeneratedDate, ... }` |

报告根目录由 `config.reportsDir` 决定（空字符串默认 `DATA_DIR/reports`），设置页「报告保存目录」允许绝对路径与恢复默认。日报/周报/月报分别在该根目录的 `daily/weekly/monthly` 子目录，均保存 `.md/.html/.json`。更改只切换读写位置，不自动搬移、删除旧报告；事实、采样、配置始终留在 `DATA_DIR`。`state` RPC 返回解析后的 `reportsDir`、`defaultReportsDir`。所有报告生成/列表/读取/打开/工具/清理都传递同一配置值。

自动卡片 payload 新增 `requestedDate`（设置目标日）、`fallbackNote: string|null`；目标日无活动时在保留期内回退最近活动日，不回退到目标日之后。显式指定 `date` 不回退。解析过程不调用模型。

`layer1.weather` 新增 `date`、`label`（如“天气 11-12”），天气来自**生成报告时的当前日期**，不是重新查看归档时自动更新。

## 1. `lib/util.js`（由 lead 提供，其他模块可直接 import）

```js
export const DAY = 86400000
export const DATA_DIR            // ~/.dsh/dsh-daily-report
export function pad(n)            // '05'
export function fmtDate(ms)       // 'YYYY-MM-DD'（本地）
export function parseDate(str)    // 'YYYY-MM-DD' → 当日 00:00 本地 ms
export function dayRange(str)     // → { start, end }  [start, end)
export function fmtClock(ms)      // 'HH:MM'
export function fmtDur(ms)        // '6h20m' / '45m' / '30s'
export function fmtTokens(n)      // '84 万' / '1.2 亿' / '9,800'
export function fmtCny(n)         // '¥1.23'（<0.01 显示 '<¥0.01'）
export function quantile(sortedNums, q)  // q∈[0,1]，空数组返回 null
export async function readJson(file, fallback)
export async function writeJson(file, value, mode?)   // 原子写（tmp + rename），自动 mkdir
export async function appendLine(file, obj)           // 追加一行 JSON，自动 mkdir
export async function readLines(file)                 // 读 jsonl → 对象数组，坏行跳过；文件不存在返回 []
export function escapeHtml(s)
```

## 2. DayFacts（`facts/YYYY-MM-DD.json`，由 collect/sessions.js 产出，其余采集器补字段）

```jsonc
{
  "version": 1,
  "date": "2026-11-12",
  "generatedAt": 1794452436000,
  "sessions": [{
    "id": "session-…", "title": "每日简报插件检索与方案设计", "cwd": "E:\\…", "workspace": "dsh-daily-report",
    "firstActive": 1794452436000, "lastActive": 1794460000000,
    "userMessages": 3, "turns": 3, "toolCalls": 105,
    "tokens": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "reasoning": 0, "total": 0 },
    "costCny": 1.23,
    "filesChanged": [{ "path": "src/index.js", "count": 9 }],
    "failures": [{ "kind": "tool"|"job", "name": "pwsh", "detail": "exit code: 1" }],
    "openTodos": ["补 Windows 通知分支"],
    "interruptedTurns": 1, "errorTurns": 0,
    "deliverables": [{ "path": "…/report.md", "description": "…" }],
    "retries": 3,
    "summary": "检索 DSH 插件市场的每日简报插件；结论是…已输出对比报告。",   // 可能为 null
    "summarySource": "llm" | "template" | "cache"
  }],
  "totals": {
    "sessions": 3, "userMessages": 9, "turns": 5, "toolCalls": 105,
    "tokens": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "reasoning": 0, "total": 0 },
    "costCny": 1.2,
    "turnEnds": { "completed": 4, "interrupted": 1, "error": 0 },
    "retries": 3, "retryCodes": { "SERVER": 3 }
  },
  "tools": {
    "top": [{ "name": "pwsh", "count": 38, "errors": 2, "p50Ms": 4200, "p90Ms": 61000 }],
    "failures": [{ "name": "pwsh", "detail": "exit code: 1", "count": 2 }],
    "commands": { "git": 12, "npm": 8, "node": 15, "python": 0, "pwsh": 3, "other": 4 },
    "hotFiles": [{ "path": "src/index.js", "count": 9 }],
    "domains": [{ "domain": "github.com", "count": 5 }],
    "approvals": { "count": 2, "waitMs": 1500 },
    "speed": { "outputTokPerSec": 42.5, "ttftMsP50": 1800 }
  },
  "usageEvents": [ { "t": 1794452445972, "costCny": 0.012, "tokens": 30948, "sessionId": "…", "turn": 1 } ],
  "activity": { "firstActive": 0, "lastActive": 0, "hourly": [/*24 个整数：每小时真人消息+助手消息数*/], "userMessageTimes": [/*ms*/] },
  "rework": { "count": 1, "userMessages": 9, "ratio": 0.11 },
  "carryOver": [{ "text": "补 Windows 通知分支", "sessionId": "…", "title": "…", "kind": "todo"|"interrupted" }],

  // —— 以下字段由其它采集器写入，可能为 null ——
  "host": { "boots": [{ "bootId": "…", "start": 0, "end": 0, "endKind": "beat"|"running" }], "firstStart": 0, "onlineMs": 0 },
  "weather": { "location": "上海", "date": "2026-11-12", "code": 61, "text": "小雨", "icon": "rain", "tMin": 9, "tMax": 14, "precipProb": 80, "precipMm": 3.2, "deltaMax": -6, "aqi": 85, "tips": ["有雨，记得带伞", "比昨天降温 6°C"] },
  "idle": { "samples": 420, "activeMs": 0, "longestStreak": { "start": 0, "end": 0, "ms": 0 }, "streaks": [{ "start": 0, "end": 0, "ms": 0 }], "sedentaryCount": 3, "firstActive": 0, "lastActive": 0 }
}
```

## 3. 各模块签名

### collect/heartbeat.js
```js
export function createHeartbeat({ dataDir, intervalMs = 60000, log }) → {
  start(): Promise<void>      // 生成 bootId，写一条 kind:'start'，之后每 intervalMs 写 kind:'beat'（setInterval，unref）
  stop(): void                // 只清 timer，不写“关闭”记录（崩溃安全靠心跳）
  bootId: string, startedAt: number
}
export async function readHostDay(dataDir, dateStr) → DayFacts.host | null
// 读取 dateStr 与前一天的 jsonl（跨零点的 boot），按 bootId 分组：
// start=首条 start 记录（或首条记录）的 t；end=最后一条记录的 t；
// 若该 bootId 是当前进程（传入 currentBootId 可选第三参数）则 endKind='running'、end=Date.now()。
// 只保留与 [dateStart, dateEnd) 有交集的 boot，onlineMs = 各区间与当天交集的并集长度。firstStart = 当天最早 start。
```

### collect/weather.js
```js
export async function geocode(name, { lang = 'zh', fetchImpl = fetch }) → [{ name, admin1, country, latitude, longitude }]
  // https://geocoding-api.open-meteo.com/v1/search?name=…&count=5&language=zh&format=json
export async function fetchWeather({ latitude, longitude, location, dateStr, fetchImpl = fetch, timeoutMs = 8000 }) → DayFacts.weather | null
  // https://api.open-meteo.com/v1/forecast?latitude=…&longitude=…&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum&timezone=auto&past_days=1&forecast_days=2
  // 空气：https://air-quality-api.open-meteo.com/v1/air-quality?latitude=…&longitude=…&current=us_aqi （失败忽略，aqi=null）
  // deltaMax = 当天最高温 − 前一天最高温
  // tips 只在“需要注意”时给：降水概率≥50 或 code 属于雨雪雷 → "有雨/雪，记得带伞"；deltaMax ≤ −5 → "比昨天降温 N°C，注意添衣"；aqi>100 → "空气较差（AQI N），少开窗"；tMax≥35 → 高温；tMin≤0 → 结冰。
export function weatherText(code) → { text: '小雨', icon: 'rain'|'sun'|'cloud'|'fog'|'snow'|'storm'|'drizzle' }   // WMO code 中文映射
```
任何网络失败返回 null，不抛错。

### collect/idle.js（Windows）
```js
export function createIdleSampler({ dataDir, intervalMs = 60000, log }) → { start(), stop(), running: boolean, lastIdleMs: number|null }
  // win32 才工作；其它平台 start() 直接 no-op 并 log。
  // 实现：spawn 一个常驻 powershell.exe（-NoProfile -NonInteractive -Command -），通过 Add-Type 定义 GetLastInputInfo，
  // 循环 `while($true){ [Console]::Out.WriteLine([Idle]::Ms()); [Console]::Out.Flush(); Start-Sleep -Seconds N }`；
  // Node 端按行读 stdout → appendLine(idle/YYYY-MM-DD.jsonl, {t, idleMs})。windowsHide:true，子进程挂了 30s 后重启（最多 5 次/小时）。
  // stop() 杀子进程。只记录“多久没动”，不记录任何按键内容。
export async function readIdleDay(dataDir, dateStr, { activeMs = 120000, breakMs = 300000, sedentaryMs = 3000000 }) → DayFacts.idle | null
  // 规则：idleMs < activeMs → 在用；idleMs ≥ breakMs → 休息（打断连续段）；连续段 > sedentaryMs → 久坐段
  // 相邻采样间隔 > 3×intervalMs 视为断档（电脑睡眠/插件未运行），也打断连续段。
```

### analyze/cost.js
```js
export const DEFAULT_PRICING = { currency: 'CNY', inputPerM: 2, outputPerM: 3, cacheReadPerM: 0.2, cacheWritePerM: 2, offpeakDiscount: 0.5, offpeak: { start: '00:30', end: '08:30' } }
export function costOf(usage, pricing = DEFAULT_PRICING, atMs?) → number   // usage = {inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens}；谷时乘以 offpeakDiscount
export function isOffpeak(atMs, pricing) → boolean
export function analyzeCost(facts, pricing) → {
  totalCny, cacheHitRate /* cacheRead / (input + cacheRead + cacheWrite) */, peakShare /* 峰时成本占比 0~1 */,
  offpeakSavingCny /* 若峰时用量全挪到谷时可省 */, priciest: { sessionId, title, turn, costCny } | null,
  tips: [string] /* 只在有意义时给：peakShare≥0.6 且可省≥0.1 元；cacheHitRate<0.3 且 tokens 大 */
}
```

### analyze/health.js
```js
export function analyzeHealth(facts, { enabled, sitLimitMin = 50, lateHour = 23, lunch = true, inputSampling }) → {
  rough: boolean,           // true = 没有键鼠采样，只能用 DSH 活动粗估
  usageMs, longest: { start, end, ms } | null, sedentaryCount,
  lines: [string],          // 行为提醒句子，措辞只做提醒不做诊断；无异常时为空数组
  alerts: [string]          // 给第 1 层的短句（≤2 条），如“连续用机 2h10m 未休息”“23:40 后仍在工作”
} | null                    // enabled=false 返回 null
  // 有 facts.idle 用 idle；否则用 activity.userMessageTimes 粗估（相邻消息 < 15min 视为连续），并 rough=true。
  // 熬夜：最后活动时刻 ≥ lateHour:00 或 < 05:00；午休：11:30–13:30 每 30 分钟都有活动 → “中午没离开过”；周末：当天是周六日且有活动。
```

## 4. Report（analyze/report.js 产出，渲染器的唯一输入）

```jsonc
{
  "kind": "daily" | "weekly" | "monthly",
  "label": "11月12日 周三" | "2026 第46周（11/09–11/15）" | "2026年11月",
  "range": { "start": "2026-11-12", "end": "2026-11-12" },
  "generatedAt": 0, "language": "zh",
  "layer1": {
    "weather": { "text": "☁ 14°C 小雨", "tip": "建议带伞" } | null,
    "host": "dsh 08:52 启动，在线 6h20m" | null,
    "headline": "3 个会话 · 105 次工具 · 84 万 tokens（约 ¥1.20）",
    "oneLiner": "完成插件调研，开始设计日报功能方案。",
    "alerts": ["连续用机 2h10m 未休息", "23:40 后仍在工作"],
    "carryOverCount": 2
  },
  "sections": {                           // 每个 section 为 null 表示“今天没变化，不渲染”
    "mainline": [{ "time": "09:12", "title": "…", "summary": "…", "sessionId": "…" }] | null,
    "usage": {
      "rows": [{ "label": "Tokens", "value": "84 万", "delta": "+23%", "trend": "up"|"down"|"flat"|null }],
      "cacheHitRate": "62%", "peakShare": "60%", "tips": ["…"], "priciest": "… 0.31 元",
      "budget": { "label": "每日预算", "used": "¥1.20", "limit": "¥2.00", "ratio": 0.6, "over": false } | null,
      "spark": [ { "date": "11-06", "value": 123 } ]         // 近 7 天 tokens，用于内联 SVG 迷你柱状图
    } | null,
    "tools": {
      "top": "pwsh×38  read×21 …", "latency": "pwsh p50 4.2s / p90 61s · …", "commands": "git 12 · npm 8 …",
      "hotFiles": "src/index.js ×9 · README.md ×4", "domains": "github.com ×5 …", "approvals": "2 次，合计 1.5s",
      "speed": "42 tok/s · 首字 1.8s", "deliverables": [{ "path": "…", "description": "…" }]
    } | null,
    "blockers": { "items": ["pwsh 失败 2 次（exit code: 1）", "LLM 重试 3 次（SERVER×3）", "1 轮被中断", "src/index.js 改了 9 次，可能在反复折腾"] } | null,
    "health": { "rough": false, "lines": ["…"] } | null,
    "carryOver": [{ "text": "…", "title": "…", "kind": "todo" }] | null,
    "weekly": { "days": [{ "date": "11-10", "sessions": 3, "tokens": 0, "costCny": 0 }], "topProjects": "…", "mainline": ["…"] } | null   // 仅周/月报
  },
  "appendix": {
    "sessions": [{ "title": "…", "time": "09:12–11:40", "stats": "消息 3 · 工具 105 · tokens 84 万", "summary": "…", "cwd": "…" }],
    "commands": ["git status", "…"],          // 最多 50 条
    "raw": { /* DayFacts.totals 精简 */ }
  }
}
```

## 5. 渲染器
```js
// render/html.js
export function renderHtml(report, { redact = false } = {}) → string
// render/markdown.js
export function renderMarkdown(report) → string
```
- HTML：**单文件**，内联 CSS + 内联 SVG，**无 `<script>`、无外链**（字体用系统字体栈）。第 1 层常显；第 2 层各 section 用 `<details open>`（主线、待续默认展开，其余折叠）；第 3 层附录 `<details>` 默认折叠。暗色/亮色跟随 `prefers-color-scheme`。`redact=true` 时把 cwd、文件路径、域名替换为 `***`（脱敏分享）。
- 所有文本必须 `escapeHtml`。
- “只写有变化的内容”：section 为 null 就不渲染该段；`layer1.alerts` 为空就不渲染警示行。
- Markdown：全量，同样的层次；第 2 层用 `## `，附录用 `## 附录`；表格用 GFM。
