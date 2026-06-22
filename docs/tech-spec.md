# 技术规范

## 技术栈

| 层级 | 技术 | 版本要求 |
|------|------|---------|
| 运行时 | Node.js | ≥ 18 |
| 包管理 | npm | ≥ 9 |
| 后端框架 | Express | 4.x |
| 数据库 | better-sqlite3 | 最新 |
| 实时通信 | ws (WebSocket) | 最新 |
| 前端 | 纯 HTML/CSS/JS | ES2020+ |
| 粒子效果 | Canvas API（手写） | — |
| 音乐 API | NeteaseCloudMusicApi | 本地实例 |
| AI | Claude Code CLI（子进程） | 最新 |
| TTS | Fish Audio API | — |

## 编码规范

### JavaScript / Node.js
- 使用 `const` / `let`，禁用 `var`
- 异步操作使用 `async/await`
- 模块导出使用 CommonJS (`module.exports`)
- 错误处理：每个 async 函数需 try-catch
- 文件命名：模块用大写（ROUTER.JS），服务用小写（netease.js）

### CSS
- 使用 CSS 变量管理主题色
- 类名遵循 BEM 命名
- Flexbox + Grid 布局
- 响应式优先，移动端适配

### 前端 JS
- 原生 DOM API，无框架
- WebSocket 连接管理（自动重连）
- 事件委托减少绑定

## API 接口规范

### REST 端点

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /api/chat | 发送聊天消息 |
| GET | /api/new | 新建会话 |
| GET | /api/next | 获取下一首 |
| GET | /api/taste | 获取品味配置 |
| GET | /api/plan/today | 获取今日计划 |

### WebSocket
- 路径：`/stream`
- 协议：JSON 帧，字段 `{ type, payload }`
- 类型：`chat.start`, `chat.chunk`, `chat.end`, `track.change`, `schedule.alert`

## 数据库设计

### STATE.DB（SQLite）

```sql
CREATE TABLE messages (id INTEGER PRIMARY KEY, session_id TEXT, role TEXT, content TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE play_history (id INTEGER PRIMARY KEY, track_id TEXT, title TEXT, artist TEXT, played_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE plans (id INTEGER PRIMARY KEY, title TEXT, time TEXT, status TEXT DEFAULT 'pending');
CREATE TABLE context (key TEXT PRIMARY KEY, value TEXT);
```

## 安全规范
- API Key 使用环境变量，不硬编码
- .env 文件不入版本控制
- 无外部网络暴露，仅监听 localhost
