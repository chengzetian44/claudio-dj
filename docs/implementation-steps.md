# 执行步骤

## 开发阶段总览

```
Phase 1 ── 项目骨架 ── package.json + 目录 + 空模块                ✅ 完成
Phase 2 ── 核心后端 ── server.js + STATE.DB + ROUTER + 7 条 API   ✅ 完成
Phase 3 ── 音乐服务 ── MUSIC/netease.js + /api/next                ✅ 完成
Phase 4 ── AI 大脑   ── BRAIN/claude.js + CONEXIT.HUDOW             ✅ 完成
Phase 5 ── 前端界面 ── PWA/ 三视图 + 粒子背景 + 主题切换           ✅ 完成
Phase 6 ── 聊天联通 ── WebSocket + 前端聊天对话框                   ✅ 完成
Phase 7 ── 调度系统 ── SCHEDULER.JS + node-cron 定时任务           ✅ 完成
Phase 8 ── 语音环境 ── TTS + Weather + UPnP                        ✅ 完成
Phase 9 ── 收尾完善 ── 歌词 + 清理 + 文档 + 日志                   ✅ 完成
```

## Phase 1：项目骨架 ✅

- [x] 创建 `package.json`
- [x] 安装依赖：express, better-sqlite3, ws, @anthropic-ai/sdk, NeteaseCloudMusicApi, dotenv, node-cron
- [x] 创建所有模块文件
- [x] 创建 `USER/` 语料库模板文件
- [x] 创建 `prompts/dj-persona.md`
- [x] 写入 `.gitignore`

## Phase 2：核心后端 ✅

- [x] `server.js` — Express + http.Server + WebSocket + 静态文件
- [x] `STATE.DB.js` — SQLite 初始化、5 张表、完整 CRUD
- [x] `ROUTER.JS` — 意图分类（play/recommend/query/chat）
- [x] 实现 7 条路由：chat, new, next, taste, resolve, lyric, plan/today
- [x] WebSocket /stream 端点

## Phase 3：音乐服务 ✅

- [x] `MUSIC/netease.js` — 搜索、URL解析、歌词、推荐
- [x] 智能排名：优先原唱、过滤混音师、清洗艺人名
- [x] `/api/next` 返回真实可播放歌曲
- [x] `/api/resolve` 关键字搜索 + URL 解析
- [x] `/api/lyric` LRC 歌词接口
- [x] 播放历史写入 STATE.DB

## Phase 4：AI 大脑 ✅

- [x] `BRAIN/claude.js` — SDK 优先通道 + CLI 降级
- [x] 自动适配 DeepSeek / Anthropic 环境
- [x] `CONEXIT.HUDOW/assembler.js` — 动态组合 system + user prompt
- [x] `/api/chat` 接入 AI 响应（DJ 人格）

## Phase 5：前端界面 ✅

- [x] `PWA/index.html` — 三视图 + 聊天面板 + 歌词区 + 音频元素
- [x] `PWA/css/style.css` — CSS 变量 + 日间/夜间主题 + 响应式
- [x] `PWA/js/particles.js` — Canvas 动态粒子连线背景
- [x] `PWA/js/player.js` — 播放/暂停/下一首/音量/进度/歌词同步
- [x] `PWA/js/app.js` — 视图切换 + 主题切换 + 日期更新

## Phase 6：聊天联通 ✅

- [x] WebSocket 实时通信 + HTTP 降级
- [x] `PWA/js/chat.js` — 消息渲染 + AI 回复 + 定时推送显示
- [x] 发送 "播放xxx" → 搜索歌曲 → 自动播放

## Phase 7：调度系统 ✅

- [x] 安装 node-cron
- [x] `SCHEDULER.JS` — 三个定时任务：
  - 07:00 早间计划（今日日程 + 推荐音乐）
  - 09:00 早间简报（天气 + 计划 + AI 生成播报）
  - 每小时检查（待办提醒）
- [x] 时区：Asia/Shanghai
- [x] 集成真实天气数据

## Phase 8：语音与环境 ✅

- [x] `VOICE/weather.js` — wttr.in 免费天气 + OpenWeatherMap 可选
- [x] `VOICE/tts.js` — Fish Audio API + MD5 缓存
- [x] `VOICE/upnp.js` — SSDP 设备发现 + AVTransport 占位
- [x] `/tts/` 静态缓存目录暴露

## Phase 9：收尾完善 ✅

- [x] 歌词显示：LRC 解析 + 实时高亮 + 自动滚动
- [x] 流式 WebSocket 聊天
- [x] 清理临时文件
- [x] 文档同步更新
- [x] 开发日志

## 后续扩展（可选）

- [ ] Fish Audio API Key 配置 → TTS 语音播报
- [ ] UPnP 完整 SOAP 实现 → 智能音箱控制
- [ ] 飞书日程集成
- [ ] PWA Service Worker → 离线使用
- [ ] 跨设备同步
