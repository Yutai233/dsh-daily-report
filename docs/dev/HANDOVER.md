# dsh-daily-report 交接说明（第一期~第三期）

> 写于 2026-11-12。本文档用于**换会话 / 换模型继续开发**时的交接。
> 上一轮工作实际完成于 `mirrocoding-claude/claude-opus-5-5`（主体）、`mirrocoding/gpt-6.1-sol`（渲染器）与 `deepseek-official/deepseek-flash`（心跳/天气/成本、空闲采样）。
>
> 设计依据：[DESIGN.md](DESIGN.md)（原「功能设计方案」）
> 前置调研：[RESEARCH.md](RESEARCH.md)（原「插件检索报告」）
>
> **归档说明**：本文是历史开发记录，写于工作区语境。文中的 `<workspace>` 指当时的工作区根目录，`<repo>` 指插件仓库根目录；所有 `plugin/…` 形式的路径都相对于工作区根，即等价于本仓库根目录下的同名路径（`plugin/lib/…` → `lib/…`、`plugin/test/…` → `test/…`）。工作区里的 `_research/` 调研物料目录**不在本仓库中**（体积过大，未随仓库发布）。

---

## 0. 当前状态一句话

插件一到三期及本轮收尾代码已完成，**40 项自动化测试通过，前端已重新构建，已在当前 profile 关闭再启用且管理器返回 applied**。新增报告保存目录设置，以及 DSH 原生尺寸/字体/强调蓝/动效的完整报告重设计。当前工具 `daily_report` 已在真实 Host 成功调用，并按用户明确授权做过一次真实云端日报生成。真实桌面逐按钮验收仍有边界，见 §5。

⚠️ 隐私模式经只读检查仍是 **A · 云端模型摘要**。本轮用户明确允许“一次真实云端摘要”用于验收，已执行；**没有修改隐私模式、键鼠采样或报告路径等用户配置**。后续是否继续使用 A 仍由用户在设置中决定；默认新配置是 `local-only`。

---

## 1. 代码位置

插件本体在工作区 `plugin/` 目录（即本仓库根目录），通过 pnpm link 装进 profile：

```
<workspace>\
├─ dsh-每日简报-功能设计方案.md      # 设计稿（归档为 docs/dev/DESIGN.md）
├─ dsh-每日简报-插件检索报告.md      # 前期调研（归档为 docs/dev/RESEARCH.md）
├─ dsh-daily-report-交接说明.md      # ← 本文档（归档为 docs/dev/HANDOVER.md）
├─ _research\                        # 调研物料 + dsh-src（解包的 DSH 源码，体积大，可删）；该目录不在本仓库中（体积过大，未随仓库发布）
└─ plugin\                           # 插件本体（dsh-daily-report@0.3.0）
   ├─ package.json                   # dsh.bundle / dsh.client 声明
   ├─ cordis.patch.yml               # 向 profile 插入插件行
   ├─ CONTRACT.md                    # ★ 数据契约：DayFacts / Report / 各模块签名
   ├─ lib\
   │  ├─ index.js                    # Host 入口：RPC、定时、心跳、工具、systemPrompt
   │  ├─ config.js                   # 设置 schema + 校验/夹取 + ConfigStore
   │  ├─ store.js                    # facts / reports / state 落盘
   │  ├─ engine.js                   # 采集→摘要→分析→渲染→落盘 流水线
   │  ├─ summarize.js                # 分层摘要 + 缓存 + 三种隐私模式
   │  ├─ util.js                     # 时间/格式化/原子写/JSONL 等
   │  ├─ collect\
   │  │  ├─ sessions.js              # 会话日志 → DayFacts（核心，最复杂）
   │  │  ├─ heartbeat.js             # dsh 启停心跳
   │  │  ├─ weather.js               # Open-Meteo 天气（含 AQI、tips）
   │  │  ├─ idle.js                  # Windows 键鼠空闲采样
   │  │  └─ rawlog.js                # 裸日志读取适配器（测试/离线用）
   │  ├─ analyze\
   │  │  ├─ cost.js                  # 成本/峰谷/缓存命中/最贵一轮
   │  │  ├─ health.js                # 健康提醒（只提醒不诊断）
   │  │  └─ report.js                # DayFacts → Report（含 7 日对比、周/月报）
   │  └─ render\
   │     ├─ html.js                  # 单文件 HTML（无脚本无外链，三层折叠）
   │     └─ markdown.js              # Markdown 归档
   ├─ client\
   │  ├─ client-source.js            # ★ 前端：鲸鱼弹窗 + 设置页 + 报告查看器
   │  ├─ ui.css                      # 前端样式（全部走 DSH 设计变量）
   │  ├─ fish-paths.js               # 抄自 DSH 的鲸鱼摆尾动画路径
   │  ├─ build.mjs                   # 打包成 client.js（无依赖）
   │  └─ client.js                   # 构建产物（改了 source 要重新 build）
   └─ test\                          # 24 个测试 + 样例 + 截图
```

### 已安装状态

- profile：`%USERPROFILE%\.dsh\profiles\desktop\package.json` 里已加入 `"dsh-daily-report": "link:<repo>"` 和 `dsh.profile.bundles` 列表项。
- 插件管理里显示为启用，`~/.dsh/dsh-daily-report/` 下已有 `heartbeat/`、`facts/`、`reports/`、`state.json`，说明 Host 已实际挂载并在跑。

---

## 2. 已实现的功能（对照设计方案）

| 设计稿要求 | 实现情况 |
|---|---|
| 正文摘要：分层（事实包 → 每会话 1~2 句 → 当日一句话）+ 按 `sessionId + seq` 缓存 | ✅ `collect/sessions.js` 抽事实包（用户消息原文、每轮最后一条助手回复、改动文件、失败、未完成 todo），`summarize.js` 出句子并落 `cache/summaries.json` |
| 工具统计：次数/失败率/耗时 p50-p90/命令分类/文件热度/域名/审批等待/输出速度 | ✅ 全部实现，见 `analyze/report.js` 的 `sections.tools` |
| 三层呈现（30 秒 / 3 分钟 / 按需） | ✅ HTML 与 Markdown 均为三层，第 1 层常显，第 2 层折叠，附录默认折叠 |
| 「只写有变化的内容」 | ✅ section 为 null 就不渲染；无异常时健康段不出现 |
| 「数字由代码算，模型只写文字」 | ✅ 统计全在代码里，模型只拿到事实包写句子 |
| 指标带参照（近 7 天对比 ▲▼） | ✅ `usage.rows[].delta/trend` + 7 天内联 SVG 迷你柱状图 |
| 健康：Windows 键鼠空闲采样、久坐段、不诊断只提醒、可一键关闭 | ✅ `collect/idle.js` + `analyze/health.js`；默认关闭，设置里可开；无采样时退化为 DSH 消息粗估并注明 |
| dsh 启停心跳（不依赖退出钩子） | ✅ `collect/heartbeat.js`，每分钟一条 JSONL，下次启动把最后心跳当关闭时间 |
| 天气（Open-Meteo，只在需要注意时出声） | ✅ 已真实联网测试（上海：毛毛雨、降水 94%、AQI 161 → 带伞 + 少开窗） |
| 成本与省钱建议（缓存命中率、峰谷占比、最贵一轮） | ✅ `analyze/cost.js` |
| 明日待续（未完成 todo + 被中断轮次） | ✅ 进第 1 层计数与第 2 层列表 |
| 周报 / 月报 | ✅ 同一套数据换窗口，按 ISO 周/自然月聚合，含每天小表与柱状图 |
| **第 8 节三个问题 → 做成用户设置** | ✅ 设置 → 每日简报：隐私边界（A/B/C 三选一，含摘要模型选择、本地模型地址/模型名/Key/测试连接）、键鼠采样开关（非 Windows 置灰）、投递时机（固定时间 / 首次打开 / 两者并存）+ 时间 + 报告覆盖哪天 |
| 弹窗位置：从 P1 欢迎页 logo 上方弹出 | ✅ 接管 `conversation.hero.brand.mark` 槽位，在鲸鱼正上方弹出卡片（保留原摆尾动画），每天自动弹一次，点鲸鱼随时可再开 |
| 前端风格参考 DSH 本身 | ✅ 全部用 `--dsw-alias-*` 设计变量（深/浅色自动跟随），按钮/切换器/输入框尺寸与原生一致；导出的 HTML 也换成 DSH 实际色值 |

### 其他已实现的设置项

天气城市（含地名搜索选择）、启停心跳开关、是否统计子代理会话、健康提醒阈值（久坐分钟数、熬夜时刻）、每日预算（金额）、四类 token 单价与谷时折扣、保留天数、周报/月报开关、报告列表与「生成日报 / 本周周报 / 本月月报」按钮、浏览器打开 / 查看报告。

---

## 3. 关键实现约定（接手必读）

- **接口契约以 [CONTRACT.md](<../../CONTRACT.md>) 为准**：`DayFacts`（§2）、各模块签名（§3）、`Report` 结构（§4）、渲染规则（§5）。改数据形状先改契约。
- **数据落盘**：`~/.dsh/dsh-daily-report/`
  - `config.json`（0600）、`state.json`
  - `heartbeat/YYYY-MM-DD.jsonl`、`idle/YYYY-MM-DD.jsonl`
  - `facts/YYYY-MM-DD.json`、`reports/{daily,weekly,monthly}/<key>.{md,html,json}`
  - `cache/summaries.json`、`cache/weather.json`
- **隐私三档**（`config.privacy`）：
  - `cloud` → `ctx.llm.stream`（默认跟随 `agentDefaultModel.currentSelection()`，可指定 provider/model）
  - `local-only`（默认）→ 不调用模型，模板句
  - `local-model` → 本机 OpenAI 兼容服务；**强制回环地址**（`allowLan` 才能用局域网），失败**不会**回退云端
- **前端改完必须**：`node client/build.mjs` 生成 `client.js` → 在插件管理里把 dsh-daily-report **关掉再打开**（HMR 只在 `pnpm run dev:web` 时自动刷新）。
- **Host 端 RPC**：`POST /api/daily-report/<method>`，方法有 `state / config / generate / report / dismiss / geocode / models / probe / open / prune`，仅 owner 可调（`connection.admit` + principal 校验）。
- **模型工具 `daily_report`**：直接注册 Host 标准 ToolDefinition（完整 JSON Schema + 参数校验），不依赖 link 路径解析 `@deepseek-ai/dsh-tools`。失败通过 `toolAvailable/toolError` 与日志显式诊断。
- **测试命令**（node 用运行时自带的）：

```powershell
$n="$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
cd plugin
& $n --test --test-timeout=300000 "test/*.test.mjs"      # 40 pass
& $n client/build.mjs                                     # 重新打包前端
```

测试文件：`test/core.test.mjs`（采集/摘要/报告/配置）、`test/host.test.mjs`（mock ctx 的 RPC 全链路）、`test/render.test.mjs`（HTML/Markdown/脱敏）、`test/easy.test.mjs`（心跳/天气/成本）、`test/idle.test.mjs`（空闲采样）。

---

## 4. 真机验证记录

- 用真实日志跑通日报：2026-11-10 → 7 个会话 / 502 次工具 / 6028 万 tokens / 约 ¥14.23；2026-11-12 → 7 个会话 / 611 次工具 / 7404 万 tokens / 约 ¥26.12，天气、健康提醒正常出现。
- 周报：2026-W45（11/02–11/08）→ 19 个会话 / 2148 次工具 / 3.2 亿 tokens / 约 ¥77.99。
- 真实 DSH 窗口截图（在 `plugin/test/out/`）：
  - `live-hero3.png`：鲸鱼已接管，图标与原生一致
  - `live-card.png`：卡片在「探索未至之境」上方弹出，配色与 DSH 原生面板一致
  - `live-settings2/3.png`：设置 → 每日简报，隐私边界三项与开关样式
- 系统通知（Windows Toast）已实现但**未实测弹窗**。

---

## 5. 本轮收尾结果与剩余人工验收

### 已完成

1. **空日回退**：自动日期在保留期内选最近有真实活动的日期，排除空会话和未启用的子代理；显式 `date` 不回退。卡片有 `fallbackNote`。解析只读日志、不调用模型；读取失败不会伪装成无活动。
2. **文档和许可**：补齐 `plugin/README.md`、MIT `plugin/LICENSE`、`plugin/.gitignore`。仅忽略调试产物，保留冒烟脚本、截图与 `_research`（该调研物料目录不在本仓库中，体积过大，未随仓库发布），没有破坏性删除。
3. **报告保存目录**：设置页「报告 → 报告保存目录」提供路径输入、保存、恢复默认。`config.reportsDir` 空值默认 `DATA_DIR/reports`；生成/列表/读取/打开/工具/清理一致跟随。旧报告不迁移、不删除，事实与采样不搬家；路径允许中文与空格，拒绝相对路径。
4. **完整报告重设计**：查看器采用原生设置窗 `width:800px`、高度 `min(800px, calc(100vh - 2 * max(24px, var(--dsh-frame-overlay-top,24px))))`、圆角 28px 及同原生移动端规则。字体与强调蓝使用真实 DSH 变量，主题值注入 sandbox。正文有摘要、首屏 KPI/图表、时间线及阅读深度提示，加入淡入/悬停/展开 CSS 动效并支持减少动态效果。旧 JSON 在查看/打开时可用新版皮肤重渲染，不需重新调用模型。
5. **前端可靠性**：长路径/数字/报告列表支持窄宽度；空报告、RPC、打开失败不再静默；保留 `sandbox=""` 并增加 CSP、焦点恢复、背景 inert；修复数字空串变 0、夹取不回显等问题。
6. **生成与周期**：修复生成队列不释放、失败 promise 未处理、定时失败不重试；当前周/月报刷新今天事实，避免漏掉今天或沿用早些时候快照。
7. **工具与探针**：不再从 link 实路径动态 import Host 私有 `defineTool`；直接注册标准 ToolDefinition，包含 JSON Schema 和参数运行时校验，设置页显示注册诊断。**真实 `daily_report` 工具调用成功**；本机 HTTP 合成服务的 `probe` 成功路径已验证，未触碰用户本地模型设置。本地模型另防伪回环域名、非 HTTP(S) 与外部重定向。
8. **天气与通知**：明确天气的实际日期（是生成当天，不是重新打开归档当天）；Windows WinRT 实测返回 `{ok:true,status:'submitted'}`，只能证明提交成功，不能证明用户看见。

### 验收记录

- 最终命令：`node --test --test-timeout=300000 "test/*.test.mjs"` → **40/40 pass**；`node client/build.mjs` → 当前产物 **57758 bytes**。
- `node test/ui-smoke-client.mjs`：320/375/520/900 设置布局不越界；sandbox/CSP、details、焦点/inert；桌面 800×800 / 28px 尺寸和 reduced-motion 通过。它是合成 DOM 适配器，不等于真实 React 集成。
- `node test/report-visual.mjs`：light/dark ×800/320 ×daily/weekly/monthly/empty 共16组合，通过默认/展开无横向溢出、无网络请求、主题变量覆盖与减少动态效果检查。
- 一次真实云端验收：`daily_report(kind:'daily', date:'2026-11-10', regenerate:true)` 成功，报告落原归档目录，未变更任何隐私配置。
- 插件管理：`include:dsh-daily-report` 关闭再开启，两次返回 `application:'applied'`。这不等于已经在真实窗口逐项截图；如果旧页面仍缓存，用户需刷新当前 GUI。

### 仍需人工确认（不要写成已完成真机验收）

- 新版设置下半部、目录输入与完整报告在**真实 DSH 窗口**逐项截图；本轮未取得认证的 GUI 浏览器会话（裸 HTTP 为401），没有绕过认证，也没有启动替代服务器。
- 实际点击「本周周报／本月月报／浏览器打开」和用户真实本地模型服务的 probe。对应 RPC、按钮线路、合成服务均有自动测试，但不等于实际窗口点击通过。
- Windows 通知是否可见、通知中心是否保留；正式发行仍可考虑自己的 AUMID/快捷方式。
- macOS/Linux 以及其他 DSH 版本的兼容矩阵。

---

### 最新反馈：收敛动效

- 查看器记录点击按钮的即时位置，280ms 从按钮矩形展开，200ms 回收到仍可见的实际按钮；正文保持最终布局宽度，不缩放文字、不弹簧回弹。关闭／Escape／遮罩共用生命周期，卸载、重复关闭、窗口重排、原按钮消失和减少动态效果都有回退。
- 移除报告正文自动入场、章节错峰、内容淡入上移、悬停抬升、Hero 渐变等装饰，只保留用户操作触发的 `details::details-content` 高度展开收起与箭头旋转；不支持的浏览器保留原生折叠，无脚本、sandbox/CSP 不变。
- 删除蓝色标题上方“DSH 活动报告”小字及其样式。
- 用户随后要求撤销鲸鱼淡入淡出：已恢复单层SVG，移入即时摆尾、移开即时停止；不保留交叉透明度与延迟停止。详细报告按钮开合、内部条目动效及删除标题小字均保留。`test/fish-motion.mjs` 已改为校验原始悬停行为。
- 后续修复正文“往下跳”：外壳保持原280ms展开轨迹，正文在外壳移动期间隐藏，到位后120ms原位显现；加载提示脱离文档流，移除时不再改变iframe位置。浏览器逐帧测试覆盖正文显示后坐标固定、加载提示移除前后iframe几何不变。
- 更新构建：`client.js` 64369 bytes；完整测试 **42/42 pass**。`test/viewer-motion.mjs` 在实际 Edge 中逐帧核验按钮起点、动态回收终点、固定文字布局、快速关闭、卸载、resize及减少动态效果；现有安全/焦点/宽窄屏冒烟亦通过。

## 6. 已知取舍与注意事项

- 卡片自动弹出依赖 `state.cardDismissedFor` 与 `morningDoneFor`；同一天再次点鲸鱼仍可打开，跨天会重新弹。
- 摘要缓存键含 `date + lastSeq + mode`，改隐私模式会让缓存失效重算（符合预期）。
- 成本是**估算**，单价来自设置里可改的价目表，不是账单。
- 健康提醒在未开键鼠采样时只用 DSH 消息时间粗估，文案会注明；不要把粗估结果说成实测。
- 隐私相关设置**不要替用户改**。本轮已确认现有 `cloud` 模式并获得一次云端验收授权，未修改用户配置；最终文件校验与验收前一致。后续使用模式仍由用户自己决定。
