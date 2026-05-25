---
title: Nous 通信协议规范
project: nous
author: 苏格拉底(Socrates)
created: 2026-05-25
version: 1.0
status: draft
---

# Nous 通信协议规范 v1.0

## 设计原则

1. **结构化优于自由文本** — 每条信号有固定schema，机器可解析，人可阅读
2. **轻量优于重量** — 一句话信号用一句话，不写段落；深度讨论走gateway正常对话
3. **可靠优于实时** — 信号必须持久化到Signal Log，丢失可重放；实时是锦上添花
4. **直连优于中转** — 技术问题agent间直连，方向决策过苏哥PM
5. **可观测优于隐蔽** — 所有信号写入统一时间线，事后可查可复盘

## 通信拓扑

从星型（苏哥中转一切）升级为网型（agent直连+苏哥监管）：

```
星型拓扑（当前）：
  苏哥 ←→ 小亚
  苏哥 ←→ 柏拉图
  小亚和柏拉图不相通，所有信息流经苏哥

网型拓扑（目标）：
  苏哥 ←→ 小亚     (PM↔开发：任务分配/验收/阻塞)
  苏哥 ←→ 柏拉图   (PM↔架构：需求→架构/评审)
  小亚 ←→ 柏拉图   (开发↔架构：技术直连，ASK:arch/ASK:impl)
  苏哥 ←→ 全员     (广播：方向决策/告警/通知)
```

**边界规则（B类半开放）：**
- 技术层面：小亚↔柏拉图直连，不限频率不限内容
- 进度层面：DONE/BLOCKED信号必须同时发给苏哥（PM需要可观测）
- 方向层面：项目方向变更、优先级调整、新项目启动——必须经苏哥决策，agent不自作主张

## 传输通道

Nous使用三种通道，各有适用场景：

### 通道1: Gateway API（实时双向）

- 端点：各agent的 `/v1/chat/completions`
- 格式：OpenAI兼容格式
- 适用：需要对方回复的交互式通信（ASK:arch、ASK:impl）
- 认证：Bearer token（各agent的api_server_key）
- 响应模型：stream模式，TTFB预期<10秒（快模型）

```
小亚 → 柏拉图（ASK:arch）：
POST http://localhost:8645/v1/chat/completions
Authorization: Bearer plato-secret
Content-Type: application/json

{
  "model": "deepseek-v4-pro",
  "messages": [
    {"role": "system", "content": "你是柏拉图，Nous团队架构师。收到技术问题请简洁回答。"},
    {"role": "user", "content": "[ASK:arch] TD-003 | SelfMind API扩展：/api/agent-health需要返回哪些字段？当前health只返回status+platform。"}
  ],
  "max_tokens": 200,
  "stream": true
}
```

**Gateway通信规范：**
- system prompt必须声明agent身份和角色
- max_tokens限制在200以内（信号类通信不需要长回复）
- 请求体必须包含信号标签（[ASK:arch]等）作为第一行
- 超时策略：15秒TTFB + 30秒总超时。超时后降级到黑板通道

### 通道2: Nous API（结构化信号写入）

- 端点：Nous后端 `/api/signals`
- 格式：JSON结构化信号（见下文信号schema）
- 适用：不需要对方即时回复的状态推送（DONE/BLOCKED/SYNC）
- 认证：Nous API token（后续配置）
- 响应模型：同步确认，200 OK + signal_id

```
小亚 → Nous后端（DONE信号）：
POST http://localhost:8600/api/signals
Content-Type: application/json

{
  "from_agent": "aris",
  "to_agent": "hermes",
  "type": "DONE",
  "task_id": "TD-003",
  "content": "Phase1 SelfMind API扩展完成。新增3个路由：/api/agent-health, /api/kanban/events, /api/kanban/comments",
  "metadata": {
    "deliverables": ["app.py:新增3个route", "test_api.py:15个test case"],
    "commit": "a3f2c1b"
  }
}
```

### 通道3: 黑板广播（异步全员可见）

- 端点：wiki/nous/signals.md 文件追加
- 格式：Markdown时间线条目
- 适用：全员广播类信息（SYNC信号、项目状态更新）
- 认证：无（wiki文件系统，agent通过worker写入）
- 响应模型：无响应（广播性质，不期待回复）

```
黑板条目格式：
## 2026-05-25 11:00 — aris [SYNC]
TD-003 Phase1完成。SelfMind新增3个API路由。下一阶段：前端开发。
```

**通道降级策略：**

| 场景 | 主通道 | 降级通道 |
|------|--------|----------|
| Gateway超时(TTFB>15s) | Gateway API | 黑板广播 |
| Gateway离线 | Gateway API | Nous API(写入Signal Log) + 黑板 |
| Nous后端离线 | Nous API | 黑板广播(手动恢复时批量写入Signal Log) |
| 全通道不可用 | — | 苏哥cron恢复通道后，从黑板文件重建Signal Log |

## 信号Schema

### 通用信号格式

每条信号遵循统一schema，6个必填字段 + 可选metadata：

```json
{
  "from_agent": "string, required — 发送方agent_id",
  "to_agent": "string or null, required — 接收方agent_id，null=广播",
  "type": "string, required — 信号类型（见下文）",
  "task_id": "string or null — 关联Kanban任务ID",
  "content": "string, required — 信号内容",
  "metadata": "object, optional — 结构化扩展信息",
  "created_at": "datetime, auto — 发送时间（服务端写入）"
}
```

### 6种信号类型

#### 1. STATUS — 状态汇报

```json
{
  "from_agent": "aris",
  "to_agent": "hermes",
  "type": "STATUS",
  "task_id": "TD-003",
  "content": "TD-003 进度70%，3个路由已完成2个，第3个正在开发",
  "metadata": {
    "progress_pct": 70,
    "estimated_completion": "2026-05-25T15:00:00"
  }
}
```

触发时机：苏哥12:00进度check时主动查询，或agent主动推送
响应期待：无（单向信息）
通道：Nous API

#### 2. BLOCKED — 阻塞告警

```json
{
  "from_agent": "aris",
  "to_agent": "hermes",
  "type": "BLOCKED",
  "task_id": "TD-003",
  "content": "SelfMind /api/agent-health需要agent的current_task字段，但gateway /health不返回此信息",
  "metadata": {
    "blocker_type": "missing_data",
    "dependency": "gateway_health_api",
    "suggestions": ["扩展gateway /health端点", "从kanban.db推断current_task"]
  }
}
```

触发时机：agent遇到无法自行解决的阻塞，立即发送
响应期待：苏哥决策（换拓扑/介入/等）
通道：Nous API + 苏哥gateway（紧急）
**BLOCKED信号必须同时发给苏哥——PM是阻塞的唯一决策者**

#### 3. DONE — 任务完成

```json
{
  "from_agent": "aris",
  "to_agent": "hermes",
  "type": "DONE",
  "task_id": "TD-003",
  "content": "Phase1完成，3个API路由已开发并测试通过",
  "metadata": {
    "deliverables": ["app.py: /api/agent-health", "app.py: /api/kanban/events", "app.py: /api/kanban/comments"],
    "commit": "a3f2c1b",
    "test_results": "15/15 pass"
  }
}
```

触发时机：agent完成任务时自动发送（worker post-task-hook）
响应期待：苏哥验收，或转柏拉图评审
通道：Nous API + 黑板广播(SYNC)
**DONE信号必须同时发给苏哥——验收是PM职责**

#### 4. ASK:arch — 技术架构问询

```json
{
  "from_agent": "aris",
  "to_agent": "plato",
  "type": "ASK:arch",
  "task_id": "TD-003",
  "content": "SelfMind API扩展：/api/agent-health需要返回哪些字段？当前health只返回status+platform",
  "metadata": {
    "question_scope": "api_design",
    "urgency": "normal"
  }
}
```

触发时机：开发agent遇到架构设计问题，直连架构师
响应期待：柏拉图简洁回答（max_tokens=200）
通道：Gateway API（实时） + 信号写入（记录）
**ASK:arch可以不经过苏哥，但信号必须写入Signal Log——事后可查**

#### 5. ASK:impl — 实现建议反馈

```json
{
  "from_agent": "plato",
  "to_agent": "aris",
  "type": "ASK:impl",
  "task_id": "TD-003",
  "content": "/api/agent-health应该返回：status, platform, current_task, last_chat_summary, uptime_seconds",
  "metadata": {
    "answer_type": "field_list",
    "reference": "ARCHITECTURE-v2.md §API群1"
  }
}
```

触发时机：架构师回复开发者的ASK:arch
响应期待：开发者确认或反馈
通道：Gateway API（实时） + 信号写入（记录）
**ASK:impl是ASK:arch的回复，形成问答配对，Signal Log中关联**

#### 6. SYNC — 全员广播

```json
{
  "from_agent": "aris",
  "to_agent": null,
  "type": "SYNC",
  "task_id": "TD-003",
  "content": "Phase1完成，进入Phase2前端开发阶段",
  "metadata": {
    "broadcast_scope": "all",
    "phase_transition": true
  }
}
```

触发时机：重要里程碑完成、阶段切换、项目状态更新
响应期待：无（广播性质）
通道：黑板 + Nous API（全员可见）

## 信号生命周期

每条信号从发送到归档经过以下阶段：

```
发送 → 传输 → 持久化 → 可观测 → 归档

1. 发送：agent worker触发（自动）或agent主动调用（手动）
2. 传输：选择通道（Gateway/Nous API/黑板），失败则降级
3. 持久化：写入Signal Log（nous.db），黑洞安全（不会丢失）
4. 可观测：Dashboard时间线实时显示，苏哥可查可过滤
5. 归档：信号30天后自动压缩摘要（保留元数据，content压缩为关键词）
```

**可靠性保证：**
- Signal Log是信号的最终归宿——无论通道是否成功，信号必须在Log中有记录
- 黑板文件作为降级通道的备份——通道恢复后批量同步到Signal Log
- 苏哥的每日7:00巡检检查黑板和Signal Log的一致性，发现差异则补录

## 信号频率规范

| 信号类型 | 频率上限 | 触发方式 |
|----------|----------|----------|
| STATUS | 每任务每2小时1次 | agent主动或苏哥查询 |
| BLOCKED | 无限制（立即发送） | 遇阻塞即发 |
| DONE | 每任务完成时1次 | worker自动触发 |
| ASK:arch | 每任务每4小时最多3次 | 开发者主动 |
| ASK:impl | 对应ASK:arch的回复 | 架构师回复 |
| SYNC | 每阶段切换时1次 | 里程碑触发 |

**防噪音规则：**
- STATUS不发重复内容（进度没变化不发）
- ASK系列不问同一问题两次（如果柏拉图已回答，不再问）
- SYNC只在阶段切换时广播，不用于日常进度汇报
- BLOCKED是唯一"不限频率"的信号——阻塞是紧急事件

## 认证与安全

### Gateway认证

每个agent的gateway使用独立api_server_key：
- 苏哥(8642): socrates-secret
- 小亚(8643): aris-secret
- 柏拉图(8645): plato-secret
- Grace(8644): grace-secret

所有gateway互调必须带Authorization: Bearer {target_agent_key}

### Nous API认证

Phase1：内部网络，无认证（localhost only）
Phase2：API token认证（各agent注册时分配）

### 数据隔离

- Signal Log存储所有agent间通信——苏哥可查全部，agent只能查涉及自己的
- agent_registry数据公开——任何agent可查其他agent状态
- task_events公开——任务生命周期全员可见

## Agent离线容错与任务接管

### 核心原则

**信道可以降级，任务不能悬空。** agent离线是预期内的事件（进程崩溃、网络中断、维护重启），但离线agent手里的任务必须有明确的处理机制——不能等它回来才继续推进。

### 离线分级与响应策略

苏哥的心跳探活cron每30秒检测一次gateway状态。根据连续离线时长，触发不同级别的任务处理：

| 级别 | 离线时长 | 触发条件 | 任务处理 |
|------|----------|----------|----------|
| L0 短暂 | <5分钟 | 1-2次探活失败 | **冻结**：任务标记为suspended，等待agent恢复。不影响其他并行任务流 |
| L1 中度 | 5-30分钟 | 连续10次探活失败 | **告警+评估**：苏哥收到企微告警，评估该agent任务是否可被其他agent接管。同时检查黑板有无BLOCKED信号（agent可能在离线前发了阻塞信号） |
| L2 长期 | >30分钟 | 连续60次探活失败 | **自动接管**：任务从离线agent解绑，苏哥重新分配给在线agent。任务优先级不变，接替agent继承任务上下文（黑板+Signal Log） |
| L3 不可恢复 | >2小时 | 连续240次探活失败 | **人工介入**：苏哥告警坦哥，坦哥决定：1)运维修复agent 2)项目方向调整 3)任务降级或取消 |

### 任务接管协议

当agent进入L2长期离线，苏哥执行以下接管流程：

```
1. 查询离线agent持有的所有in_progress任务
   → SELECT * FROM kanban_tasks WHERE assigned_to = 'offline_agent' AND status = 'in_progress'

2. 任务解绑
   → UPDATE kanban_tasks SET assigned_to = NULL, status = 'reassigned' WHERE ...

3. 生成REASSIGNED事件
   → INSERT INTO task_events (task_id, event_type, actor, metadata)
     VALUES ('TD-003', 'reassigned', 'hermes', '{"from": "offline_agent", "reason": "L2_offline"}')

4. 评估接管可行性
   → 任务类型匹配：架构任务→柏拉图，开发任务→小亚
   → agent负载检查：接替agent当前in_progress任务数<2才分配
   → 依赖链检查：任务是否依赖离线agent的未完成产出？依赖则暂停等待

5. 重新分配
   → UPDATE kanban_tasks SET assigned_to = 'new_agent', status = 'in_progress' WHERE ...

6. 广播接管信号
   → SYNC信号："{offline_agent} L2离线，TD-003由{new_agent}接管"
   → 黑板追加接管记录

7. 上下文传递给接替agent
   → 接替agent查询Signal Log获取任务全部历史信号
   → 接替agent查询黑板获取离线agent的工作记录
   → 接替agent获得完整上下文后开始工作
```

### 不可接管的任务

某些任务不可自动接管，需等待原agent恢复或坦哥决策：

| 任务特征 | 处理方式 |
|----------|----------|
| 深度架构设计（柏拉图独有能力） | 暂停等待，苏哥评估是否可以简化架构让小亚推进 |
| 有本地未提交代码的in_progress开发 | 暂停等待，代码在离线agent本地可能不完整 |
| 需要特定agent认证的操作（如企微推送） | 暂停等待或苏哥代行 |
| 坦哥明确指定某agent执行的任务 | 通知坦哥，等待决策 |

### 自恢复机制

agent恢复在线后，苏哥执行以下恢复流程：

```
1. 心跳探活检测到agent恢复
2. 查询该agent被解绑的任务
   → SELECT * FROM kanban_tasks WHERE original_assigned_to = 'recovered_agent' AND status = 'reassigned'

3. 两种恢复路径：
   a) 任务未被接管（仍在reassigned状态）→ 重新分配给原agent
   b) 任务已被其他agent接管（in_progress）→ 不干扰，原agent接收新任务

4. 广播恢复信号
   → SYNC: "{recovered_agent}恢复在线，{任务状态描述}"

5. 检查Signal Log一致性
   → 对比黑板记录和Signal Log，补录离线期间的遗漏信号
```

### 预期外离线的零容忍

**核心规则：agent预期外的离线等同于生产事故。**

- 每次L1+离线，苏哥自动生成离线事件记录（agent_id, 离线时间, 恢复时间, 影响任务数, 接管情况）
- 每周回顾统计每个agent的离线次数和时长，坦哥可见
- 同一agent连续2天出现L1+离线→苏哥主动排查根因（进程稳定性、网络、配置）
- 同一agent一周内3次L1+离线→告警坦哥，需要人工介入修复

**目标：Nous框架运行稳定后，L1+离线应该为零。偶尔L0短暂闪断是可接受的，但超过5分钟的离线不应该常态化。**

## 错误处理

### 传输层错误

| 错误场景 | 处理策略 |
|----------|----------|
| Gateway返回非200 | 降级到黑板，写入BLOCKED信号说明通信失败 |
| Gateway超时(TTFB>15s) | 降级到黑板，15秒后切断连接 |
| Nous API写入失败 | 写入黑板文件，苏哥巡检时补录 |
| 黑板文件不可写 | 本地缓存，进程恢复后写入 |

### 信号层错误

| 错误场景 | 处理策略 |
|----------|----------|
| 信号schema不符合 | 拒绝写入，返回400 + schema说明 |
| 重复信号(相同from+type+task+content) | 忽略重复，返回409 + 已有signal_id |
| BLOCKED信号无task_id | 接受但不关联任务，标记为general_block |
| ASK信号to_agent不是架构师/开发者 | 拒绝，ASK:arch只能to=plato，ASK:impl只能to=aris |

## 问答配对追踪

ASK:arch和ASK:impl形成问答配对，Signal Log中关联：

```sql
-- 查询某次ASK:arch的所有回复
SELECT * FROM signal_log 
WHERE type = 'ASK:impl' 
  AND task_id = 'TD-003' 
  AND created_at > (SELECT created_at FROM signal_log WHERE id = {ask_signal_id})
ORDER BY created_at;
```

Dashboard视图层：时间线上ASK:arch节点和对应ASK:impl节点用连线可视化配对。

## 实施顺序

### Phase0: 协议落地（苏哥，今天）

1. 定义PROTOCOL.md（本文档）
2. 柏拉图评审协议设计
3. 确认后作为ARCHITECTURE-v2的补充文档

### Phase1: 基础信号流通（小亚+苏哥，本周）

1. Nous后端 `/api/signals` POST端点上线
2. 苏哥worker加post-task-hook：任务完成时发DONE信号
3. 小亚worker加post-task-hook：任务完成时发DONE信号
4. 黑板signals.md自动追加机制
5. 降级策略测试：模拟Gateway超时→验证黑板降级

### Phase2: Agent直连（小亚+柏拉图，本周）

1. 小亚→柏拉图 ASK:arch 通道打通（gateway互调）
2. 柏拉图→小亚 ASK:impl 通道打通
3. 信号写入Signal Log同步验证
4. Dashboard时间线显示ASK问答配对

### Phase3: 心跳探活+状态自动更新（苏哥，下周）

1. 苏哥cron每30秒探活4个gateway
2. agent_registry自动更新status/load/current_task
3. BLOCKED信号自动触发企微告警
4. STATUS信号自动触发Dashboard刷新

## 验收标准

1. 6种信号类型全部可发送、可持久化、可查询
2. 小亚↔柏拉图ASK直连通道工作，问答配对可追踪
3. Gateway超时时降级到黑板，信号不丢失
4. 黑板与Signal Log数据一致（每日巡检验证）
5. Dashboard时间线实时显示所有信号流
6. BLOCKED信号3分钟内苏哥收到告警
7. 坦哥验收：能看到三个信息——agent状态、沟通记录、任务状态