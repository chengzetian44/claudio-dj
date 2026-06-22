# 更新日志 / CHANGELOG

本项目所有重要变更均记录于此。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

---

## [2026-06-03] — AI API 配置修复

### 🔧 修复 / Fixed

- **DeepSeek 推理模型兼容性**：`BRAIN/claude.js` 的 `max_tokens` 从固定 4096 改为自适应。当 `ANTHROPIC_BASE_URL` 包含 `deepseek` 时自动提升至 8192，解决推理模型思考阶段耗尽 token 导致无文本输出的问题。
- **空文本诊断**：`parseResponse()` 在 API 返回无 `text` 类型内容块时输出诊断日志（content types + stop_reason），方便排查。

### 🔄 变更 / Changed

- **`.env`**：移除占位符 `ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx`；新增 `ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_BASE_URL`、`ANTHROPIC_MODEL` 三项 DeepSeek 配置。
- **`.env.example`**：更新模板，添加 DeepSeek 兼容接口的详细注释说明。

### 📝 涉及文件

| 文件 | 操作 |
|------|------|
| `BRAIN/claude.js` | 修改 — 自适应 max_tokens + 诊断日志 |
| `.env` | 修改 — 完整 DeepSeek 配置 |
| `.env.example` | 修改 — 模板更新 |
| `dev-log/2026-06-03.md` | 新增 — 开发日志 |
| `CHANGELOG.md` | 新增 — 本文件 |

---

## [2026-05-26] — AI 对话质量 + 调度系统 + TTS + 记忆系统

### ✨ 新增 / Added

- **Phase 7 调度系统**：`SCHEDULER.JS` 三个定时任务（07:00 早间计划、09:00 早间简报、每小时检查），基于 node-cron，时区 Asia/Shanghai。
- **Phase 8 语音与环境**：`VOICE/weather.js`（wttr.in + OpenWeatherMap）、`VOICE/tts.js`（Fish Audio API + MD5 缓存）、`VOICE/upnp.js`（SSDP 发现框架）。
- **浏览器 TTS 播报**：因 Fish Audio API 域名被国内网络屏蔽，切换为 Web Speech API，设置页新增中文音色选择器 + 试听按钮。
- **歌词显示**：LRC 解析 + 播放进度实时高亮 + 自动滚动。
- **喜欢/跳过按钮**：播放器 UI 新增 ♡ 和 ✕，前端 `player.js` 实现 like/skip 逻辑 + API 调用。
- **记忆系统**：`STATE.DB` 新增 `likes` / `skips` 表；API 新增 `POST /api/like`、`POST /api/skip`、`GET /api/stats`。
- **`GET /api/resolve?keyword=`**：搜索 + URL 解析一体端点。
- **`GET /api/lyric?id=`**：LRC 歌词端点。
- **Windows 启动脚本** `start.bat`。

### 🔧 修复 / Fixed

- **AI 对话质量**：`max_tokens` 1024→4096；移除强制 JSON 输出，改为自然语言 + `♪play:/♪recommend:/♪schedule:` 轻量标记；移除"不超过 3 句话"限制。
- **搜索准确率**：新增 `rankTracks()` 智能排名（艺人匹配 +20、原唱 +5~8、翻唱 -15）、`cleanArtistName()` 清洗、`filterArtists()` 过滤。
- **播放链路**：重写 `player.js`，移除过时 `resolveUrl()`，直接用 CDN 直链；AI 推荐无 URL 时自动调 `/api/resolve`。
- **STATE.DB 冲突**：数据库文件 `STATE.DB` → `claudio.db`，require 加 `.js` 后缀，`init()` 加幂等保护。
- **`handleAIChat` null 崩溃**：增加空值检查 + 错误日志。

### 🔄 变更 / Changed

- **意图分类**：RECOMMEND/QUERY 并入 AI 通道，不再用本地公式回复。
- **DJ 人设**：重写 `prompts/dj-persona.md`，更自然的 DJ 人格、音乐知识、场景感知。
- **记忆注入**：`CONEXIT.HUDOW/assembler.js` 注入最近 10 条 likes/skips 到 System Prompt。

### 📝 涉及文件（38 个）

```
BRAIN/claude.js, CLAUDE.md, CONEXIT.HUDOW/assembler.js, MUSIC/netease.js,
ROUTER.JS, SCHEDULER.JS, STATE.DB.js, TTS.JS, server.js, start.bat,
package.json, .gitignore, .env, .env.example,
USER/taste.md, routines.md, playlists.json, good-rules.md,
prompts/dj-persona.md,
VOICE/tts.js, weather.js, upnp.js,
PWA/index.html, css/style.css, js/particles.js, player.js, chat.js, app.js,
docs/requirements.md, tech-spec.md, implementation-steps.md, architecture.md,
dev-log/2026-05-21.md, 2026-05-26.md, template.md
```
