# dsh-daily-report · DSH 每日简报

把本机的 DSH 会话整理成一份能快速读完的简报：今天做了哪些事、用了多少 token、花了多少钱、哪里卡住、明天接着做什么，外加天气、dsh 启停时间和作息提醒。

[![CI](https://github.com/Yutai233/dsh-daily-report/actions/workflows/ci.yml/badge.svg)](https://github.com/Yutai233/dsh-daily-report/actions/workflows/ci.yml)
![version](https://img.shields.io/badge/version-0.3.0-blue)
![license](https://img.shields.io/badge/license-MIT-green)
![dsh](https://img.shields.io/badge/dsh-%E2%89%A5%200.2.2--rc.1-4A4AFF)
![node](https://img.shields.io/badge/node-%E2%89%A5%2022.15-339933)

> **先读这段**：插件默认走 **B 档 · 仅标题 + 统计**，不调用任何模型，会话正文不出本机。报告里仍会包含会话标题、路径、命令和域名——分享前请自己检查。

![日报（浅色）](./docs/images/demo-daily-light.png)

<details>
<summary>更多截图（深色 / 周报）</summary>

![日报（深色）](./docs/images/demo-daily-dark.png)

![周报](./docs/images/demo-weekly-light.png)

</details>

> 截图由 `test/fixtures/sample-report.mjs` 的合成数据渲染（`node test/gen-docs-images.mjs` 可重新生成），不含任何真实会话内容；显示的是导出的报告页面本身，DSH 内的查看器还会套一层原生弹窗外壳。

## 特性

| 能力 | 说明 |
|---|---|
| 早晨卡片 | DSH 新会话页鲸鱼 logo 上方弹出，以第一层为主，每天自动一次，点鲸鱼可随时再开 |
| 三层日报 | 30 秒速览 / 约 3 分钟细读 / 附录（逐会话、命令、原始数据） |
| 正文摘要 | 会话先压缩成「事实包」，再写摘要；按会话与事件序号缓存，旧会话不重复花钱 |
| 工具统计 | 调用排行、失败次数、p50/p90 耗时、命令分类、改动文件、访问域名、审批等待 |
| 成本与省钱 | token 用量、花费估算、缓存命中率、峰谷占比、最贵一轮、每日预算提醒 |
| 近 7 天对比 | 指标带 ▲▼，附 7 天迷你柱状图 |
| 卡点与待续 | 失败工具/命令、重试、反复改同一文件；未完成 todo 自动进入下一份简报 |
| 健康提醒 | Windows 键鼠空闲采样（可选），只提醒久坐、熬夜、午休没离开，不做医学判断 |
| 周报 / 月报 | 同一套数据换窗口，按 ISO 周与自然月聚合 |
| 给 agent 读 | Markdown 全量落盘，可选注册 `daily_report` 工具，直接问「昨天做了什么」 |

两条规则贯穿报告：**数字由代码计算，模型只负责写文字**；**没有变化的段落不渲染**。

## 安装

前置条件：DSH Desktop `>= 0.2.2-rc.1`。插件依赖 Host 的 `sessionQuery`、`connection`、`tools`、`systemPrompt` 服务。运行时零第三方依赖，只用 `node:*` 内置模块与全局 `fetch`。

本插件尚未发布到 npm，用下面的方式安装。

### 方式一：插件管理（推荐）

1. 克隆或下载本仓库，记下仓库根的绝对路径，例如 `E:\path\to\dsh-daily-report`
2. 打开 DSH 左侧 **插件** 页 → **添加插件**
3. 包名填入该绝对路径
4. 安装后点 **立即启用**；未开启 HMR 时重启 DSH
5. 打开 **设置 → 每日简报**，页面出现且 `%USERPROFILE%\.dsh\dsh-daily-report\` 开始产生数据即表示挂载成功

### 方式二：开发 link（命令行）

```powershell
git clone https://github.com/Yutai233/dsh-daily-report.git
& "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" `
  plugin --profile desktop add "link:E:/path/to/dsh-daily-report"
```

移除时把 `add "link:..."` 换成 `remove dsh-daily-report`。不要手动复制进 `node_modules`，也不要用 `npm install` 安装。

> 仓库根就是插件包根（`package.json` 在根目录），所以 link 路径指向 clone 下来的仓库目录即可，不需要再进子目录。

## 使用

- **卡片**：新会话页鲸鱼 logo 上方出现当天简报；点鲸鱼可开合，旁边圆点表示「今天还没看过」
- **完整报告**：「查看完整报告」在 DSH 内打开查看器，也可打开 Markdown 或用系统浏览器查看
- **生成**：设置 → 每日简报 可生成日报、本周周报、本月月报并查看历史；默认每天 `09:00` 与首次打开各检查一次
- **问 agent**：「昨天做了什么」「上周三我修了什么」，或直接读 `%USERPROFILE%\.dsh\dsh-daily-report\reports\**\*.md`

## 隐私

| 档位 | 配置值 | 正文是否离开本机 | 行为 |
|---|---|---|---|
| **B · 仅标题 + 统计**（默认） | `local-only` | 否 | 不调用模型，主线由标题、改动文件、失败、待办等事实拼成模板句 |
| A · 云端模型摘要 | `cloud` | 是 | 把压缩后的事实包发给 DSH 默认模型或指定模型 |
| C · 本地模型摘要 | `local-model` | 否（默认强制回环） | 发给本机 OpenAI 兼容服务（Ollama / LM Studio / llama.cpp） |

档位只由用户在设置页选择，插件不会自动切换，也不会在本地模型失败时改用云端。C 档默认只允许回环地址，需要局域网地址时必须显式打开 `allowLan`。分享报告前请自行检查：报告含会话标题、路径、命令与域名。

## 数据目录

```text
%USERPROFILE%\.dsh\dsh-daily-report\
├─ config.json / state.json
├─ heartbeat/  idle/  facts/  cache/
└─ reports/daily|weekly|monthly/
```

可用环境变量 `DSH_DAILY_REPORT_DIR` 覆盖数据根目录；在 **设置 → 每日简报 → 报告 → 报告保存目录** 输入绝对路径并点「保存目录」，或「恢复默认目录」。目录变更只切换报告读写位置，不搬移或删除旧报告，采样、事实和配置仍在原处。默认保留 180 天，`cache/` 与周报月报不会自动清理。DSH 原始会话日志仍在 `~/.dsh/sessions/`，插件只读不复制。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/GUIDE.md](./docs/GUIDE.md) | 完整使用说明、每个设置项、隐私细节、构建与冒烟脚本、已知边界 |
| [CONTRACT.md](./CONTRACT.md) | 数据契约：`DayFacts`、模块签名、`Report` 结构、渲染规则 |
| [CHANGELOG.md](./CHANGELOG.md) | 版本变更记录 |
| [docs/dev/](./docs/dev/) | 开发过程记录：功能设计方案、前期插件调研、阶段性交接说明（历史存档，部分内容可能已过时） |

## 开发

```powershell
node client/build.mjs                                  # 构建前端（改完 client/ 必跑）
node --test --test-timeout=300000 "test/*.test.mjs"     # 跑测试
```

改 `lib/**` 后重启 DSH；改前端后先重新构建 `client.js`，再把插件关掉重开（HMR 只在 `pnpm run dev:web` 时自动刷新）。`client/client.js` 是构建产物且随仓库提交，CI 会校验它与 `client-source.js` + `ui.css` + `fish-paths.js` 逐字节一致。

测试与冒烟脚本的细节见 [docs/GUIDE.md](./docs/GUIDE.md)，数据契约见 [CONTRACT.md](./CONTRACT.md)。

## 目录结构

```text
.
├─ lib/        Host 入口、配置、采集、摘要、分析、渲染
├─ client/     鲸鱼卡片、设置页、报告查看器（client.js 为构建产物）
├─ test/       测试、样例、真机冒烟脚本
├─ docs/       完整使用文档、截图、开发过程记录
└─ .github/    CI
```

## 已知边界

- 仅在 **Windows + DSH Desktop** 上验证；macOS/Linux 与其它 DSH 版本的兼容矩阵尚未验证
- 成本是**估算**，单价来自设置里可改的价目表，不是账单
- 健康提醒在未开键鼠采样时只用 DSH 消息时间粗估，文案会注明；不要把粗估说成实测
- Windows Toast 通知已实现并提交成功，但「用户是否真的看见」未实测
- 真实桌面逐按钮验收仍有缺口，详见 [docs/GUIDE.md](./docs/GUIDE.md) 的「已知边界」

## License

MIT © 2026 Yutai233 · 见 [LICENSE](./LICENSE)
