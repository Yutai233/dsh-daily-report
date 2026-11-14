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

自动卡片 payload 新增 `gen: { calls, tokens, cny, estimated } | null`（来自报告 `meta.gen`，见 §4）：卡片左下角据此显示「生成 12.3 万 tokens（¥0.12）」，`estimated` 为真时改显示「生成约」。旧报告没有该字段，卡片只是不显示这段。

`layer1.weather` 新增 `date`、`label`（如“天气 11-12”）、`location`（地点，旧报告没有），天气来自**生成报告时的当前日期**，不是重新查看归档时自动更新。`label`/`text` 仍以「天气 MM-DD」开头（HTML 报告沿用）；早晨卡片会剥掉这个前缀，改写成相对说法「今日/明日/昨日 地点」，后面接具体数据，避免与标题行的日期重复。

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
  "carryOver": [{ "text": "补 Windows 通知分支", "sessionId": "…", "title": "…", "kind": "todo"|"interrupted" }],   // 已按来源会话活跃度排序：当日 token 总数降序，其次工具调用、最近活跃

  // —— 以下字段由其它采集器写入，可能为 null ——
  "host": { "boots": [{ "bootId": "…", "start": 0, "end": 0, "endKind": "beat"|"running" }], "firstStart": 0, "onlineMs": 0 },
  "weather": { "location": "上海", "date": "2026-11-12", "code": 61, "text": "小雨", "icon": "rain", "tMin": 9, "tMax": 14, "precipProb": 80, "precipMm": 3.2, "deltaMax": -6, "aqi": 85, "tips": ["记得带伞", "比昨天降温 6°C"] },
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
  // tips 只在“需要注意”时给，文案尽量短：code 属于雨雪雷 → "记得带伞" / "注意防滑保暖" / "有雷阵雨"；降水概率≥50 → "降水概率 N%，记得带伞"；deltaMax ≤ −5 → "比昨天降温 N°C"；aqi>100 → "空气较差（AQI N）"；tMax≥35 → "最高 N°C，防暑补水"；tMin≤0 → "最低 N°C，注意保暖"。
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
export async function readIdleStreak(dataDir, dateStr, { activeMs, breakMs, intervalMs, now = Date.now() }) → { start, end: now, ms } | null
  // 实时久坐提醒用：只返回**最后一段**且此刻仍开着的情况——尾采样 idleMs < breakMs、now - 尾采样 ≤ 3×intervalMs、
  // ms ≥ 10 分钟。end 取 now，所以连续时间随真实时间推进。
```

### engine.js · notify
```js
export function notify(title, message, log?, { platform, spawnImpl }?) → { ok, status: 'submitted'|'failed'|'unsupported', error? }
  // win32：powershell -EncodedCommand 调 WinRT toast。第一次发时在 HKCU\Software\Classes\AppUserModelId\Dsh.DailyReport
  // 注册「DSH 每日简报」并用它 CreateToastNotifier；注册/创建失败回退 PowerShell 自带 AUMID。
  // status:'submitted' 只代表进程退出 0，不代表用户看见（通知设置 / 专注助手仍可能拦截）。
```

### analyze/cost.js
```js
export const DEFAULT_PRICING = { currency: 'CNY', inputPerM: 2, outputPerM: 8, cacheReadPerM: 0.04, offpeakDiscount: 0.5 } // 峰时价，对齐 DS 官方 Flash 价目（元/百万 token）；cacheWrite 不单独计价
export const PEAK_HOURS = [[9, 12], [14, 18]]; export const PRO_MULTIPLIER = 3; export const HOLIDAY_VALLEY: Set<string> // 2026 年法定节假日，需每年补
export function costOf(usage, pricing = DEFAULT_PRICING, atMs?, model?) → number   // usage = {inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens}；谷时 × offpeakDiscount，Pro 模型 ×3
export function isOffpeak(atMs) → boolean   // true = 谷时：周末、法定节假日全天，以及工作日不在 09:00–12:00 / 14:00–18:00 的时段
export function modelScale(model) → number   // deepseek-v4-pro → 3，其余 1
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
  alerts: [string]          // 给第 1 层的短句（≤2 条），如“连续 2h10m 未休息”“23:40 仍在工作”
} | null                    // enabled=false 返回 null
  // 有 facts.idle 用 idle；否则用 activity.userMessageTimes 粗估（相邻消息 < 15min 视为连续），并 rough=true。
  // 熬夜：最后活动时刻 ≥ lateHour:00 或 < 05:00；午休：11:30–13:30 每 30 分钟都有活动 → “中午没离开过”；周末：当天是周六日且有活动。
  // 熬夜告警里的时刻取当天最后一个采样（idle.lastSample），触发条件仍用“最后活动”lastActive。
```

## 4. Report（analyze/report.js 产出，渲染器的唯一输入）

```jsonc
{
  "kind": "daily" | "weekly" | "monthly",
  "label": "11月12日 周三" | "2026 第46周（11/09–11/15）" | "2026年11月",
  "range": { "start": "2026-11-12", "end": "2026-11-12" },
  "generatedAt": 0, "language": "zh",
  "meta": {                               // 生成过程的元数据；旧报告没有
    "gen": {                              // 生成本报告消耗的用量（engine.generationMeta）
      "calls": 4, "tokens": 123000, "inputTokens": 98000, "outputTokens": 25000,
      "costCny": 0.1234,                  // 按设置里的价目表估算，非账单
      "estimated": false                  // 模型没回报 usage 时按字符数估算，卡片显示「生成约」
    }
  },
  "layer1": {
    "weather": { "date": "2026-11-14", "location": "南京", "label": "天气 11-14", "text": "天气 11-14 · 🌧 13~18°C 阵雨 · 南京", "tip": "记得带伞" } | null,
    "host": "dsh 08:52 启动，在线 6h20m" | null,
    "headline": "3 个会话 · 105 次工具 · 84 万 tokens（约 ¥1.20）",
    "usage": {                            // headline 的结构化形式，供卡片分行摆放；无活动时为 null
      "sessions": 3, "toolCalls": 105,
      "tokens": "84 万", "cost": "¥1.20",
      "trend": "up"|"down"|"flat"|null,   // 与昨天比，口径同 sections.usage.rows[0]
      "delta": "+23%"
    } | null,
    "oneLiner": "完成插件调研，开始设计日报功能方案。",
    "discovery": null,                    // string|null；模型判断确实值得展示才填写
    "festival": {                          // 仅日报；本地节日表命中才有，否则 null。默认常开，没有配置开关
      "id": "xmas", "name": "圣诞", "emoji": "🎄",
      "greeting": "圣诞快乐，早点歇。", "badge": "🎄 圣诞",
      "theme": { "bg": "#ffffff", "fg": "#c62828", "border": "#c62828", "deco": "…", "mono": false }
    } | null,
    "alerts": ["连续 2h10m 未休息", "23:40 仍在工作"],
    "carryOverCount": 2
  },
  "sections": {                           // 每个 section 为 null 表示“今天没变化，不渲染”
    "mainline": null,                      // 兼容旧归档字段；新日报不生成、渲染器不显示
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
    "carryOver": [{ "text": "…", "title": "…", "kind": "todo", "sessionId": "…" }] | null,
    "weekly": { "days": [{ "date": "11-10", "sessions": 3, "tokens": 0, "costCny": 0 }], "topProjects": "…", "mainline": ["…"] } | null   // 仅周/月报
  },
  "appendix": {
    "sessions": [{ "title": "…", "time": "09:12–11:40", "stats": "消息 3 · 工具 105 · tokens 84 万", "summary": "…", "cwd": "…" }],
    "commands": ["git status", "…"],          // 最多 50 条
    "raw": { /* DayFacts.totals 精简 */ }
  }
}
```

### 可选 bili 联动（仅日报）

- `facts.bili` → `report.layer1.bili`：`{ source:'billion-context', date, compressionCount, reclaimedTokens, inputTokens, cachedTokens, cacheHitRate, netSavedTokens, status, anomalies, coverage?, estimated? } | null`；所有计量缺失用 `null`，不填假 0、不回退为累计数。
- 只在 **dsh-context 运行中 + 本机 bili 活跃实例** 均可确认时启用；包已安装但未运行不算可用。用户设置里的 `links.context` / `links.bili`（默认 `true`）是同意开关：任一为 `false` 时 `readBiliDay` 直接返回 `null`，不读账本，`layer1.bili` 为 `null`，小卡片不显示 bili 面、发现不带联动标签。旧报告读取时可补本地元数据，不重新调用模型、不改隐私设置。卸载/停用后不展示归档遗留的可选字段。
- 仅从 bili SQLite 只读投影会话映射与 `cacheLedger` 数值字段，按报告会话 ID 和本地日期过滤；不读取正文、摘要、handoff、工具参数或其他插件详情接口。Worker 有超时、行数及内存上限，兼容性失败静默降级。
- `reclaimedTokens` 是当日压缩事件窗口回收量，不是净节省；`cacheHitRate = cachedTokens / inputTokens` 按 token 加权，范围为 0–1，零分母或覆盖不足未知。原用量/费用总计不加减 bili 统计，避免重复记账。
- 部分覆盖不整日作废：bili 从未记录的会话、缺少版本化账本的会话计入 `coverage` 缺口（如 `9/11 会话可核算（部分会话尚无 bili 映射），其余未计入`），其余可核算会话照常给出四项指标，因而不计入的会话使数值成为当日下界。会话内部的问题（历史不完整、账本冲突、缓存用量未测量）仍只把对应指标置 `null`；一个可核算会话都没有时才全部 `null`。覆盖说明排在 `coverage` 首位，避免 240 字截断后丢失。
- `netSavedTokens` 只接受可核对且完整归属于本日的 bili fold 账本净收益：`max(0,S-sigma)*requestsAfter-T-sigma`；跨日/继承/不完整账本无法归属时为 `null`，不拿窗口回收量冒充。保留负数。bili 自身的摘要 token 估算通过 `estimated:true` 显式传递，前端标“约”，不声称账单实测节约。
- HTML 第一层 `details.spark` 默认收起，有统计时原 summary 提示“bili 收益”，卡在原图表之前，恰好四项：压缩次数、窗口回收量、缓存命中率、异常状态。异常原因在第四项内可见，数据不全显示待确认而非无异常。Markdown 同口径。
- 小卡片只在 `netSavedTokens` 为有限正数时加入长方体相邻第二面“bili-c节省[约]XXX”；0/负/未知保留原用量。动画为 10 秒周期，hover/focus/busy/viewer/页面隐藏时复位完整第一面；减少动态时静态同行呈现两值。装饰面 `aria-hidden`，单一组提供完整可访问说明。

## 5. 渲染器
```js
// render/html.js
export function renderHtml(report, { redact = false, sessionLinks = false } = {}) → string
// render/markdown.js
export function renderMarkdown(report) → string
```
- HTML：**单文件**，内联 CSS + 内联 SVG，**无 `<script>`、无外链**（字体用系统字体栈）。第 1 层常显，三项关键指标采用标签、数值、涨跌幅同行的紧凑布局，窄屏自然换行；其中近 7 天 tokens 柱状图折叠在 `<details class="spark">` 内、默认收起；第 2 层按 **待续 → 用量 → 工具 → 卡点 → 作息 →（周/月概览）** 顺序渲染，每段一个 `<details>`，仅待续默认展开，其余折叠；旧归档中的 `sections.mainline` 不再渲染，逐会话摘要保留在附录；第 3 层附录 `<details>` 默认折叠。暗色/亮色跟随 `prefers-color-scheme`。`redact=true` 时把 cwd、文件路径、域名替换为 `***`（脱敏分享）。
- 所有文本必须 `escapeHtml`。
- “只写有变化的内容”：section 为 null 就不渲染该段；`layer1.alerts` 为空就不渲染警示行。
- Markdown：全量，同样的层次；第 2 层用 `## `，附录用 `## 附录`；表格用 GFM。

## 6. 断点续工与每日发现

- 日报、周报、月报的 `sections.carryOver[]` 保留采集器给出的 `sessionId`；老报告没有 ID 时不伪造目的地。卡片与 DSH 内完整报告在正文后显示「相关会话」按钮，通过 `uiWorkspace.openSession(sessionId)` 原生导航；失败留在原界面并显示错误。
- `summarizeDay()` 返回 `{ oneLiner, discovery, discoveryLinked, mode, llmCalls }`。现有 DAY 请求合并生成 JSON `{ "oneLiner": "…", "discovery": null|string, "discoveryLinked": boolean }`，不增加模型请求次数；有具体依据且有新意才写发现，禁止为了填空重复摘要、待办、成本或健康提醒。发现清理后最多 60 字（不含独立标签）。
- 仅 bili/context 双运行且有同日有效数字账本时，向原 DAY 请求加入白名单聚合数值供模型判断跨插件异常解释；不上传原始插件文字、路径、ID、正文、摘要或 handoff。沿用用户摘要模式，不开启额外云调用。证据不足不生成联动发现，缺测不等于异常，相关性不能擅写因果；普通发现仍可被选中。
- `facts.discoveryLinked` → `report.layer1.discoveryLinked` 仅严格布尔 `true` 代表模型实际采用了可用联动证据。有正文、标志为真且 `layer1.bili` 可用时，卡片/HTML 段末加淡蓝半透明圆角标签“插件联动”（Markdown 为括注）；无插件时不展示历史联动正文或标签，普通发现不受影响。重看归档不补做模型判断。
- `facts.discovery` 与 `report.layer1.discovery` 为 `string|null`，旧字段缺失视为 null。仅统计、无可用模型、模型失败、格式错误或没有值得展示的内容时不生成模板发现。周期回填不调用模型生成发现。
- 卡片、HTML 与 Markdown 在总览下、明日待续上方按需显示发现，标签与正文合并为一行（`每日发现：正文`）；空值时整块省略。
- `renderHtml(report, { redact = false, sessionLinks = false })` 仍输出无脚本的单文件。仅 DSH 的 generate/report RPC 以 `sessionLinks:true` 输出按钮，并向客户端提供结构化来源白名单。导出的 HTML 不显示无效按钮，Markdown 留存会话 ID。
- 无可跳转会话的查看器继续使用 `sandbox=""`。交互报告只授权 `allow-scripts`（不允许 same-origin、弹窗、表单或顶层导航），CSP 仅允许随机 nonce 的可信点击桥；原报告脚本、内联事件及网络资源保持禁止。父页只接受当前 iframe、当前报告、匹配 token 且在结构化会话白名单内的消息；桥只处理真实用户点击/键盘激活。
