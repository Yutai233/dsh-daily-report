# dsh-daily-report · DSH 每日简报

把本机的 DSH 会话整理成一份能快速读完的简报：今天做了哪些事、用了多少 token、花了多少钱、哪里卡住、明天接着做什么，以及天气、dsh 启停时间和作息提醒。

- 版本：`0.3.0` · MIT · 作者：Yutai233
- 运行环境：DSH `>= 0.2.2-rc.1`；开发需要 Node `>= 22.15`
- 运行时零第三方依赖（只用 `node:*` 内置模块与全局 `fetch`）
- 默认隐私档为 **B · 仅标题 + 统计**：不调用模型，会话正文不出本机

> 这是完整文档。项目仍在开发中，快速上手见 [README](../README.md)，尚未逐项验收的边界见文末「已知边界」。

---

## 目录

- [它做什么](#它做什么)
- [用法](#用法)
- [安装](#安装)
- [隐私边界](#隐私边界)
- [数据目录与敏感输出](#数据目录与敏感输出)
- [界面截图](#界面截图)
- [构建与测试](#构建与测试)
- [已知边界（真实桌面验收）](#已知边界真实桌面验收)
- [开发结构](#开发结构)
- [License](#license)

---

## 它做什么

| 能力 | 说明 |
|---|---|
| 早晨卡片 | 在 DSH 新会话页「探索未至之境」的鲸鱼 logo 上方弹出；展示完整摘要、与完整报告一致的全部待续和用量小图，待续默认显示前三条，其余在列表内滚动；新日报未查看时鲸鱼摆尾并显示小点；每天自动弹一次，点鲸鱼可随时再开 |
| 三层日报 | 第一层 30 秒（天气 / 启停 / 总量 / 完整一句话 / 提醒，三项关键指标紧凑横排），第二层约 3 分钟（待续、用量、工具、卡点、健康，待续置顶），第三层附录（逐会话、命令、原始数据） |
| 正文摘要 | 先把会话压缩成「事实包」，再写每会话 1~2 句和当日一句话；按会话与事件序号缓存，旧会话不重复花钱 |
| 工具统计 | 调用排行、失败次数、p50/p90 耗时、命令分类、改动文件热度、访问域名、审批等待、输出速度、交付物 |
| 成本与省钱 | token 用量、花费估算、缓存命中率、峰谷占比、最贵一轮、每日预算提醒；单价可在设置里改 |
| 近 7 天对比 | 指标带 ▲▼，并附 7 天的内联 SVG 迷你柱状图（默认折叠在首层卡片里，点一下展开） |
| 卡点 | 失败工具、失败命令、LLM 重试、被中断/错误轮次、反复改同一文件、方向纠正比例（仅供参考） |
| 明日待续 | 未完成 todo 与被打断的轮次自动进入下一份简报 |
| 健康提醒 | Windows 键鼠空闲采样（可选）→ 久坐段、熬夜、午休没离开、周末加班；只提醒，不做医学判断 |
| 启停心跳 | 每分钟写一条心跳，下次启动把最后一条心跳当作关闭时间；崩溃、强关也不丢 |
| 天气 | Open-Meteo，免费无 Key；只在下雨/雪、明显降温、空气差、高温、结冰时出声 |
| 周报 / 月报 | 同一套数据换窗口，按 ISO 周和自然月聚合；含每天小表与柱状图 |
| 给 agent 读 | Markdown 全量落盘；可选注册 `daily_report` 工具，直接问「昨天做了什么」「上周三我修了什么」 |

报告遵守两条规则：**数字由代码计算，模型只负责写文字**；**没有变化的段落不渲染**。

---

## 用法

### 打开简报

1. 打开 DSH 的新会话页，鲸鱼 logo 上方会出现当天卡片（若已开启弹窗）。
2. 有报告时，点击鲸鱼可打开或收起卡片；鲸鱼旁的圆点表示「今天还没看过」。
3. 卡片上的「查看完整报告」在 DSH 内打开完整日报，查看器里还可以「打开 Markdown」或用系统浏览器打开；设置页的报告列表也提供「查看」和「浏览器打开」。
4. 设置 → **每日简报** 可以生成日报、本周周报、本月月报，也可以查看历史报告。

### 断点续工与每日意外发现

- 卡片与 DSH 内完整报告的「明日待续」列表，在每项文字后提供「相关会话」按钮，回到来源会话继续处理。日报、周报、月报保留来源 ID；老报告没有记录 ID 时只显示原文字，不猜链接。跳转失败会保留报告并显示错误。
- 「每日意外发现」在卡片与完整报告总览下方、明日待续上方展示。模型只在当天摘要中发现有明确依据、有新意的小观察时才写，例如值得自动化的重复摩擦；不重复总结、待办、成本与健康提醒，不强求每天都有。
- 发现与现有总摘要合并为一次模型请求，最多 180 字。沿用用户所选摘要模式，不自动改变设置；仅统计、模型不可用或失败时不展示，不生成模板填充。历史报告需重新生成才会判断发现，重新打开不会调用模型。
- 来源按钮在 DSH 内生效；导出的离线 HTML 保持无脚本，不显示无效按钮，Markdown 归档保留来源会话 ID 供追溯。查看器只在有来源时启用受 nonce/CSP 限制的点击桥，保持隔离且禁止原报告脚本、网络、弹窗及顶层导航。

### 生成时机

- **两者并存**（默认）：固定时间到点生成并落盘，同时每天首次打开 DSH 时检查一次。
- **固定时间**：默认 `09:00`，到点生成；开启「系统通知」时会发系统通知。
- **首次打开**：DSH 启动后约 8 秒检查并生成；关机期间不会错过。
- 同一天不会重复弹卡片；跨天后重新弹。

### 报告覆盖哪一天

- **自动**（默认）：本地时间 18:00 前统计昨天，18:00 后统计今天；如果目标日没有任何活动会话，会回退到保留期内最近一个有活动的日期，卡片上会显示「某日没有新会话，显示最近有活动的某日」的提示。保留期内完全没有活动时仍显示目标日。
- **昨天** / **今天**：把目标日固定为昨天/今天；如果该日没有活动，自动生成同样会回退到最近有活动的日期。只有显式传入 `date` 的生成（工具/RPC）不回退。
- 周报默认在周一生成上一周；月报默认在每月 1 日生成上个月。设置页的「本周周报 / 本月月报」按钮取当前周期。
- 第一层天气取**生成报告时的当天**，用来提醒带伞/添衣；用「天气 MM-DD」标出实际日期。重新打开旧归档不会重新拉天气，因此统计日、天气日和查看日可能不同。

### 更改报告保存位置

在 **设置 → 每日简报 → 报告 → 报告保存目录** 填写绝对路径，点击「保存目录」。留空或点击「恢复默认目录」使用默认的 `~/.dsh/dsh-daily-report/reports`。日报、周报、月报分别存到选定目录下的 `daily`、`weekly`、`monthly` 子目录，历史列表、查看、浏览器打开和 agent 工具一起跟随设置。含中文或空格的路径可用。

此操作**不搬移或删除旧报告**，列表只显示当前目录的报告；改回原路径即可重新看到原归档。采样、事实库、缓存、配置仍留在原数据目录。选择云同步/共享目录可能让报告被同步或共享，请自行确认。

### 让 agent 回答「我昨天做了什么」

- 本机已注入一段系统提示，agent 知道可以使用 `daily_report` 工具：
  - `kind`: `daily | weekly | monthly`
  - `date`: `YYYY-MM-DD`
  - `current`: 周/月报取当前周期
  - `regenerate`: 强制重新生成
- 日报在未强制重新生成且日期早于今天时，优先读取已保存的 Markdown。
- `date` 省略时自动选择日期（目标日没有活动会回退到最近有活动的日期）；显式指定 `date` 时按该日期生成，不回退。
- 工具注册直接使用 Host 的 ToolDefinition 形状；如果 `tools.register` 抛错，`state` 会返回 `toolAvailable: false` 和 `toolError`，设置页「报告 → Agent 工具状态」会显示可用/不可用/未知。报告仍然生成并落盘，agent 可直接读取 `~/.dsh/dsh-daily-report/reports/**/*.md`。
- 插件不会替用户修改设置；隐私档位只由用户在设置页选择。

### 设置项一览

| 分组 | 内容 |
|---|---|
| 隐私边界 | B 仅标题 + 统计（默认，推荐）、A 云端模型摘要（可跟随 DSH 默认模型或指定模型）、C 本地模型摘要（OpenAI 兼容地址 / 模型名 / Key / 测试连接） |
| 健康与作息 | 键鼠空闲采样开关（仅 Windows 生效）、健康提醒开关、久坐分钟数、熬夜时刻 |
| 投递时机 | 固定时间 / 首次打开 / 两者并存、固定时间、报告覆盖日、欢迎页弹窗、系统通知、周报 / 月报开关 |
| 数据来源 | 天气城市搜索（Open-Meteo）、启停心跳、是否统计子代理会话 |
| 成本与预算 | 每日预算、输入/输出/缓存读/缓存写单价；谷时时段与折扣目前只展示（由配置/默认值决定），设置页没有编辑入口 |
| 报告 | 生成按钮、Agent 工具状态、报告保存目录、日报/周报/月报历史、保留天数 |

默认值（节选）：隐私 `local-only`、键鼠采样关、健康提醒开（无采样时为粗估）、投递 `both`、固定时间 `09:00`、天气开但需先填城市、心跳开、子代理不计、预算 0（不设）、保留 180 天。

---

## 安装

本插件**没有发布到 npm registry**，不能按包名从市场安装。它通过本地目录安装，开发安装应使用 `link:` 依赖。

### 前置条件

- DSH Desktop（插件依赖 Host 的 `sessionQuery`、`connection`、`tools`、`systemPrompt` 服务）。
- 本插件要求 DSH `>= 0.2.2-rc.1`（见 `package.json` 的 `engines.dsh`）。
- Node `>= 22.15` 仅用于构建前端和跑测试，插件运行时由 DSH 提供。

### 方式一：插件管理（推荐）

1. 打开 DSH 左侧的 **插件** 页。
2. 点 **添加插件**，在包名输入框填入本仓库的**绝对路径**（`plugin` 目录就是你 clone 下来的仓库根目录），例如：
   `E:\path\to\dsh-daily-report\plugin`
3. 安装完成后点 **立即启用**；没有开启 HMR 时重启 DSH。
4. 打开 **设置 → 每日简报**，确认页面出现；`%USERPROFILE%\.dsh\dsh-daily-report\` 开始产生数据即表示 Host 已挂载。

安装后可在 `%USERPROFILE%\.dsh\profiles\desktop\package.json` 核对两处：

```jsonc
{
  "dependencies": {
    "dsh-daily-report": "link:E:/path/to/dsh-daily-report/plugin"
  },
  "dsh": {
    "profile": {
      "bundles": [
        // …
        "dsh-daily-report"
      ]
    }
  }
}
```

本机当前就是这种 `link:` 安装方式。**请以 profile 里出现 `link:` 为准**：它表示链接到源码目录，改完 Host 代码重启/重新加载即可生效，不需要重新安装；前端源码仍需先构建 `client.js`。

### 方式二：开发 link（命令行）

Desktop 的 `desktop` profile 由 Desktop 管理，普通 npm 版 `dsh` 会拒绝操作它。请使用 Desktop 自带的命令运行时：

```powershell
& "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" `
  plugin --profile desktop add "link:E:/path/to/dsh-daily-report/plugin"
```

移除：

```powershell
& "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" `
  plugin --profile desktop remove dsh-daily-report
```

也可以由插件管理的「添加插件」完成同样的本地安装；不要手动把目录复制进 `node_modules`，也不要使用 `npm install dsh-daily-report`。

### 修改代码之后

- **Host 端**（`lib/**`）：重启 DSH。`link:` 安装的源码改动不保证被 HMR 监视；不要假设保存后一定自动生效。
- **前端**（`client/client-source.js`、`ui.css`、`fish-paths.js`）：先 `node client/build.mjs` 重新生成 `client/client.js`，再在插件管理里把插件关掉再打开（仅当 `pnpm run dev:web` 在运行时可自动刷新）。
- 链接安装的插件若被外部重新 link，可能需要重启进程才会重新加载。

---

## 隐私边界

隐私设置是**用户决定**，不是插件可以自行调整的运维参数。

### 三个档位

| 档位 | `config.privacy` | 会话正文是否离开本机 | 行为 |
|---|---|---|---|
| **B · 仅标题 + 统计**（默认，推荐） | `local-only` | 否 | 不调用任何模型；会话摘要由会话标题、改动文件、交付物、失败、待办等事实拼成模板句 |
| **A · 云端模型摘要** | `cloud` | 是 | 把压缩后的「事实包」发给 DSH 默认模型，或设置页指定的 provider/model；写 1~2 句摘要 |
| **C · 本地模型摘要** | `local-model` | 否（默认强制回环） | 把事实包发给本机 OpenAI 兼容服务（Ollama / LM Studio / llama.cpp 等） |

统计数字在三档下都由本机代码计算，模型只负责写文字。

### A 档具体发送什么

事实包按会话压缩，最多约 9000 字符，包含：

- 会话标题、工作区名
- 最近 12 条用户消息（有长度预算）
- 每轮最后一条助手回复（最多 8 条）
- 改动过的文件路径、交付物文件名
- 失败的工具/命令、未完成待办、被中断轮次数

**不发送**完整工具输出，也不发送中间推理文本。事实包只用于摘要，不写入 `facts/`；落盘的 `cache/summaries.json` 保存的是生成的摘要句。

A 档下，每个会话第一次生成摘要会把事实包发到所选模型；同一日期、且会话没有新事件时重新生成会命中缓存，不重复发送。缓存键包含日期、会话最后事件序号和模式，**换日期或切换隐私档都会重新计算**。

### C 档的约束

- 地址默认 `http://127.0.0.1:11434/v1`，只允许回环地址（`127.0.0.1`、`localhost`、`[::1]`）。
- 除非在配置里显式打开 `allowLan`，否则非回环地址会被拒绝；设置页没有这个开关，需要直接改 `config.json`。打开后由用户自行承担局域网暴露风险。
- 本地模型失败时退回 **B 的模板句**，**不会改用云端**。
- 设置页的「测试连接」会发一条极短的探针请求（只要求回复「好」）。

### 不会自动改隐私

- 插件没有后台自动切换档位，也没有「本地模型失败就改用云端」的回退逻辑。
- `daily_report` 工具只生成/读取报告，不能修改设置；系统提示也明确要求 agent 不要替用户改隐私相关设置。
- 安装或升级后，请自己到 **设置 → 每日简报** 核对当前档位；任何切换到 A 的决定都应由用户做出。
- A 档的模型调用会计入所选模型/账号的用量，费用由模型侧决定，插件只估算 DSH 自身的 token 成本。

---

## 数据目录与敏感输出

数据根目录：

```text
%USERPROFILE%\.dsh\dsh-daily-report\
```

可用环境变量 `DSH_DAILY_REPORT_DIR` 覆盖（测试和冒烟脚本会用它指向临时目录）。

| 路径 | 内容 | 何时产生 |
|---|---|---|
| `config.json` | 用户设置；写入时请求 `0600` 权限（Windows 下最终权限由文件系统决定） | 首次保存设置 |
| `state.json` | 卡片已读、上次生成日、morning 标记等 | 运行中 |
| `heartbeat/YYYY-MM-DD.jsonl` | 每分钟一条 `{bootId, t, kind}` | 心跳开启时 |
| `idle/YYYY-MM-DD.jsonl` | `{t, idleMs}`，只记录「多久没动」 | 键鼠采样开启且为 Windows |
| `facts/YYYY-MM-DD.json` | 当日事实（不含用户消息全文，不含事实包） | 生成日报时 |
| `reports/daily/YYYY-MM-DD.{md,html,json}` | 日报 | 生成时 |
| `reports/weekly/YYYY-Www.*`、`reports/monthly/YYYY-MM.*` | 周报 / 月报 | 生成时 |
| `cache/summaries.json` | 摘要缓存（生成的句子） | A/C 档成功调用模型后 |
| `cache/weather.json` | 天气缓存 | 拉取天气后 |

`reports/` 是默认报告位置。设置 → 每日简报 → 报告 → **报告保存目录** 可以填一个本机绝对路径，把日报/周报/月报移到别处；它只影响报告归档，`facts/`、采样和配置仍留在数据目录。旧报告不会自动搬移或删除，报告列表只显示当前目录。若把报告目录指向云同步或共享文件夹，报告内容也会被同步或共享。

DSH 自己的原始会话日志仍在 `~/.dsh/sessions/`，插件只读取、不复制。心跳只记录时间和启动批次；空闲采样只记录空闲毫秒数，**不记录按键内容、不截图、不上传**。

### 报告里有什么

报告会包含以下可能敏感的内容：

- 会话标题、摘要（A/C 档的摘要是模型基于事实包写的转述）
- 工作区、`cwd`、改动文件与交付物的绝对/相对路径
- 命令文本（每条截断到 160 字符，附录最多 50 条）、访问过的域名
- 未完成 todo 的文本、失败详情
- 统计数字与成本估算

分享 HTML 或截图前请先自己检查。渲染器支持脱敏：

```js
renderHtml(report, { redact: true })
```

脱敏会把路径、域名、命令等替换为 `***`，并在页脚标注「已脱敏」。**当前设置页还没有「导出脱敏版」按钮**，需要在代码里调用渲染器；不要误以为默认导出的 HTML 已经脱敏。

查看器把报告放进 `sandbox=""` 的 iframe，并注入禁止远程资源的 CSP；HTML 本身是单文件、无 `<script>`、无外链资源，但报告文本中仍可能出现敏感路径。

### 清理

- 默认保留 180 天。保留天数的清理会删除 `facts/`、`heartbeat/`、`idle/`、`reports/daily/` 中早于截止日的文件。
- **`cache/summaries.json`、周报、月报不会自动清理**，需要手动删除对应文件。
- 使用默认报告目录时，删除整个 `%USERPROFILE%\.dsh\dsh-daily-report\` 可重置插件数据，不会删除 DSH 会话日志；如果设置过自定义报告目录，那里的报告不会被一并删除，需要单独清理。
- `config.json` 里的本地模型 API Key 以明文保存（权限 0600），设置页只显示掩码；不要把该文件发给别人。

---

## 界面截图

README 的「界面预览」有四张图：`docs/images/card-welcome.png` 是欢迎页早晨卡片的**真实桌面截图**；另外三张（`demo-daily-light.png`、`demo-daily-dark.png`、`demo-weekly-light.png`）**全部由合成数据渲染**，可直接重新生成：

```powershell
node test/gen-docs-images.mjs              # playwright(msedge) 优先，失败时降级到 Edge CLI
node test/gen-docs-images.mjs --dry-run    # 只产出 HTML，不启动浏览器
```

脚本用 `test/fixtures/sample-report.mjs` 的样例数据（假路径 `E:\work\demo`）渲染 `lib/render/html.js`，内置体积与尺寸预算（单图 ≤1800px、≤500KB，三张合计 ≤1.5MB）和真实数据护栏（命中 `X:\Users\`、`AppData`、`.dsh\`、`test/out/` 即报错）。里面没有任何真实会话内容。

真实桌面验收截图只保存在 `test/out/`（已在 `.gitignore` 中忽略），它们来自本机会话，含本机工作区名、会话标题、代码片段和账号掩码，不适合随仓库公开。需要看真实界面时直接安装后打开；想生成自己的报告样例，可运行下面的 `test/e2e-real.mjs`。`test/out/` 里的 HTML 样例与截图都是本地调试产物，不属于发布包。

---

## 构建与测试

以下命令在 `plugin/` 目录执行。Node 可用系统的 `node`，也可用 DSH 自带的运行时：

```powershell
& "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" --version
```

### 构建前端

`client/client-source.js` 是模块加载器工厂里的片段，不能单独 `node --check`；构建脚本会在包裹后做语法检查：

```powershell
node client/build.mjs
# 或
pnpm build
```

输出会覆盖 `client/client.js`。`client.js` 是构建产物，发布或安装前请确认它已用当前 `client-source.js` 重新构建。改完前端后按[修改代码之后](#修改代码之后)重启或重新加载插件。

### 测试

```powershell
node --test --test-timeout=300000 "test/*.test.mjs"
# 或
pnpm test
```

测试文件：

- `test/core.test.mjs`：采集、摘要三档、报告、配置
- `test/engine.test.mjs`：目标日/18 点规则、空日回退、周期聚合刷新、通知与本地模型门槛
- `test/host.test.mjs`：mock Host ctx 的 RPC 全链路、生成与 dispose
- `test/render.test.mjs`：HTML/Markdown 渲染、转义、脱敏、空报告
- `test/client-ui.test.mjs`：前端错误可见性、数字输入夹取、Agent 工具状态、回退/天气标签
- `test/easy.test.mjs`：心跳、天气、成本；文件内是独立断言脚本，会打印 `ALL PASS`
- `test/idle.test.mjs`：空闲采样与久坐统计
- `test/fixtures/sample-report.mjs`：渲染测试用的样例数据

测试数据在正常隔离运行（默认，每个测试文件一个子进程）时落在系统临时目录（`core`/`host` 通过 `DSH_DAILY_REPORT_DIR`，其他测试用 `mkdtemp`），不读写真实日报数据；渲染测试会写 `test/out/sample-*.html`。真实键鼠采样测试只在 Windows 上运行，需要能启动 `powershell.exe`。

如果测试运行器在受限沙箱里报 `spawn EPERM`（为每个测试文件启动子进程被拦截），**不要**把整个 glob 一次性交给 `--test-isolation=none`：多个测试文件会共享模块缓存，先加载的 `util.js` 会固定 `DATA_DIR`，可能读到真实 `config.json`，甚至向真实数据目录写入。请逐个文件运行：

```powershell
foreach ($f in Get-ChildItem test/*.test.mjs) {
  node --test --test-isolation=none --test-timeout=300000 $f.FullName
}
```

### 冒烟脚本

这些脚本不属于 `node --test` 的自动测试：

```powershell
# 只打印某天的采集结果（事实包样例、会话/工具统计）
node test/collect-real.mjs 2026-11-10

# 走完整流水线：日报 + 周报，写入临时数据目录，并把 HTML/Markdown 输出到 test/out/
node test/e2e-real.mjs 2026-11-10

# 合成浏览器 UI 冒烟：设置页 320/375/520/900 宽度、报告查看器的 sandbox/CSP/焦点
node test/ui-smoke-client.mjs [path/to/playwright/index.mjs]
```

前两个脚本读取本机真实的 `~/.dsh/sessions`，**不会修改会话日志**。`e2e-real.mjs` 会访问 Open-Meteo 获取天气（失败会跳过），并把 `DSH_DAILY_REPORT_DIR` 指向系统临时目录，因此不会污染 `~/.dsh/dsh-daily-report/`；但它会把生成的 `real-daily.html`、`real-daily.md`、`real-weekly.html` 写到 `test/out/`，这些文件含有本机真实的会话与路径信息，不要提交。

`ui-smoke-client.mjs` 用一个合成 DOM 适配器渲染 `client-source.js`，不启动 DSH、不调用配置/报告 RPC、不生成报告；它需要 Playwright（可通过参数或 `DDR_PLAYWRIGHT` 指定 `playwright/index.mjs`），浏览器默认用 Edge（可用 `DDR_BROWSER` 覆盖）。受限沙箱里启动浏览器会报 `spawn EPERM`，请在普通终端运行。它是布局/查看器回归检查，不等于真实 DSH 桌面验收。

---

## 已知边界（真实桌面验收）

### 已确认

- 以 `link:` 方式装入本机 Desktop profile，插件启用，Host 已实际挂载并产生心跳/事实/报告。
- 鲸鱼 logo 槽位接管、卡片在「探索未至之境」上方弹出、配色与 DSH 原生面板一致。
- 设置 → 每日简报的隐私边界三项、键鼠采样开关样式已在真实窗口截图确认。
- 用真实会话日志跑通日报与周报，天气与健康提醒按预期出现。
- 本轮完整测试 **40/40 pass**，前端重新构建；设置页320/375/520/900宽度、查看器800×800/28px尺寸与安全/焦点检查通过合成浏览器验收。
- 报告正文16组深浅主题/宽窄/各周期视觉组合通过，无横向溢出或网络请求；字体/蓝色使用DSH变量，并支持减少动态效果。
- 当前真实 Host 的 `daily_report` 已成功调用，用户明确授权的一次真实云端摘要已生成归档；Windows通知返回 `submitted`，但是否可见仍需人工确认。
- 插件管理关闭再启用两次均返回 `applied`；旧页面如仍缓存，请刷新当前 GUI。

### 未完成 / 未验证

1. **设置页下半部分没有真实桌面逐项验收**：合成浏览器冒烟脚本会在 320/375/520/900 宽度检查设置页与报告行是否溢出，但还没有在真实 DSH 窗口逐项截图确认；长输入框、数字输入与列表换行仍以真实界面为准。
2. **真实界面动作未全部联调**：查看器已有合成浏览器安全、焦点、details、尺寸与布局验收；真实 Host 的工具注册及一次云端摘要已成功。但实际点击周报/月报按钮、系统浏览器打开、用户真实本地模型服务的 probe 仍需在真实 DSH 窗口确认（本机合成 HTTP 探针成功路径已通过测试）。
3. **Windows Toast 可见性待确认**：PowerShell + WinRT 通知提交流程已实测返回 `submitted`；这只证明提交流程成功，不等于用户看见弹窗。macOS/Linux 通知分支未在本机验证。
4. **设置页状态显示待真机确认**：工具注册与真实执行已通过；设置页「报告 → Agent 工具状态」的显示效果仍需真实窗口确认。注册失败会通过 `toolAvailable/toolError` 显式诊断。
5. **脱敏导出没有 UI 入口**：`renderHtml(..., { redact: true })` 可用，但设置页只有普通的查看/浏览器打开，没有脱敏按钮；分享前需要自行调用渲染器或人工检查。
6. **健康数据可能是粗估**：键鼠采样默认关闭且只支持 Windows；关闭时健康提醒只用 DSH 消息时间估算，报告会注明「基于 DSH 消息时间粗估」，不要当作实测。
7. **天气日期语义**：第一层天气取生成报告时的当天，不是被统计日，也不会在重新查看旧归档时刷新；卡片与报告用「天气 MM-DD」标出实际天气日期。
8. **成本是估算**：单价来自设置里的价目表，不是账单；峰谷折扣、缓存命中率都只是按配置计算的结果。
9. **跨平台/跨版本矩阵未做**：真实界面验收只在当前 Windows Desktop 上完成；其他 DSH 版本、macOS/Linux 未验证。

---

## 开发结构

```text
plugin/
├─ package.json          # dsh.bundle / dsh.client 声明；零运行时依赖
├─ cordis.patch.yml      # 向 profile 插入插件行
├─ CONTRACT.md           # 数据契约：DayFacts / Report / 模块签名（不随 npm 包发布）
├─ lib/
│  ├─ index.js           # Host 入口：RPC、定时、心跳、模型工具、系统提示
│  ├─ config.js          # 设置 schema、校验/夹取、ConfigStore
│  ├─ store.js           # facts / reports / state 落盘
│  ├─ engine.js          # 采集 → 摘要 → 分析 → 渲染 → 落盘
│  ├─ summarize.js       # 分层摘要、缓存、A/B/C 三档
│  ├─ util.js            # 时间、格式化、原子写、JSONL
│  ├─ collect/           # sessions / heartbeat / weather / idle / rawlog
│  ├─ analyze/           # cost / health / report
│  └─ render/            # 单文件 HTML / Markdown
├─ client/
│  ├─ client-source.js   # 鲸鱼弹窗、设置页、报告查看器
│  ├─ ui.css             # 全部走 DSH 设计变量
│  ├─ fish-paths.js      # 鲸鱼摆尾路径
│  ├─ build.mjs          # 无依赖打包脚本
│  └─ client.js          # 构建产物
└─ test/                 # 测试、样例、真机冒烟脚本
```

工作区根目录的 `_research/`（调研物料、解包的 DSH 源码）和设计文档不属于插件包，不随 npm 包发布；本次整理没有删除它们，是否长期保留由工作区决定。

### Host 与前端

- Host 注册 10 个 owner-only RPC：`state / config / generate / report / dismiss / geocode / models / probe / open / prune`，路径为 `POST /api/daily-report/<method>`。
- 前端通过 DSH 的 `slots` 接管 `conversation.hero.brand.mark`（鲸鱼与卡片）、`settings.section`（每日简报）、`shell.overlay`（报告查看器）。
- 生成过程串行化，定时器与 UI 不会并发写同一份报告。
- 接口与数据形状以同目录的 `CONTRACT.md` 为准；改数据形状先改契约。

### 安全与边界

- 报告的 HTML 单文件、无脚本、无外链，文本全部转义；查看器 iframe 使用 `sandbox=""` 并叠加 CSP 禁止远程资源。
- RPC 需要 owner 身份，非 owner 返回 403。
- 本地模型地址强制回环，除非用户显式 `allowLan`；本地模型失败不会回退云端。
- 心跳与空闲采样只写时间戳/空闲毫秒，不采集输入内容。

---

## License

MIT © 2026 Yutai233

完整文本见 [LICENSE](../LICENSE)。
