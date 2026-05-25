---
title: Nous 协同框架需求文档
project: nous
author: 苏格拉底(Socrates)
created: 2026-05-25
version: 2.0
status: draft
supersedes: docs/team-dashboard/REQUIREMENT.md v1.1
---

# Nous 协同框架需求文档 v2.0

## 项目定位

**Nous 是多智能体协同框架，不是可视化工具。**

SelfMind = 单智能体记忆（每个agent的内世界）
Nous = 多智能体协同（agent之间的连接层）

Nous管理团队的三大可观测维度：
1. Agent自身状态 — 在线、心跳、当前任务、负载
2. Agent间沟通记录 — 信号流（ASK/DONE/BLOCKED/SYNC）
3. 任务状态 — 生命周期（分配→认领→进行→完成→验收）

Dashboard只是Nous的一个视图层，不是核心。核心是数据层+通信协议+调度机制。

## 目标用户

- 坦哥（决策者）— 一眼看三个维度，掌控团队节奏
- 苏哥（PM）— 调度任务、监听信号、验收交付
- 柏拉图（架构师）— 产出架构、评审交付、直连小亚答疑
- 小亚（开发者）— 执行开发、直连柏拉图答疑、广播完成信号

## 核心数据域

### D1: Agent Registry（agent自身状态）

每个agent的实时画像：

| 字段 | 来源 | 说明 |
|------|------|------|
| agent_id | 注册时指定 | hermes/aris/plato/grace/openclaw |
| name | 注册时指定 | 苏哥/小亚/柏拉图/Grace/OpenClaw |
| role | 注册时指定 | PM/Developer/Architect/... |
| gateway_url | 注册时指定 | http://localhost:8642 等 |
| status | 心跳探活 | online/offline/error |
| current_task | Kanban查询 | 当前Running状态的task title |
| last_activity | 信号日志 | 最近一条信号的时间+类型 |
| load | 自报 | 当前并发任务数 |

心跳机制：每30秒苏哥对每个gateway做/health探活，结果写入Agent Registry。
任务关联：苏哥查询Kanban DB的Running任务，按assignee匹配到agent。

### D2: Signal Log（agent间沟通记录）

全量持久化的结构化信号流：

| 信号类型 | 方向 | 格式 | 响应 |
|----------|------|------|------|
| STATUS | 任→苏哥 | agent_id + task_id + 进度% + 状态 | 苏哥更新Registry |
| BLOCKED | 任→苏哥 | agent_id + task_id + 阻塞原因 + 依赖 | 苏哥决定：换拓扑/等/介入 |
| DONE | 任→苏哥 | agent_id + task_id + 交付物路径 + 摘要 | 苏哥验收或转评审 |
| ASK:arch | 小亚→柏拉图 | 技术问题 + 上下文 + task_id | 柏拉图回答或指向文档 |
| ASK:impl | 柏拉图→小亚 | 实现建议 + 约束 + task_id | 小亚确认或反馈 |
| SYNC | 任→广播板 | agent_id + 我干了什么 | 无需响应，事后可查 |

信号存储：每条信号写入Signal Log DB，包含 from/to/type/task_id/content/timestamp。
信号获取：小亚/柏拉图通过gateway HTTP API直连通信，苏哥监听广播板。
信号协议：6种类型固定格式，响应一句话（fast model），不发自由文本大段消息。

### D3: Task Lifecycle（任务状态）

Kanban已有数据，需要Nous专属API暴露完整生命周期：

| 事件 | 含义 | 触发者 |
|------|------|--------|
| created | 任务创建 | 苏哥(PM) |
| claimed | 认领任务 | 小亚/柏拉图(worker) |
| spawned | 拆出子任务 | 苏哥(PM) |
| progress | 进度更新 | 执行者 |
| blocked | 阻塞 | 执行者 |
| unblocked | 解除阻塞 | 苏哥(PM)或依赖方 |
| submitted | 提交验收 | 执行者 |
| reviewed | 评审完成 | 柏拉图(架构师) |
| accepted | 验收通过 | 苏哥(PM) |
| rejected | 验收失败 | 苏哥(PM) |

数据来源：现有Kanban SQLite DB（/Users/liuxiaocheng/.hermes/kanban.db）
新增：生命周期事件流表（task_events），每条事件带 timestamp + actor + action + detail

## 通信架构

### 星型→网型拓扑

当前：所有信息流经过苏哥中转（星型）
目标：agent间技术问题直连，方向性决策过PM（网型）

直连通道：gateway HTTP API（已建好，4个gateway在线）
- 小亚→柏拉图：http://localhost:8645/v1/chat/completions
- 柏拉图→小亚：http://localhost:8643/v1/chat/completions
- 苏哥→任意：http://localhost:{port}/v1/chat/completions

直连边界：
- 技术问题（ASK:arch/ASK:impl）→ 直连，不过苏哥
- 进度/方向变更（STATUS/BLOCKED/DONE）→ 过苏哥，PM决策
- 广播（SYNC）→ 写入广播板，事后可查

### 信号自动推送

agent完成任务/遇到阻塞时，自动推送信号（post-task-hook）：
- 小亚worker完成后：自动发DONE信号到苏哥gateway + 写SYNC到广播板
- 柏拉图完成后：自动发DONE信号到苏哥gateway + 写SYNC到广播板
- 阻塞时：自动发BLOCKED信号到苏哥gateway

## 框架架构

### Nous后端

独立Python服务，不寄生SelfMind：
- 技术栈：Flask/FastAPI + SQLite
- 端口：8600（不与现有gateway冲突）
- DB：nous.db（独立于kanban.db和selfmind的memories.db）

三个API群：

| API群 | 端点 | 数据源 |
|--------|------|--------|
| /api/agents | CRUD + 心跳结果 | Agent Registry表 |
| /api/signals | 查询 + 写入 | Signal Log表 |
| /api/tasks | 任务列表 + 事件流 | Kanban DB + task_events表 |

### Dashboard前端

Nous框架的视图层，从后端API获取数据：
- 单HTML文件，深色主题，30秒轮询
- 三个核心视图对应三个数据域：
  1. Agent状态面板（D1）
  2. 信号时间线（D2）
  3. 任务看板+生命周期（D3）

### 数据同步

Agent Registry心跳：苏哥cron每30秒探活，写入Nous DB
Signal Log：gateway直连通信的信号写入Nous DB
Task Lifecycle：Kanban DB的事件写入Nous DB的task_events表

## 交付标准

1. Nous后端启动即可提供三个API群的数据
2. Dashboard能实时显示三个维度：agent状态/信号流/任务生命周期
3. agent间能直连通信（小亚↔柏拉图ASK信号）
4. 阻塞信号自动告警（BLOCKED→苏哥收到通知）
5. 坦哥验收通过才算交付

## 优先级

Nous是协同基础设施，优先级高于其他项目。团队脱节根因=协作拓扑太低维+信号机制缺失。