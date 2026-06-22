# 架构设计

## 三层架构

```
┌─────────────────────────────────────────────┐
│         第三层：应用表现与协议层               │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │  PWA/    │  │ HTTP API │  │ CONEXIT.  │  │
│  │  前端界面 │  │ 6 routes │  │ HUDOW     │  │
│  └──────────┘  └──────────┘  └───────────┘  │
├─────────────────────────────────────────────┤
│          第二层：核心逻辑与调度层               │
│  ┌──────────┐ ┌──────────┐ ┌──────┐┌──────┐ │
│  │ ROUTER   │ │SCHEDULER │ │ TTS  ││STATE │ │
│  │ .JS      │ │.JS       │ │ .JS  ││.DB   │ │
│  └──────────┘ └──────────┘ └──────┘└──────┘ │
├─────────────────────────────────────────────┤
│         第一层：外部数据与能力接入层            │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐       │
│  │ USER/│ │BRAIN/│ │MUSIC/│ │VOICE/│       │
│  │ 语料 │ │ AI   │ │ 音乐 │ │ 语音 │       │
│  └──────┘ └──────┘ └──────┘ └──────┘       │
└─────────────────────────────────────────────┘
```

## 数据流

### 聊天流程
```
用户输入 → ROUTER.JS 分类
  ├── 简单查询 → 本地逻辑直接返回
  ├── 音乐请求 → MUSIC/netease.js → 返回歌曲
  └── 复杂语义 → CONEXIT.HUDOW 组装 prompt → BRAIN/ → Claude → 返回
     ↓
  响应通过 WebSocket 流式推送到前端 PWA
```

### 音乐播放流程
```
前端请求 /api/next → ROUTER → MUSIC/netease.js → 网易云 API
  → 返回 { url, title, artist, cover }
  → 前端 <audio> 播放 → 写入 play_history
```

### 调度流程
```
SCHEDULER.JS (node-cron)
  ├── 07:00 → 获取天气 → 获取日程 → 生成早间简报 → TTS 播报
  ├── 09:00 → 检查今日计划 → WebSocket 推送提醒
  └── 每小时 → 检查待办 → 按需播报
```

## 模块依赖

```
server.js
  ├── require STATE.DB（数据库）
  ├── require ROUTER.JS（路由分发）
  └── WebSocket 挂载

ROUTER.JS
  ├── → MUSIC/netease.js
  ├── → BRAIN/claude.js
  ├── → VOICE/weather.js
  └── → STATE.DB

CONEXIT.HUDOW/assembler.js
  ├── ← USER/（语料文件）
  └── ← prompts/dj-persona.md

SCHEDULER.JS
  ├── → TTS.JS
  ├── → VOICE/weather.js
  └── → STATE.DB
```

## 前端组件树

```
index.html
├── #particles-canvas      （粒子背景）
├── #app-container
│   ├── #sidebar           （导航：播放器 / 个人资料 / 设置）
│   ├── #main-view
│   │   ├── 播放器视图     （封面、歌名、进度条、控件）
│   │   ├── 个人资料视图   （taste 配置、听歌统计）
│   │   └── 设置视图       （主题、TTS、API Key）
│   └── #chat-panel        （聊天对话框）
└── #audio-element         （全局音频播放器）
```
