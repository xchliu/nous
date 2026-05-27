---
title: Nous 协同框架架构文档
project: nous
author: 苏格拉底(Socrates)
created: 2026-05-25
version: 2.0
status: draft
supersedes: docs/team-dashboard/ARCHITECTURE.md v1.0
---

# Nous 协同框架架构文档 v2.0

## 设计哲学

**Nous不是Dashboard，是框架。** Dashboard是视图层，框架包含数据层+通信协议+调度机制。

SelfMind管单智能体记忆（内世界），Nous管多智能体协同（连接层）。两者独立，各有自己的数据主权。

核心原则：
1. 数据主权——Nous有自己的DB，不寄生SelfMind/Hermes/文件系统
2. 信号驱动——agent间通信用结构化信号协议，不用自由文本
3. 并行拓扑——任务依赖图驱动并行分配，不是串行排队
4. 可观测三角——agent状态/沟通记录/任务状态，三个维度必须同时可见

## 系统架构

```
┌─────────────────────────────────────────────────┐
│                   Dashboard (视图层)              │
│  Agent面板 │ 信号时间线 │ 任务看板 │ 拓扑图      │
└─────────────────────┬───────────────────────────┘
                      │ HTTP API
┌─────────────────────┴───────────────────────────┐
│               Nous Backend (数据层)               │
│  Agent Registry │ Signal Log │ Task Lifecycle    │
│       SQLite nous.db (独立数据库)                 │
└─────────────────────┬───────────────────────────┘
                      │
          ┌───────────┼───────────┐
          │           │           │
    心跳探活    信号收发    Kanban同步
          │           │           │
┌─────────┴──┐  ┌─────┴────┐  ┌──┴─────────┐
│ Gateways   │  │ 黑板文件  │  │ kanban.db  │
│ 8642-8645  │  │ wiki/    │  │ .hermes/   │
└────────────┘  └──────────┘  └─────────────┘
```

## 后端设计

### 技术栈

- 语言：Python 3
- 框架：Flask（轻量，与SelfMind一致）
- 数据库：SQLite（nous.db，独立于kanban.db和memories.db）
- 端口：8600
- 部署：与SelfMind同进程或独立进程（Phase1先同进程简化部署，Phase2可拆分）

### 数据模型

#### 表1: agent_registry

```sql
CREATE TABLE agent_registry (
    agent_id   TEXT PRIMARY KEY,  -- hermes/aris/plato
    name       TEXT NOT NULL,      -- 苏哥/小亚/柏拉图
    role       TEXT NOT NULL,      -- PM/Developer/Architect/Observer/Worker
    gateway_url TEXT,              -- http://localhost:8642 等
    status     TEXT DEFAULT 'offline',  -- online/offline/error
    current_task TEXT,             -- 当前Running状态的task title
    last_activity TEXT,            -- 最近一条信号的摘要
    last_activity_at DATETIME,     -- 最近活动时间
    load       INTEGER DEFAULT 0,  -- 当前并发任务数
    registered_at DATETIME,
    updated_at  DATETIME
);
```

数据来源：
- status/gateway_url：苏哥cron每30秒探活gateway /health端点，写入此表
- current_task：苏哥查询kanban.db的running任务，按assignee匹配
- last_activity：从signal_log取最近一条该agent的信号
- load：从kanban.db统计该agent的running任务数

#### 表2: tasks（黑板任务 — v2.1新增）

任务实体表，取代从信号直接生成任务的旧模式。黑板的数据源。

```sql
CREATE TABLE tasks (
    id              TEXT PRIMARY KEY,       -- T-{uuid8}, 如 T-bc41faf8
    title           TEXT NOT NULL,           -- 任务名
    description     TEXT,                    -- 任务描述
    status          TEXT DEFAULT 'pending',  -- pending→processing→done→archived
    source_signal_id INTEGER,                -- 来源信号ID，FK signal_log.id
    created_by      TEXT DEFAULT 'socrates',
    created_at      DATETIME,
    updated_at      DATETIME
);
```

status 生命周期：pending(黑板待取) → processing(苏格拉底分析中/执行中) → done(全部子任务完成) → archived(已归档)

#### 表3: subtasks（执行计划 — v2.1新增）

每个任务拆分为多个子步骤，每个子步骤分配给一个 agent 执行。

```sql
CREATE TABLE subtasks (
    id         TEXT PRIMARY KEY,             -- ST-{uuid8}
    task_id    TEXT NOT NULL,                -- FK tasks.id
    name       TEXT NOT NULL,                -- 子任务名
    assignee   TEXT,                         -- agent_id (socrates/aris/plato)
    status     TEXT DEFAULT 'pending',       -- pending→in_progress→done
    result     TEXT,                         -- agent 执行结果报告
    created_at DATETIME,
    updated_at DATETIME
);
```

子任务 result 字段存储 agent LLM 执行的完整输出，归档后可在档案柜详情中查看。

#### 表4: signal_log

```sql
CREATE TABLE signal_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    from_agent TEXT NOT NULL,      -- 发送方agent_id
    to_agent   TEXT,               -- 接收方agent_id（NULL=广播）
    type       TEXT NOT NULL,      -- STATUS/BLOCKED/DONE/ASK:arch/ASK:impl/SYNC
    task_id    TEXT,               -- 关联的Kanban task ID
    content    TEXT NOT NULL,      -- 信号内容（结构化JSON或文本）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

数据来源：
- gateway直连通信：小亚→柏拉图(ASK:arch)、柏拉图→小亚(ASK:impl)的HTTP请求记录
- 自动推送：agent worker的post-task-hook写入DONE/BLOCKED/SYNC信号
- 苏哥监听：苏哥收到agent发来的信号后写入此表

#### 表5: task_events

```sql
CREATE TABLE task_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id    TEXT NOT NULL,      -- Kanban task ID
    action     TEXT NOT NULL,      -- created/claimed/spawned/progress/blocked/unblocked/submitted/reviewed/accepted/rejected
    actor      TEXT NOT NULL,      -- 触发者agent_id
    detail     TEXT,               -- 事件详情
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

数据来源：
- 苏哥创建任务时写入created事件
- agent认领时写入claimed事件
- 任务状态变更时写入对应事件
- 与kanban.db的tasks表关联（task_id对应），但独立存储事件流

#### 表6: agent_config

```sql
CREATE TABLE agent_config (
    agent_id       TEXT PRIMARY KEY,
    api_key        TEXT,               -- gateway认证key
    nous_token     TEXT UNIQUE,        -- Nous API认证token（注册时生成）
    role           TEXT DEFAULT 'agent', -- admin/agent角色权限
    model          TEXT,               -- 使用的模型
    profile        TEXT,               -- hermes profile
    extra          TEXT                -- JSON格式的扩展配置
);
```

数据来源：注册时手动录入，对应各agent的gateway配置。nous_token由Nous后端自动生成（32字符随机串），写入各agent的.env中NOUS_API_TOKEN变量。

### 认证机制

所有Nous API端点强制Bearer token认证：

**认证方式：** `Authorization: Bearer {nous_token}`

**角色权限：**
- admin（苏哥）：全部读写权限，包括注册/移除agent、查看全部信号、任务重分配
- agent（小亚/柏拉图）：信号写入+任务读取+状态查询，不可访问管理端点

**管理端点（admin token only）：**
- POST /api/agents/register — 注册新agent，生成token
- DELETE /api/agents/{id} — 移除agent
- GET /admin/signals — 查看全部信号（不限agent）
- POST /admin/tasks/reassign — 任务重分配

**未认证请求一律返回 401 Unauthorized。**

### API设计

#### API群1: /api/agents

```
GET  /api/agents              -- 列出所有agent及其状态
GET  /api/agents/:id          -- 单个agent详情
POST /api/agents              -- 注册新agent
PUT  /api/agents/:id          -- 更新agent信息
GET  /api/agents/:id/heartbeat -- 强制刷新心跳（立即探活）
```

响应示例：
```json
{
  "agents": [
    {
      "agent_id": "hermes",
      "name": "苏哥",
      "role": "PM",
      "gateway_url": "http://localhost:8642",
      "status": "online",
      "current_task": "Nous架构文档v2",
      "last_activity": "DONE: TD-001 需求文档",
      "last_activity_at": "2026-05-25T10:30:00",
      "load": 2
    }
  ]
}
```

#### API群2: /api/signals

```
GET  /api/signals              -- 查询信号流（支持from/to/type/task_id过滤）
GET  /api/signals/:id          -- 单条信号详情
POST /api/signals              -- 写入新信号（agent直连时自动调用）
GET  /api/signals/timeline     -- 统一时间线（按时间排序，支持agent/type过滤）
```

查询参数：
- from_agent: 发送方过滤
- to_agent: 接收方过滤
- type: 信号类型过滤（STATUS/BLOCKED/DONE/ASK:arch/ASK:impl/SYNC）
- task_id: 关联任务过滤
- since: 时间起点（ISO datetime）
- limit: 返回条数

响应示例：
```json
{
  "signals": [
    {
      "id": 42,
      "from_agent": "aris",
      "to_agent": "plato",
      "type": "ASK:arch",
      "task_id": "TD-003",
      "content": "SelfMind API扩展：/api/agent-health需要返回哪些字段？",
      "created_at": "2026-05-25T11:00:00"
    },
    {
      "id": 41,
      "from_agent": "plato",
      "to_agent": null,
      "type": "SYNC",
      "task_id": "TD-002",
      "content": "架构文档v2已完成，路径: nous/docs/ARCHITECTURE-v2.md",
      "created_at": "2026-05-25T10:30:00"
    }
  ]
}
```

#### API群3: /api/tasks

```
GET  /api/tasks                -- 任务列表（从kanban.db读取）
GET  /api/tasks/:id            -- 单个任务详情
GET  /api/tasks/:id/events     -- 任务生命周期事件流
GET  /api/tasks/board          -- 看板视图（按状态分组）
```

数据来源：直接读取kanban.db（不迁移数据，只暴露API）。
事件流：从task_events表读取该任务的所有生命周期事件。

响应示例：
```json
{
  "task": {
    "id": "TD-003",
    "title": "Phase1: SelfMind API扩展",
    "status": "running",
    "assignee": "aris",
    "parent_id": "TD-001",
    "events": [
      {"action": "created", "actor": "hermes", "detail": "需求文档TD-001完成", "at": "2026-05-25T09:00:00"},
      {"action": "claimed", "actor": "aris", "detail": "认领开发", "at": "2026-05-25T09:05:00"},
      {"action": "progress", "actor": "aris", "detail": "50% - API路由完成", "at": "2026-05-25T11:00:00"}
    ]
  }
}
```

### 心跳探活机制

苏哥的cron job每30秒对所有agent gateway做探活：

1. HTTP GET各gateway的/health端点
2. 结果写入agent_registry的status字段（online/error）
3. 同时查询kanban.db的running任务，更新current_task和load
4. 如果status从online→error，触发告警信号

心跳探活用苏哥的gateway自循环执行（不依赖外部cron），确保Nous后端数据持续更新。

### 信号收发机制

信号流转路径：

```
小亚完成任务 → worker post-task-hook → 
    ├─ POST /api/signals (DONE信号，写入Signal Log)
    ├─ POST 苏哥gateway /v1/chat/completions (通知苏哥)
    └─ APPEND wiki/nous/signals.md (SYNC广播)

小亚问架构问题 → POST 柏拉图gateway /v1/chat/completions (ASK:arch) →
    ├─ 柏拉图回答 → POST 小亚gateway /v1/chat/completions (ASK:impl回复)
    └─ 双方信号写入Signal Log (POST /api/signals)
```

信号写入触发点：
1. agent worker的post-task-hook（自动，DONE/BLOCKED/SYNC）
2. gateway直连通信时，苏哥cron监听并记录
- 手动写入（苏哥创建任务时记录created事件）

### 任务工作流（v2.1）

完整生命周期：

```
外部/用户 → POST /api/tasks → tasks(status=pending)     ← 黑板
                                        ↓
苏格拉底定时扫描黑板 → tasks(status→processing)
                                        ↓
苏格拉底调 LLM (8642) 分析任务 → 领域/复杂度/子任务计划
                                        ↓
子任务落库 → POST /api/tasks/{id}/subtasks → subtasks(pending)
                                        ↓
逐个子任务执行 → 调对应agent LLM (8643/8645)
  → subtasks(status→done, result=LLM输出)
                                        ↓
全部子任务完成 → tasks(status→done)
                                        ↓
苏格拉底归档 → tasks(status→archived)    ← 档案柜（只增不减）
```

三条数据原则：
1. 黑板取一少一：仅显示 pending/processing 状态的任务
2. 任务完成后进档案柜：status='archived'，从黑板移除
3. 档案柜只增不减：归档任务永久保留

### Agent Gateway 代理（v2.1）

前端调用 agent LLM 需通过 Nous 后端转发，避免 CORS 和 Surge 代理冲突：

```
前端 callAgentGateway(agent, prompt)
  → POST /api/agent-gateway {agent_id, messages}
    → Flask requests.post(agent.url, proxies={'http': None, 'https': None})
      → Agent Gateway (8642/8643/8645)
        → 返回 LLM 响应
```

### 黑板过滤（v2.1）

前端黑板视图过滤 HEARTBEAT 信号，只显示可操作信号（ASK/BLOCKED/REPAIR/DONE/SYNC/STATUS）。
agent 在线状态独立从 agent_registry.heartbeat_status 读取，不受黑板过滤影响。

## 前端设计

### Dashboard视图

单HTML文件，深色主题，30秒轮询Nous后端API。

三个核心视图对应三个数据域：

#### View1: Agent状态面板

- 每个agent一行卡片：名字/角色/状态灯(绿/红/灰)/当前任务/最近活动/负载
- 状态灯实时刷新（心跳探活结果）
- 点击卡片展开详情（最近5条信号）

#### View2: 信号时间线

- 垂直时间线，每条信号一个节点
- 颜色编码：DONE=绿/BLOCKED=红/ASK=黄/SYNC=蓝/STATUS=灰
- 支持按agent/type/时间范围过滤
- 点击节点展开信号详情

#### View3: 任务看板+生命周期

- 左侧：经典看板（Backlog/Running/Done列）
- 右侧：选中任务的生命周期事件流
- 事件流每个节点一行：action + actor + time + detail
- 任务间依赖关系可视化（parent→children连线）

### 技术实现

- 纯HTML+CSS+JS，无框架依赖
- 数据源：Nous后端API（/api/agents, /api/signals, /api/tasks）
- 刷新：30秒轮询 + 关键操作手动刷新
- 主题：深色背景(#0a0a0f)，高对比文字，与SelfMind风格一致

## 并行拓扑执行模型

### 任务依赖图

苏哥拆项目时画依赖拓扑，不是排队：

```
传统串行：需求→架构→开发→评审→验收 (5阶段串行)

并行拓扑：
  苏哥需求(TD-001) ✅
      ├─ 柏拉图架构模块1(TD-002a) → 小亚开发模块1(TD-003a)
      └─ 柏拉图架构模块2(TD-002b) → 小亚开发模块2(TD-003b)
                          ├── 柏拉图评审(TD-004)
                          └── 苏哥验收(TD-005)
```

无依赖的子任务并行分配给不同agent。架构分模块交付，第一个模块出来小亚就开始开发。

### 拓扑调度

Kanban任务的parent/children关系定义依赖：
- parent完成→children才能开始（自动检查）
- 同一parent下的多个children可并行（无互相依赖时）
- 苏哥在创建任务时指定parent_id建立依赖链

## 数据流向总览

```
┌──────────┐     心跳探活      ┌─────────────┐
│ Gateways │ ──────────────→  │ agent_registry │
│ 8642-64  │                   └─────────────┘
└──────────┘                        
                                     ↑
┌──────────┐     信号写入      ┌─────────────┐
│ Agent    │ ──────────────→  │  signal_log   │
│ Workers  │   POST /api/     └─────────────┘
└──────────┘   signals             
                                     ↑
┌──────────┐     事件记录      ┌─────────────┐
│ 苏哥(PM) │ ──────────────→  │ task_events   │
│ Kanban   │   创建/分配/     └─────────────┘
└──────────┘   验收               
                                     ↑
                                     │
                              ┌──────┴──────┐
                              │  nous.db     │
                              │  (SQLite)    │
                              └─────────────┘
                                     │
                                     ↓
                              ┌─────────────┐
                              │  Dashboard   │
                              │  GET /api/   │
                              └─────────────┘
```

## 部署方案

### Phase1: 同进程部署（最快落地）

Nous后端与SelfMind共用同一个Flask进程，在8600端口或SelfMind端口上增加路由。

优点：零额外部署，复用SelfMind的进程管理。
缺点：SelfMind和Nous耦合（但Phase1只为快速验证）。

### Phase2: 独立进程部署（生产架构）

Nous后端独立Flask进程，8600端口，独立进程管理。

优点：数据主权完全独立，SelfMind和Nous互不影响。
缺点：多一个进程需要管理。

## 实施路径

### M1: Nous后端核心（苏哥+小亚）

- Flask应用骨架 + SQLite数据模型
- 三个API群（agents/signals/tasks）
- 心跳探活逻辑
- kanban.db数据读取适配

### M2: Dashboard前端（小亚）

- Agent状态面板（View1）
- 信号时间线（View2）
- 任务看板+生命周期（View3）

### M3: 信号协议集成（苏哥+小亚）

- agent worker post-task-hook
- gateway直连通信记录
- 黑板广播自动写入Signal Log

### M4: 并行拓扑调度（苏哥）

- Kanban任务依赖链完善
- 拓扑可视化（依赖图）
- 自动并行分配逻辑

### M5: 告警与通知（苏哥）

- agent离线告警（status从online→error）
- 阻塞信号告警（BLOCKED信号触发通知）
- 企微推送集成

## 与柏拉图v1架构的对比

| 维度 | v1（柏拉图仪表盘） | v2（Nous框架） |
|------|---------------------|----------------|
| 定位 | 前端可视化页面 | 多智能体协同框架 |
| 数据层 | 寄生SelfMind/Hermes | Nous独立DB |
| 通信 | 无agent间直连 | Gateway直连+信号协议 |
| 调度 | 无（串行排队） | 并行拓扑+依赖图 |
| 可观测 | 只有任务列表 | 三角：状态/信号/任务 |
| 通知 | 无 | 心跳探活+阻塞告警 |

## 验收标准

1. Nous后端8600端口启动，三个API群返回真实数据
2. Dashboard显示三个维度：agent状态/信号时间线/任务看板
3. 心跳探活持续运行，agent状态实时更新
4. 小亚↔柏拉图ASK信号直连，写入Signal Log
5. 任务生命周期事件流可查
6. 坦哥验收通过才算交付