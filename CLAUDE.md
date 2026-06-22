# CLAUDE.md — 私人音乐电台（Claudio DJ）AI 工作指引

## 项目概述
Windows 私人在线音乐电台，代号 Claudio DJ。整合网易云音乐、Claude AI、Fish TTS，以 PWA 形式运行于 localhost:8080。

## 核心原则

1. **稳定优先** — 每完成一个模块，验证后再进入下一个。不要一口气改多个模块。
2. **分步推进** — 严格按 `docs/implementation-steps.md` 的阶段执行，不跳步。
3. **文档同步** — 代码变更后，同步更新 `docs/` 下的对应文档。
4. **日志记录** — 每次开发会话结束前，在 `dev-log/` 写入当日日志。
5. **安全第一** — `.env` 不进版本控制，API Key 用环境变量。

## 文档索引

| 文档 | 路径 | 用途 |
|------|------|------|
| 项目需求 | [docs/requirements.md](docs/requirements.md) | 完整功能需求规格 |
| 技术规范 | [docs/tech-spec.md](docs/tech-spec.md) | 技术选型、编码规范、接口约定 |
| 执行步骤 | [docs/implementation-steps.md](docs/implementation-steps.md) | 分阶段实施计划 |
| 架构设计 | [docs/architecture.md](docs/architecture.md) | 三层架构详细设计 |
| 开发日志 | [dev-log/](dev-log/) | 每次开发的完成事项与待办记录 |
| 更新日志 | [CHANGELOG.md](CHANGELOG.md) | 版本级变更记录，按日期归档 |

## 项目结构速查

```
音乐电台/
├── server.js              # Express 主入口，挂载所有路由与 WebSocket
├── STATE.DB               # SQLite 数据库文件（自动生成）
├── USER/                  # 用户语料库 → taste.md, routines.md, playlists.json, good-rules.md
├── MUSIC/                 # 音乐服务 → netease.js（网易云 API 封装）
├── BRAIN/                 # AI 大脑 → claude.js（Claude Code 子进程）
├── CONEXIT.HUDOW/         # Prompt 组装器 → assembler.js
├── prompts/               # Prompt 模板 → dj-persona.md
├── ROUTER.JS              # 意图路由器
├── SCHEDULER.JS           # 事件调度器
├── TTS.JS                 # 语音合成服务
├── VOICE/                 # 语音与环境 → tts.js, weather.js, upnp.js
├── PWA/                   # 前端 → index.html, css/, js/
└── tts/                   # TTS 音频缓存目录
```

## 开发会话流程

1. 阅读 `docs/implementation-steps.md`，确认当前阶段
2. 实现该阶段任务，单模块改动
3. 验证（启动服务器 / 检查前端 / 确认路由）
4. 更新 `dev-log/YYYY-MM-DD.md` 记录进展
5. 标记任务完成，进入下一阶段

## 环境要求

- Node.js ≥ 18
- npm ≥ 9
- Windows 10+
- Claude Code CLI（用于 BRAIN 模块）
- NeteaseCloudMusicApi（本地或 Docker）
