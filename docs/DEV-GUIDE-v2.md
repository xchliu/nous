# Nous Dashboard v2 — 开发指引

> 本文档是小亚的开发指引，基于 ARCHITECTURE-v2.md 和 PROTOCOL.md v1.1。
> 目标：快速出demo，先看到界面再迭代。

## 核心变更：从"仪表盘"到"协同框架"

v1 是前端页面 + 数据寄生 SelfMind。
v2 是独立框架：Nous有自己的后端(Flask+SQLite) + 数据层 + API。

## 坦哥要的三个核心信息

这是 Dashboard 的三个核心视图，每个都必须可见：

1. **Agent自身状态** — 在线/心跳/当前任务/最近活动/负载
2. **Agent间沟通记录** — 信号时间线（ASK/DONE/BLOCKED/SYNC/HEARTBEAT/REPAIR 全量）
3. **任务状态** — 生命周期事件流（分配→认领→进行→完成→验收）

## Phase 1: 先出Demo（最快速度）

### 1.1 Nous 后端骨架（端口 8600）

```
nous/
  backend/
    app.py          # Flask app, port 8600
    models.py       # SQLAlchemy models (4 tables)
    routes_agents.py  # /api/agents/*
    routes_signals.py # /api/signals/*
    routes_tasks.py   # /api/tasks/*
    seed.py         # Mock data seeder
```

**数据表（ARCHITECTURE-v2 定义）：**

```sql
-- agent_registry
CREATE TABLE agent_registry (
  agent_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  gateway_port INTEGER,
  status TEXT DEFAULT 'offline',
  last_heartbeat DATETIME,
  current_task_id TEXT,
  last_signal_at DATETIME,
  api_key TEXT,
  config_json TEXT
);

-- signal_log
CREATE TABLE signal_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_type TEXT NOT NULL,  -- HEARTBEAT/STATUS/BLOCKED/DONE/ASK:arch/ASK:impl/SYNC/REPAIR
  from_agent TEXT NOT NULL,
  to_agent TEXT,              -- NULL = broadcast
  task_id TEXT,
  content TEXT,
  metadata_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- task_events
CREATE TABLE task_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  event_type TEXT NOT NULL,   -- created/assigned/claimed/started/blocked/completed/reviewed/accepted/reassigned
  agent_id TEXT,
  detail TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- agent_config
CREATE TABLE agent_config (
  agent_id TEXT PRIMARY KEY,
  display_name TEXT,
  color TEXT,
  icon TEXT,
  skills TEXT,
  nous_api_token TEXT NOT NULL
);
```

### 1.2 API 端点

**认证：** 所有端点需要 Bearer token（Phase1 就启用，不是 Phase2）

```
# Agent Registry
GET  /api/agents           → 所有agent状态列表
GET  /api/agents/{id}      → 单个agent详情
POST /api/agents/{id}/heartbeat → agent心跳上报

# Signal Log
GET  /api/signals          → 信号时间线（支持 ?from=&to=&type=&agent= 过滤）
POST /api/signals          → 写入新信号
GET  /api/signals/stats    → 信号统计（各类型数量、各agent活跃度）

# Task Lifecycle
GET  /api/tasks            → 任务列表（支持 ?status=&agent= 过滤）
GET  /api/tasks/{id}/events → 单个任务的生命周期事件流
GET  /api/tasks/events     → 全部任务事件时间线
```

### 1.3 Mock 数据种子

seed.py 生成以下 mock 数据：

**4 个 agent：**
- socrates (苏哥, PM, 8642, #2563eb)
- aris (小亚, Dev, 8643, #10b981)
- plato (柏拉图, Arch, 8645, #f97316)
- grace (Grace, Aux, 8644, #f59e0b)

**模拟信号时间线（最近24小时）：**
- 每个agent 3-5条 HEARTBEAT
- 苏哥 2条 DONE（验收完成）
- 小亚 1条 BLOCKED（gateway TTFB慢）
- 柏拉图 1条 ASK:arch（评审反馈）
- 苏哥 1条 REPAIR（修复柏拉图provider配置）

**模拟任务事件（2-3个任务的完整生命周期）：**
- TD-003: created→assigned→claimed→started→completed→reviewed→accepted
- TD-004: created→assigned→claimed→started→blocked→reassigned→started→completed

### 1.4 前端 Demo

基于现有 dashboard/app.js 改造，新增两个模块：

**M1 改造：Agent Status → Agent Registry**
- 不仅显示在线/离线，还显示：当前任务、最近心跳时间、最近信号时间
- 心搏状态指示灯：绿色=最近60分钟内有HEARTBEAT，黄色=60-120分钟，红色=超2小时/离线

**新增 M6：Signal Timeline（核心新模块）**
- 垂直时间线，显示所有信号（HEARTBEAT/STATUS/BLOCKED/DONE/ASK/SYNC/REPAIR）
- 每条信号显示：from_agent→to_agent、signal_type、时间、摘要
- 支持按 signal_type 和 agent 过滤
- BLOCKED 和 REPAIR 高亮显示（红色/橙色）

**M2 改造：Task Board → Task Lifecycle**
- 保留 Kanban 四列视图
- 新增：点击任务展开生命周期事件流（created→claimed→started→completed 等时间线）
- blocked 任务红色标注，附阻塞原因

### 1.5 前端调用 Nous API

```javascript
const NOUS_API = 'http://localhost:8600';
const NOUS_TOKEN = 'nous-admin-token-v2'; // admin token for demo

// 所有请求带 Authorization header
function nousFetch(path, options = {}) {
  return fetch(`${NOUS_API}${path}`, {
    ...options,
    headers: { 'Authorization': `Bearer ${NOUS_TOKEN}`, ...options.headers },
  }).then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`));
}
```

## 开发顺序

1. backend/app.py + models.py — Flask骨架+数据表
2. backend/seed.py — Mock数据填充
3. backend/routes_agents.py — Agent API
4. backend/routes_signals.py — Signal API
5. backend/routes_tasks.py — Task API
6. 启动后端验证 API 响应
7. 前端改造 M1（Agent Registry）
8. 前端新增 M6（Signal Timeline）
9. 前端改造 M2（Task Lifecycle）
10. 集成测试

## 技术栈

- 后端：Flask + SQLAlchemy + SQLite
- 前端：纯 HTML/CSS/JS（现有代码基础上改造，不引入新框架）
- 认证：Bearer token（Phase1 就启用）
- 数据：Phase1 先用 mock/seed，Phase2 对接真实数据源

## 交付标准

Demo 能在浏览器打开，看到：
1. 4个agent的状态卡片（含心跳时间、当前任务）
2. 信号时间线（可按类型/agent过滤）
3. 任务看板+生命周期事件流

**不需要完美，需要可运行。** 坦哥看到 demo 才好调方向。

## 关键约束

- Nous 是独立框架，不寄生 SelfMind
- 后端端口 8600，不和现有服务冲突
- Phase1 mock 数据，Phase2 再对接真实 gateway/kanban
- 认证从 Phase1 就启用（Bearer token）
- 8种信号类型全支持：HEARTBEAT/STATUS/BLOCKED/DONE/ASK:arch/ASK:impl/SYNC/REPAIR