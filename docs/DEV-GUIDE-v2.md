# Nous Dashboard v2 — 开发指引

> 本文档反映当前实际架构。基于 ARCHITECTURE-v2.md 和 PROTOCOL.md。
> 目标：多智能体协同框架，黑板取任务→LLM分析→拆子任务→agent执行→归档。

## 当前架构概览

```
nous/
  backend/
    app.py              # Flask app, port 8600, 含 /api/agent-gateway 代理
    models.py           # 6 张表: agent_registry, signal_log, task_events, tasks, subtasks, agent_config
    routes_agents.py    # /api/agents/*
    routes_signals.py   # /api/signals/*
    routes_tasks.py     # /api/tasks/* + /api/tasks/<id>/subtasks + /api/tasks/<id>/archive
    nous.db             # SQLite 数据库
  frontend/
    static/
      index.html        # 入口页面
      css/style.css     # 样式
      js/config.js      # CONFIG: API地址/token/agent网关/定时/坐标
      js/api.js         # 数据层: nousFetch/agent gateway调用
      js/workflow.js    # 自动工作流: 信号消费→任务创建→LLM分析→子任务执行→归档
      js/conference.js  # 渲染: 黑板/议事桌/议程/档案柜/SVG动画
  docs/
    ARCHITECTURE-v2.md  # 架构文档
    PROTOCOL.md         # 多agent通信协议
    DEV-GUIDE-v2.md     # 本文档
```

## 数据模型（当前实际）

### 表0: tasks（黑板任务）

```sql
CREATE TABLE tasks (
    id              TEXT PRIMARY KEY,       -- T-{uuid8}, 如 T-bc41faf8
    title           TEXT NOT NULL,           -- 任务名，如 "报数"
    description     TEXT,                    -- 任务描述
    status          TEXT DEFAULT 'pending',  -- pending→processing→done→archived
    source_signal_id INTEGER,                -- 来源信号ID (FK signal_log)
    created_by      TEXT DEFAULT 'socrates',
    created_at      DATETIME,
    updated_at      DATETIME
);
```

### 表1: subtasks（执行计划）

```sql
CREATE TABLE subtasks (
    id         TEXT PRIMARY KEY,             -- ST-{uuid8}
    task_id    TEXT NOT NULL,                -- FK tasks.id
    name       TEXT NOT NULL,                -- 子任务名，如 "从1到10依次输出数字"
    assignee   TEXT,                         -- agent_id: socrates/aris/plato
    status     TEXT DEFAULT 'pending',       -- pending→in_progress→done
    result     TEXT,                         -- agent 执行结果报告（LLM输出）
    created_at DATETIME,
    updated_at DATETIME
);
```

### 表2: signal_log（通信信号）

信号有 `consumed` 布尔标记（consumed=True 的信号不再出现在黑板候选列表中）。
6 种信号类型：ASK:arch / ASK:impl / BLOCKED / DONE / REPAIR / SYNC / STATUS。HEARTBEAT 保留在 DB 但前端黑板过滤不显示。

### 其他表（不变）

agent_registry / task_events / agent_config — 与 ARCHITECTURE-v2.md 定义一致。

## 生命周期流程

```
用户/外部 → POST /api/tasks → tasks(status=pending)  ← 黑板
                                        ↓
苏格拉底取任务 → tasks(status→processing)
                                        ↓
苏格拉底调 LLM (8642 gateway) 分析任务 → 领域/复杂度/子任务计划
                                        ↓
拆子任务 → POST /api/tasks/{id}/subtasks → subtasks(pending)
                                        ↓
逐个子任务执行 → 调对应agent LLM (8643/8645 gateway) → subtasks(status→done) + result
                                        ↓
全部完成 → tasks(status→done) → 苏格拉底归档 → tasks(status→archived) ← 档案柜
```

三大数据原则：
1. 黑板取一少一：tasks 只有 pending/processing 状态的任务显示
2. 任务完成后进档案柜：tasks status='archived'，从黑板移除
3. 档案柜只增不减：归档任务永远保留

## Agent Gateway 代理

前端不能直接调 8642/8643/8645（CORS + Surge 代理拦截），统一通过 Nous 后端 8600 转发：

```
前端 callAgentGateway(agent, prompt)
  → POST /api/agent-gateway {agent_id, messages}
    → Flask 后端 requests.post() 调 agent gateway
      → 返回 LLM 响应
```

Flask 内部调 agent gateway 时必须加 `proxies={'http': None, 'https': None}` 绕过 Surge 代理。

## 认证

- Nous API Token：`nous-admin-token-v2`（从 /tmp/.nous_token 文件读取，避免 sandbox token 截断）
- Agent Gateway Token：socrates=`your-secret-key`, aris=`aris-secret`, plato=`plato-secret`
- 前端 `nousFetch` 统一带 `Authorization: Bearer ***`

## 配置项（frontend/static/js/config.js）

- NOUS_API/NOUS_TOKEN — API 地址和认证
- refreshInterval — 30 秒轮询
- timeout — 默认 5 秒 API 超时
- agentGateway — 三个 agent 的 url/key/model
- timing — 12 个动画/等待时长参数，用户可在 config 层修改
- SVG 坐标 — table/homePosition/deskPositions/workstationPositions

## 启动方式

```bash
cd nous/backend

# 确保 /tmp/.nous_token 包含令牌
echo -n "nous-admin-token-v2" > /tmp/.nous_token

# 启动后端
python app.py    # 端口 8600

# 浏览器打开
open http://localhost:8600
```

## 如何发任务给团队

```bash
# 通过 API 创建任务
curl -X POST http://localhost:8600/api/tasks \
  -H 'Authorization: Bearer nous-admin-token-v2' \
  -H 'Content-Type: application/json' \
  -d '{"title": "报数", "description": "从1数到10"}'
```

或者通过前端页面的"新增任务"输入框。

任务创建后自动进入黑板，苏格拉底会在下一轮自动取走、分析、拆解、分发执行。

## 技术栈

- 后端：Flask + SQLAlchemy + SQLite
- 前端：纯 HTML/CSS/JS，6 文件模块化（config/api/workflow/conference + index + css）
- 认证：Bearer token
- LLM：通过 agent gateway (8642/8643/8645) 调 DeepSeek 模型
- 部署：8600 端口独立进程
