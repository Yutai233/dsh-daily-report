# DSH「每日简报」插件检索报告

> 目标：判断**是否已有现成插件**可直接安装，实现「天气 + dsh 启停时间 + token 用量 + 简报内容 + 用户分析报告」。
> 结论先行：**没有完全匹配的现成插件。** 最接近的是 2 个可直接安装的日报插件（覆盖 3/5 项），要拼齐必须组合，且「dsh 启停时间」这一项**没有任何插件把它作为日报数据源**。
>
> **归档说明**：本文写于 2026-11，是前期调研的过程记录，已做路径脱敏。插件市场的版本、收录与兼容性会随时间变化，本文结论只代表检索当时（DSH `0.1.1-rc.2` 环境）的情况；正式对外文档见 [GUIDE.md](../GUIDE.md) 与仓库根 [README.md](../../README.md)，后续设计见 [DESIGN.md](DESIGN.md)。

---

## 0. 检索范围（先说明我在哪找的）

DSH 的插件市场不是单一站点，而是多头并存。本机 `~/.dsh/profiles/desktop/package.json` 已装 `dshmarket@1.73.16`（可视化市场），它的真实索引源是 `awesome-dsh-plugin.com`。

| 渠道 | 状态 | 实测依据 |
|---|---|---|
| `awesome-dsh-plugin.com` | ✅ 主索引，**10,119** 个插件 | 直接抓 `plugins.json`（12 MB）、`readmes.json`（137 MB）、`updates.json` |
| `dshmp.com` | ✅ 可用，**10,063** 个插件 | `/api/plugins` 返回 total=10063 |
| `dshmarket.com` | ⚠️ 首页可开，但 `/p/` 详情页已是**跳转存根**，canonical 指向 awesome-dsh-plugin.com | 页面原文说明目录页已迁移 |
| `dsh.directory` | ❌ **站点已不可用** | `http://` 返回 302 跳 `www.` 后连接失败，`https://` 直接 fetch failed；检索时另一路拿到的是 Namecheap 域名停放页 |
| `skillhub.cn` | ⚠️ 可访问，但是**通用 AI Skills 社区**，非 dsh 专属 | `api.skillhub.cn/api/skills` 返回真实 JSON |
| npm registry | ✅ 可搜 | `registry.npmjs.org/-/v1/search`，`keywords:dsh-plugin` 报 total≈14005 |
| GitHub | ⚠️ 部分可用 | `api.github.com` 搜索，4 条 query 因 403 限流失败 |

检索方法：全量拉取主索引后本地做关键词矩阵打分（中英双语 description + name + category），再对入围项逐个读 README / npm packument 核验，最后校验 `peerDependencies` / `engines.dsh` 与本机实际版本。

**本机实际环境**（这是决定「能否直接用」的关键）：`@deepseek-ai/dsh` = **0.1.1-rc.2**，cordis 4.0.1，schemastery 3.18.1。
（注：插件管理面板里显示的 `0.2.2-rc.1` 是**可安装 bundle 的目录版本**，不是本机已装版本。）

---

## 1. 「内容」这一项的匹配口径

需求里的「简报内容」是唯一有歧义的项，我按下面口径理解并匹配：

**主口径（本报告采用）：内容 = 当天 DSH 会话本身产生的「工作内容」** —— 做了什么任务、改了哪些文件、产出了什么、有哪些未结待办。理由：清单里另外两项（dsh 启停、token 用量）都是 DSH **运行侧**指标，合在一起的语义应是「我今天用 DSH 干了什么」的复盘报告。

**副口径（备查）：内容 = 外部资讯信息流**（新闻 / RSS / 视频更新 / 邮箱 / 日历）。若这是你的本意，对口方案换成 `dsh-daily-brief` / `dsh-rss-daily` / `@kpeace/dsh-daily`，但它们与 dsh 用量、启停完全无关，反而离目标更远。

下文所有「内容汇总」判定都按主口径。

---

## 2. 候选插件列表

图例：✅ 覆盖 ｜ △ 部分/语义不同 ｜ ❌ 不覆盖 ｜ ❓ 未能确认

### 2.1 第一梯队（真正做「日报」的）

#### ① dsh-period-report

| 项 | 结果 |
|---|---|
| 来源 | [awesome 目录页](https://awesome-dsh-plugin.com/p/zhengjy01/dsh-period-report/) ｜ [GitHub](https://github.com/zhengjy01/dsh-period-report) ｜ npm `dsh-period-report@0.2.1`（2026-08-16） |
| 天气 | ❌ |
| dsh 启停时间 | △ 只给**逐会话的「活跃时间段」**，不是 Host 进程启停时刻 |
| token 用量 | ✅ 输入/输出/缓存读/缓存写/推理，五类分列 |
| 内容汇总 | ✅ **AI 叙事摘要**：今日数据 / 今日主线 / 今日回顾（AI 关闭时回退模板） |
| 用户分析报告 | △ 有「明日建议」，但不是系统性用户画像 |
| 覆盖度 | **3 / 5** |
| 兼容本机 | ✅ peer `dsh-tools ^0.1.0-rc.6`、`dsh-system-prompt ^0.1.0-rc.6`、cordis ^4.0.1，均被 0.1.1-rc.2 满足 |
| 安装 | `dsh plugin --profile web add github:zhengjy01/dsh-period-report` |
| 配置要点 | 定时用 `report_config`：`anchorDate` + `intervalDays`（1=每日）+ `hour`/`minute` + `range: previous`（09:00 出昨日日报）。报告落盘 `~/.dsh/dsh-period-report/reports/`。配置存 `~/.dsh/dsh-period-report.json`（0600） |
| 注意 | 系统通知走 **osascript（macOS）/ notify-send（Linux）**，**Windows 上不会弹通知**，只有文件落盘 + 设置页卡片 |

#### ② dsh-whale-report（深迹 / DeepTrace）

| 项 | 结果 |
|---|---|
| 来源 | [awesome 目录页](https://awesome-dsh-plugin.com/p/SenmuuuuW/dsh-whale-report/) ｜ [GitHub](https://github.com/SenmuuuuW/dsh-whale-report) ｜ npm `dsh-whale-report@0.6.1`（2026-09-03）｜ ★31 ｜ 下载 1021 |
| 天气 | ❌ |
| dsh 启停时间 | ❌ |
| token 用量 | ✅ 成本与 Token 拆解，按模型/会话分账，峰谷分段计价 |
| 内容汇总 | ✅ 会话日志 → 日报/周报/月报/年报/自定义区间；含会话、工具调用、花费事实 |
| 用户分析报告 | ✅ **8 条确定性洞察 + 协作复盘 + IMPROVE 可执行建议**（带证据与验证计划） |
| 覆盖度 | **3 / 5** |
| 兼容本机 | ✅ **peer 基线正是 `>=0.1.1-rc.2 <0.2.0`**，与本机版本精确对齐；cordis ^4.0.1 ✓ |
| 安装 | `dsh plugin --profile web add "github:SenmuuuuW/dsh-whale-report"`（或 npm 同名包） |
| 配置要点 | 无需 API key。只读会话存档 `~/.dsh/sessions/*/session.jsonl.zstd`。报告由本地确定性代码生成，**0 token**。导出 Web / PNG / PDF。对话里说「给我一份周报」即触发 `whale_report` 工具 |
| 注意 | 「Apply/受控修改」只接受用户批准的白名单变更，不自愈；历史报告在升级后会按修正口径重算 |

### 2.2 第二梯队（功能对口但**本机装不了**，需升级 DSH）

#### ③ dsh-workload-report —— 唯一真正有「用户分析报告」的

| 项 | 结果 |
|---|---|
| 来源 | [npm](https://www.npmjs.com/package/dsh-workload-report) ｜ [GitHub](https://github.com/tableau-China/dsh-workload-report) ｜ `v2.5.0`（2026-11-07，18 个版本） |
| 天气 | ❌ |
| dsh 启停时间 | △ **净活跃时长**（模型时间 + 工具时间 − 等待人），README 明确写「**不是墙钟时间**」，且并发会话/子代理各自累加 |
| token 用量 | ✅ 九个 KPI，按日期/工作区/模型拆解 |
| 内容汇总 | ❌ README 明确：AI 画像只用**聚合统计**，且「never conversations, titles, or paths」——不读内容 |
| 用户分析报告 | ✅ **AI 用户画像**：标题 + 4–6 个数字维度 + 2–3 条建议 + 风险，模型生成 + 确定性本地规则兜底；可导出单文件 HTML 报告 |
| 覆盖度 | **2.5 / 5**（但「分析报告」这项质量最高） |
| 兼容本机 | ❌ `engines.dsh >= 0.2.1-alpha.0`，本机 0.1.1-rc.2 **不满足**；作者声明在 0.2.1-alpha.2 / 0.2.2-rc.1 上验证 |
| 安装 | `dsh plugin --profile web add dsh-workload-report`（需先升级 DSH） |
| 注意 | **不在 awesome-dsh-plugin 主索引里**（按 owner `tableau` 检索 0 命中），只能从 npm/GitHub 装 |

#### ④ dsh-schedule-calendar —— 唯一「天气 + 日报」同插件

| 项 | 结果 |
|---|---|
| 来源 | [awesome 目录页](https://awesome-dsh-plugin.com/p/loyalchiiina/dsh-schedule-calendar/) ｜ npm `dsh-schedule-calendar@0.4.3` |
| 天气 | ✅ 多城市 4 天预报（省/市/区级联） |
| dsh 启停时间 | ❌ |
| token 用量 | ❌ |
| 内容汇总 | △ 汇总**日程/待办完成情况**生成日报周报，不是 dsh 会话内容 |
| 用户分析报告 | △ 有日报/周报文字，基于日程而非使用行为 |
| 覆盖度 | **2 / 5** |
| 兼容本机 | ❌ `engines.dsh >= 0.2.2-0 < 0.3.0`，本机不满足 |
| 安装 | **不能** `dsh plugin` 装（桌面端 profile 被 Electron 独占会拒绝），需手改 `~/.dsh/profiles/desktop/package.json` 加 `dependencies` + `dsh.profile.bundles`，再 `pnpm install`，完全退出重启 |
| 前置依赖 | 必须先装 `dsh-better-sidebar`（提供侧边栏标签页能力） |

#### ⑤ dsh-morning-paper

| 项 | 结果 |
|---|---|
| 来源 | [awesome 目录页](https://awesome-dsh-plugin.com/p/damlys99/dsh-morning-paper/) ｜ npm `dsh-morning-paper@0.1.1` |
| 天气 | ❌ **注意：README 里的 `WEATHER` 是「上下文压力天气」仪表，不是气象** |
| dsh 启停时间 | ❌ |
| token 用量 | ✅ 逐轮 token/耗时/步数 |
| 内容汇总 | ✅ 报纸式头版：逐轮时间线、文件改动热度、墙钟时间去向、失败未重试项 |
| 用户分析报告 | △ 单会话复盘，非跨会话用户分析 |
| 覆盖度 | **2.5 / 5** |
| 兼容本机 | ❌ `engines.dsh >= 0.1.2-alpha.1 < 0.2.0-0`，本机 0.1.1-rc.2 太低 |
| 安装 | `dsh plugin --profile web add -w dsh-morning-paper`（需先升级到 ≥0.1.2-alpha.1） |
| 亮点 | 简报由持久会话日志折算，**从不调用模型 → 零 token、不会编造** |

### 2.3 第三梯队（单项能力，可作补齐件）

| 插件 | 来源 | 天气 | 启停 | token | 内容 | 分析报告 | 覆盖 | 本机兼容 |
|---|---|---|---|---|---|---|---|---|
| `dsh-daily-brief` v2.0.2 | [npm](https://www.npmjs.com/package/dsh-daily-brief) ｜ [GitHub](https://github.com/MosesMuxiXie/dsh-daily-brief) | ❌ | ❌ | ❌ | ✅ 但内容是外部流¹ | ❌ | 1/5 | ❓ 未声明约束，2026-11-10 新发 |
| `dsh_setting_pro` v0.12 | [awesome](https://awesome-dsh-plugin.com/p/dongasai/dsh_setting_pro/) | ❌ | ✅ 最后启动时间 + 已运行时长 + bootId | ❌ | ❌ | ❌ | 1/5 | ❓ npm 无此名，需本地目录/github 装 |
| `dsh-tool-weather` v0.2.3 | [awesome](https://awesome-dsh-plugin.com/p/Roykf/dsh-tool-weather/) ｜ npm | ✅ 面向模型的天气工具 | ❌ | ❌ | ❌ | ❌ | 1/5 | ✅ peer 全被 0.1.1-rc.2 满足 |
| `dsh-weather-panel` v1.8.1 | [awesome](https://awesome-dsh-plugin.com/p/python3603/dsh-weather-panel/) ｜ npm | ✅ 侧边栏面板 + 预警 + 台风路径 | ❌ | ❌ | ❌ | ❌ | 1/5 | ❓ 纯浏览器端，未声明 dsh 约束 |
| `dsh-profile-stats` v2.4.18 | [awesome](https://awesome-dsh-plugin.com/p/Lovenndme/dsh-profile-stats/) | ❌ | ❌ | ✅ | ❌ | △ 用量主页+环比，非文字报告 | 1.5/5 | ❌ `engines.dsh >=0.2.1-rc.5` |
| `@weibaohui/dsh-dashboard` v0.2.1 | [awesome](https://awesome-dsh-plugin.com/p/weibaohui/dsh-dashboard/) | ❌ | △ 工作时段热力图 | ✅ | ❌ | ✅ 7 张洞察卡 + 会话画像 | 2.5/5 | ❌ `engines.dsh >=0.1.7-rc.2` |
| `dsh-restart` | [awesome](https://awesome-dsh-plugin.com/p/DWJZ/dsh-restart/) | ❌ | ✅ PID/端口/启动时间/运行时长 | ❌ | ❌ | ❌ | 1/5 | ❓ |
| `xiangshu2026/dsh-scheduled-reports` | [awesome](https://awesome-dsh-plugin.com/p/xiangshu2026/dsh-scheduled-reports/) | ❌ | △ **Windows 开机时长 ≠ dsh 启停** | ❌ | ✅ 四份 Word 报告 | △ 电脑状况/插件更新/大模型动态 | 2/5 | ❓ 是 bat/ps1 脚本集，非标准 npm 插件；需 Python 3.9+、python-docx |

¹ `dsh-daily-brief` 的内容源：X 账号 / RSS·Atom·JSON·ICS / 网页 / YouTube / Bilibili / Steam / Minecraft 服务器 / 状态页 / IMAP 邮箱 / 日历。它是**本机唯一名字就叫「每日简报」的插件**（`v2.0.2`，2026-11-10 发布，仅 2 个版本）。仅 Windows 10/11（弹窗与计划任务依赖 Windows），默认注册 07:30 的 Windows 计划任务，用 Edge/Chrome `--app` 弹独立窗口。凭据用 Windows DPAPI 加密存 `…\daily-brief\secrets\`。需自填来源；AI 润色走本机已登录模型，无需额外 key。**不具备天气、token 用量、dsh 启停时间、用户分析报告。**

---

## 3. 按覆盖度排序

排序权重：先看**功能覆盖数**，再看**能否在当前 DSH 0.1.1-rc.2 上直接装**。

| # | 插件 | 覆盖 | 当前可装 | 覆盖哪些项 | 缺什么 |
|---|---|---|---|---|---|
| 1 | **dsh-period-report** | 3/5 | ✅ | token · 内容汇总 · 活跃时间段 · 定时投递 | 天气、dsh 进程启停、系统性用户分析 |
| 2 | **dsh-whale-report** | 3/5 | ✅ | token · 内容汇总 · 分析洞察 · 多格式导出 | 天气、dsh 启停、单插件无定时 |
| 3 | dsh-workload-report | 2.5/5 | ❌ 需 DSH ≥0.2.1 | token · 活跃时长 · **真正的用户分析报告** | 天气、dsh 启停、内容汇总 |
| 4 | dsh-morning-paper | 2.5/5 | ❌ 需 DSH ≥0.1.2-alpha.1 | token · 内容汇总 · 单会话复盘 | 天气、dsh 启停、跨会话分析 |
| 5 | @weibaohui/dsh-dashboard | 2.5/5 | ❌ 需 DSH ≥0.1.7-rc.2 | token · 工作时段 · 7 张洞察卡 | 天气、dsh 启停、定时、内容文本 |
| 6 | dsh-schedule-calendar | 2/5 | ❌ 需 DSH ≥0.2.2 + better-sidebar | **天气** · 日报周报 | token、dsh 启停、dsh 会话内容 |
| 7 | xiangshu2026/dsh-scheduled-reports | 2/5 | ❓ 非标准插件 | 内容汇总 · 定时 Word 报告 | 天气、token、dsh 启停（只有开机时长） |
| 8 | dsh-profile-stats | 1.5/5 | ❌ 需 DSH ≥0.2.1-rc.5 | token 深度分析 | 其余全部 |
| 9 | dsh-daily-brief | 1/5 | ❓ | 内容汇总（外部信息流） | 天气、token、启停、分析 |
| 10 | dsh_setting_pro / dsh-restart | 1/5 | ❓ | **dsh 启动时间 + 运行时长** | 其余全部 |
| 11 | dsh-tool-weather / dsh-weather-panel | 1/5 | ✅ / ❓ | **天气** | 其余全部 |

**需要额外插件或脚本补齐的项（汇总）**：

- **天气** → 任何候选都不自带，必须额外装天气插件（`dsh-tool-weather` 兼容性最好）
- **dsh 启停时间** → 必须额外装（`dsh_setting_pro` / `dsh-restart`）；**「关闭时间」没有插件直接采集**，需从 `bootId` 变化或进程日志自行推算
- **用户分析报告** → 若坚持要 dsh-period-report / dsh-whale-report 的路子，得升级到能装 `dsh-workload-report` 才有成体系的画像
- **跨插件合并成一份简报** → 没有任何插件做这件事，必须自己写脚本/Skill

---

## 4. 没有完全匹配时的替代 / 组合方案

### 方案 A：不升级 DSH，两个插件 + 一个天气补件（**推荐**）

```
dsh plugin --profile web add "github:SenmuuuuW/dsh-whale-report"   # token + 内容 + 8 条洞察 + PDF/PNG/HTML
dsh plugin --profile web add github:Roykf/dsh-tool-weather          # 天气（模型可调用）
# 可选：启停时间
dsh plugin --profile web add github:dongasai/dsh_setting_pro#0.12   # 最后启动时间 + 已运行时长
```
再加一份简短的 Skill / 定时任务，让 agent 调 `whale_report` → `weather` → 读 bootId，拼成一份 markdown。

- **能拿到**：token 用量 ✅、内容汇总 ✅、分析洞察 ✅（8 条确定性规则 + 建议）、天气 ✅、启动时间 ✅
- **差距**：① 三份数据不互通，合并靠脚本；② **关闭时间仍然缺**（只有「最近一次启动时间」和「已运行时长」，退出时刻无记录）；③ 「用户分析」是 DeepTrace 的 8 条确定性洞察，不是 workload-report 那种成体系的画像报告；④ 无内建定时投递

### 方案 B：升级 DSH 到 0.2.x，走「画像 + 天气」

```
dsh plugin --profile web add dsh-workload-report       # token + 活跃时长 + AI 用户画像 + HTML 报告
dsh plugin --profile web add dsh-schedule-calendar      # 天气 + 日报周报（需先装 dsh-better-sidebar）
```
- **能拿到**：质量最高的「用户分析报告」+ 天气
- **差距**：仍需升级内核；`dsh-workload-report` 的 AI 画像**明确不读会话内容**，所以「内容汇总」依然缺；启停仍是净活跃时长，非进程启停

### 方案 C：零插件，用 DSH 内置能力拼（**最贴近「不用开发」的本意**）

本机已具备：`schedule_create`（定时任务投递到本会话）、`weather` 工具、`token-meter` / 会话日志（token 用量）、`dsh` 会话记录（内容）、以及能写报告的 agent。

```
schedule_create: 每天 08:00 → 提示本会话「生成今日简报：天气(weather) + 昨日 token 用量 +
dsh 启动/运行时长 + 昨日会话要点 + 一段使用习惯分析」
```
- **能拿到**：五项全部（含关闭时间可由你或脚本在启动时记录上一进程退出时刻）
- **代价**：这不是「装插件」，而是「配一个定时提示」；报告的一致性和口径取决于提示词质量，没有插件的确定性保证

### 差距总结（为什么没有「直接用」的答案）

1. **天气与 token 用量在插件品类上互斥**：天气插件都是 UI 挂件（顶栏 chip / 侧边栏面板 / 桌宠），token 插件都是 usage 面板。全索引 10,119 条里，同时命中「天气」和「token 用量」的只有主题类插件的误命中（`token` 指设计令牌）。
2. **「dsh 启停时间」从未被当作日报数据源**：存在的只是 `dsh_setting_pro` / `dsh-restart` / `dsh-instance-manager` 的「启动时间 + 运行时长」展示，以及关机类插件的「任务完成自动关机」。**没有任何插件采集并记录 dsh 的关闭时刻。**
3. **五项合一的「每日简报」产物不存在**。名字最像的 `dsh-daily-brief` 内容是外部信息流，与 dsh 用量零交集。
4. **兼容性是硬约束**：功能最对口的 4 个（workload-report / schedule-calendar / morning-paper / dashboard）都要求比本机 0.1.1-rc.2 更新的内核。

---

## 5. 不确定与未覆盖项（明确标注）

- ❓ **`dsh-daily-brief` 在本机能否装成功未验证**。它未声明 `engines.dsh` 或 peer，2026-11-10 才发第 2 版；且依赖 `imapflow` / `node-ical` / `mailparser` / `nodemailer` / `fast-xml-parser` / `node-html-parser` 六个运行时依赖。未实测安装。
- ❓ **`dsh_setting_pro` / `dsh-restart` / `dsh-instance-manager` 的实际兼容性未验证**：npm registry 上无 `dsh_setting_pro` 这个名字（404），它们走 github / 本地目录安装，package.json 里的约束未逐一核对。
- ❓ **npm 侧检索是抽样而非全集**：`registry.npmjs.org` 对 `keywords:dsh-plugin` 报 total≈14005，搜索 API 最多只能翻到约 2500 条。因此**不能断言「npm 上不存在其他每日简报类插件」**；GitHub 另有 4 条 query 因 403 限流失败（token 维度、中文「每日简报」），这两块覆盖有缺口。
- ❓ **`dsh.directory` 是否永久停机不确定**：只确认检索当下 http 302 后不可达、https 不通、另一路拿到域名停放页。
- ❓ **`dsh-workload-report` 为何不在 awesome 主索引**（按 owner `tableau` 检索 0 命中）未查明，可能是收录延迟或未提交。
- 未核实的空白：我没有实际安装任何插件，所有「兼容/不兼容」判断来自 `engines` / `peerDependencies` 声明与本机版本的静态比对，不是运行验证。

---

## 6. 一句话回答

**没有能直接装好就用的方案。** 若接受「大部分能覆盖、剩下靠补件和脚本」，在**不升级内核**的前提下最实用的是 `dsh-whale-report`（token + 内容 + 分析洞察，且 peer 基线正好是 0.1.1-rc.2）+ 一个天气插件 + `dsh_setting_pro`；若愿意升级到 DSH 0.2.x，`dsh-workload-report` 是唯一提供成体系「用户分析报告」的插件，但它与启停、天气、内容仍不重叠。真正五项齐全只能走第 4 节的组合方案 C。
