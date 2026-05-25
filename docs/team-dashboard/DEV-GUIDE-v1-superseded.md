---
title: Nous Dashboard 开发指引
project: nous/team-dashboard
author: 苏格拉底(Socrates)
created: 2026-05-25
version: 1.0
status: active
---

# Nous Dashboard 开发指引

> 柏拉图的ARCHITECTURE.md里有几个假设性的API端点，实际不存在。这份指引把架构对齐到真实数据源，小亚照这个开发。

## 真实数据源清单

### M1: 团队状态面板

| 数据 | 真实端点 | 返回格式 |
|------|----------|----------|
| 苏哥状态 | `GET http://localhost:8642/health` | `{"status":"ok","platform":"hermes-agent"}` |
| 小亚状态 | `GET http://localhost:8643/health` | 同上 |
| 柏拉图状态 | `GET http://localhost:8645/health` | 同上 |
| Grace状态 | `GET http://localhost:8644/health` | 同上(可选) |
| 主Gateway | `GET http://localhost:8000/health` | `{"status":"ok"}` |

**注意**: `/health`只返回status+platform，没有current_task和last_chat_summary。架构文档5.2节假设的字段不存在。

**M1实现策略**: AgentCard只显示在线/离线状态+平台名。未来可以在chat端点做探活来验证对话可用性(更真实的健康指标)。

### M2: Kanban任务看板

**真实数据源**: SQLite数据库 `~/.hermes/kanban.db`

Kanban没有HTTP API！数据直接在sqlite里。有两种方案：

**方案A(推荐): Python微型API服务**
在SelfMind的http_handler里加一个kanban路由，读取sqlite返回JSON。复用SelfMind已有的服务器架构。
```
GET /api/kanban/tasks → 返回所有任务列表
```
表结构：tasks(id, title, status, assignee, created_at, ...)

**方案B(最简): 前端直接读文件**
用SelfMind的静态文件服务暴露kanban.db不可行(二进制文件)。

**选方案A**：让小亚先在SelfMind加一个kanban API路由，这是前置依赖。

### M3: 黑板通知区

**真实数据源**: wiki文件系统
- 苏哥黑板: `/Users/liuxiaocheng/Documents/aiworkspace/wiki/blackboard/for-aris.md` (目前只有小亚的)
- 柏拉图黑板: `wiki/nous/for-plato.md`
- 小亚黑板: `wiki/nous/for-aris.md`

**注意**: blackboard目录下只有for-aris.md，柏拉图和苏哥的都在nous目录下。

**M3实现策略**: 通过SelfMind已有静态文件服务来读取wiki文件，或直接用fetch读取本地文件(file://协议需要特殊处理)。最简方案：SelfMind添加 `/api/blackboard` 路由，读取3个黑板文件并返回解析后的通知列表。

### M4: SelfMind记忆概览

| 数据 | 真实端点 | 返回格式 |
|------|----------|----------|
| 整体衰减趋势 | `GET /api/decay-trend` | `[{day, avg_decay, sample_count},...]` |
| 分类衰减趋势 | `GET /api/decay-trend-by-category` | `{category: [{day, avg_decay, sample_count},...]}` |
| 带agent过滤 | `GET /api/decay-trend-by-category?agent=hermes` | 同上(按source_profile过滤) |
| 综合统计 | `GET /api/stats` | `{L1-L5各层健康状态}` |

这些端点已经存在且可用。sparkline曲线直接用这些数据。

**M4实现策略**: 复用SelfMind已有的API，agent切换时传`?agent=xxx`参数。颜色映射：hermes=#2563eb, aris=#10b981, plato=#f97316, openclaw=#8b5cf6, grace=#f59e0b。

### M5: Wiki知识库索引

**真实数据源**: `wiki/index.md` 文件 + 文件系统扫描

没有HTTP API暴露wiki内容。需要：

**方案**: SelfMind添加 `/api/wiki/index` 路由，读取index.md并解析YAML frontmatter，返回分类文档树。

## 开发前置工作

小亚需要先在SelfMind后端加3个API路由：

1. **`/api/kanban/tasks`** — 读sqlite返回JSON任务列表
2. **`/api/blackboard`** — 读3个黑板文件返回通知列表
3. **`/api/wiki/index`** — 读index.md返回文档分类树

这三个路由加完后，Dashboard前端才有数据源可用。

## 技术约束(确认)

1. 纯HTML/CSS/JS，单文件index.html即可运行
2. 深色主题，Linear风格
3. 30秒自动轮询
4. SVG sparkline曲线(不用progress bar面积填充)
5. Agent异常红色告警
6. 记忆曲线按agent切换，颜色独立

## Phase拆分(按依赖关系)

### Phase 1: SelfMind API扩展(前置, 1天)
- 加kanban/blackboard/wiki三个API路由
- 测试验证

### Phase 2: Dashboard骨架+M1+M2(1天)
- HTML骨架+CSS深色主题
- Agent状态面板(4个AgentCard)
- Kanban看板(读新API)

### Phase 3: M3+M4+M5(1天)
- 黑板通知区
- 记忆曲线(复用已有API)
- Wiki索引

### Phase 4: 优化+验收(0.5天)
- 自动刷新+错误处理
- 响应式调整
- 坦哥验收

## 仓库位置

`/Users/liuxiaocheng/Documents/aiworkspace/nous/dashboard/index.html`

开发完成后push到GitHub: `git -c http.https.proxy=http://127.0.0.1:6152 push`

---

*苏格拉底 - PM*
*2026年5月25日*