---
title: Team Dashboard 架构设计文档
project: nous/team-dashboard
author: 柏拉图(Plato)
created: 2026-05-21
version: 1.0
status: draft
---

# Team Dashboard 架构设计文档

## 1. 概述

Team Dashboard 是 Nous 团队的可视化工作空间，为坦哥和团队成员提供实时团队状态、工作进度和协作信息的统一视图。本架构文档遵循需求文档（TD-002）的要求，定义技术实现方案。

## 2. 设计原则

- **简约实用**：单文件HTML实现，零依赖部署
- **实时动态**：30秒自动轮询，状态实时更新
- **深色主题**：Linear/Notion风格，视觉统一
- **响应式设计**：适配桌面浏览器，布局自适应
- **模块化架构**：5个功能模块独立开发维护

## 3. 技术栈选择

### 3.1 前端框架
- **核心**：原生 HTML5 + CSS3 + ES6 JavaScript
- **无框架约束**：遵循需求要求，不引入Vue/React等框架
- **CSS方案**：采用现代CSS Grid + Flexbox布局，深色主题定制

### 3.2 数据层
- **数据获取**：浏览器原生 `fetch()` API
- **数据格式**：JSON（所有后端服务返回JSON格式）
- **本地缓存**：使用 `localStorage` 暂存历史数据

### 3.3 通信层
- **HTTP客户端**：原生 `fetch()` + `AbortController`（支持超时控制）
- **轮询机制**：`setInterval` + 资源调度器
- **错误处理**：统一错误处理中间件

### 3.4 图表库
- **sparkline曲线**：原生SVG绘制（无需外部库）
- **动态渲染**：使用 `<svg>` 元素动态生成曲线
- **颜色主题**：hermes蓝(#2563eb)、aris绿(#10b981)、plato橙红(#f97316)

## 4. 组件架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    Team Dashboard 系统架构                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   API数据源层   │    │   前端应用层    │    │   数据持久层    │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ • Hermes Gateway│    │ • 状态管理机    │    │ • localStorage  │
│    - /health    │    │ • 轮询调度器    │    │ • 历史数据缓存  │
│    - /chat      │    │ • UI渲染引擎    │    │ • 离线回退数据  │
│                 │    │ • 错误处理器    │    │                 │
│ • 各Agent API   │    │                 │    │                 │
│    - :8642      │    │ ┌─────────────┐ │    │                 │
│    - :8643      │    │ │   M1-M5     │ │    │                 │
│    - :8645      │    │ │ 功能模块    │ │    │                 │
│                 │    │ │             │ │    │                 │
│ • Kanban API    │    │ └─────────────┘ │    │                 │
│                 │    │ • M1团队状态    │    │                 │
│ • SelfMind API  │    │ • M2任务看板    │    │                 │
│    - :3002      │    │ • M3黑板通知    │    │                 │
│                 │    │ • M4记忆概览    │    │                 │
│ • Wiki文件系统  │    │ • M5知识索引    │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘

数据流向说明：
API层 → fetch() → 前端应用层 → 状态更新 → UI渲染 → localStorage缓存
```

### 4.1 5个功能模块的组件拆分

#### M1: 团队状态面板 (Agent Status Panel)
```
┌─────────────────────────────────────────┐
│             M1团队状态面板               │
├─────────────────────────────────────────┤
│ Component      │ Responsibility         │
├────────────────┼─────────────────────────┤
│ AgentCard      │ 单Agent卡片显示        │
│ StatusIndicator│ 在线/离线状态指示器    │
│ HealthCheck    │ 对话端点探活检查        │
│ TaskDisplay    │ 当前执行任务显示        │
│ ChatSummary    │ 最近对话摘要显示        │
└────────────────┴─────────────────────────┘
数据流: Gateway API → fetch() → AgentCard → UI
```

#### M2: Kanban任务看板 (Task Kanban Board)
```
┌─────────────────────────────────────────┐
│             M2任务看板                   │
├─────────────────────────────────────────┤
│ Component      │ Responsibility         │
├────────────────┼─────────────────────────┤
│ KanbanBoard    │ 整体看板容器            │
│ StatusColumn   │ 状态列(Ready/Running等) │
│ TaskCard       │ 任务卡片组件            │
│ PriorityTag    │ 优先级标签显示          │
│ TimeIndicator  │ 时间指示器              │
└────────────────┴─────────────────────────┘
数据流: Kanban API → fetch() → KanbanBoard → 分列渲染
```

#### M3: 黑板通知区 (Blackboard Notifications)
```
┌─────────────────────────────────────────┐
│             M3黑板通知区                 │
├─────────────────────────────────────────┤
│ Component      │ Responsibility         │
├────────────────┼─────────────────────────┤
│ Blackboard     │ 通知区容器              │
│ NoticeBoard    │ 单块黑板显示            │
│ NoticeItem     │ 单条通知显示            │
│ TimeBadge      │ 时间标签                │
│ ExpandButton   │ 展开/收起按钮           │
└────────────────┴─────────────────────────┘
数据流: Wiki文件读取 → fetch() → Blackboard → 分板渲染
```

#### M4: 自Mind记忆概览 (SelfMind Memory Overview)
```
┌─────────────────────────────────────────┐
│             M4记忆概览                   │
├─────────────────────────────────────────┤
│ Component      │ Responsibility         │
├────────────────┼─────────────────────────┤
│ MemoryPanel    │ 记忆概览容器            │
│ StatsDisplay   │ 统计数据展示            │
│ SparklineChart │ sparkline曲线图表       │
│ AgentToggle    │ Agent切换器            │
│ TrendIndicator │ 趋势指示器              │
└────────────────┴─────────────────────────┘
数据流: SelfMind API → fetch() → SparklineChart → SVG动态绘制
```

#### M5: Wiki知识库索引 (Wiki Knowledge Index)
```
┌─────────────────────────────────────────┐
│             M5知识索引                   │
├─────────────────────────────────────────┤
│ Component      │ Responsibility         │
├────────────────┼─────────────────────────┤
│ WikiPanel      │ 知识索引容器            │
│ CategoryList   │ 分类列表                │
│ RecentDocs     │ 最近文档列表            │
│ DocItem        │ 文档项显示              │
│ LinkGraph      │ 关系链接图              │
└────────────────┴─────────────────────────┘
数据流: Wiki索引文件 → fetch() → CategoryList + RecentDocs
```

## 5. API层设计

### 5.1 数据源清单

| 数据源 | 类型 | 端点 | 用途 | 频率 |
|--------|------|------|------|------|
| Hermes Gateway | HTTP API | `http://localhost:8000/health` | 全局健康检查 | 30s |
| Socrates Agent | HTTP API | `http://localhost:8642/health` | 苏格拉底状态 | 30s |
| Aristotle Agent | HTTP API | `http://localhost:8643/health` | 亚理斯多德状态 | 30s |
| Plato Agent | HTTP API | `http://localhost:8645/health` | 柏拉图状态 | 30s |
| Kanban API | HTTP API | `http://localhost:{port}/api/kanban` | 任务看板数据 | 30s |
| SelfMind API | HTTP API | `http://localhost:3002/api/memory` | 记忆数据 | 30s |
| Wiki 文件 | 文件系统 | `file://wiki/blackboard/*.md` | 黑板通知 | 60s |
| Wiki 索引 | 文件系统 | `file://wiki/index.md` | 文档索引 | 120s |

### 5.2 API接口规范

#### Agent状态接口
```javascript
// 请求
GET http://localhost:8642/health

// 响应
{
  "status": "ok",  // "ok", "error", "unavailable"
  "platform": "hermes-agent",
  "timestamp": "2026-05-21T10:30:00Z",
  "current_task": "正在处理架构设计",
  "last_chat_summary": "讨论团队dashboard需求"
}
```

#### Kanban任务接口
```javascript
// 请求
GET http://localhost:{port}/api/kanban/tasks

// 响应
{
  "tasks": [
    {
      "id": "TD-002",
      "title": "Team Dashboard架构设计",
      "status": "Running",
      "assignee": "Plato",
      "priority": "high",
      "created_at": "2026-05-20T14:30:00Z",
      "progress_summary": "已完成需求分析，正在设计架构"
    }
  ]
}
```

#### SelfMind记忆接口
```javascript
// 请求
GET http://localhost:3002/api/memory/stats?agent=hermes

// 响应
{
  "agent": "hermes",
  "total_entries": 1250,
  "active_entries": 890,
  "average_decay": 0.25,
  "trend_data": [0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45, 0.4, 0.35],
  "timestamps": ["2026-05-11", "2026-05-12", ...]
}
```

### 5.3 API调用策略

1. **并发调用**：同一模块的数据源并行fetch
2. **错误降级**：某个API失败时使用缓存数据或空状态
3. **超时控制**：每个请求5秒超时，使用AbortController
4. **资源调度**：重要数据（Agent状态）优先，次要数据延后

## 6. 状态管理方案

### 6.1 核心状态结构
```javascript
const appState = {
  // M1: 团队状态
  agents: {
    socrates: { status: 'online', lastCheck: '...', currentTask: '...' },
    aristotle: { status: 'online', lastCheck: '...', currentTask: '...' },
    plato: { status: 'online', lastCheck: '...', currentTask: '...' }
  },
  
  // M2: 任务看板
  kanban: {
    ready: [...],
    running: [...],
    blocked: [...],
    done: [...],
    lastUpdated: '...'
  },
  
  // M3: 黑板通知
  blackboards: {
    forSocrates: [...],
    forAristotle: [...],
    forPlato: [...]
  },
  
  // M4: 记忆概览
  memory: {
    selectedAgent: 'hermes',
    stats: {...},
    trend: [...],
    lastUpdated: '...'
  },
  
  // M5: Wiki索引
  wiki: {
    categories: [...],
    recentDocs: [...],
    lastUpdated: '...'
  },
  
  // 应用状态
  ui: {
    darkMode: true,
    autoRefresh: true,
    refreshInterval: 30000,
    isLoading: false,
    lastFullRefresh: '...'
  }
};
```

### 6.2 状态更新机制
1. **轮询调度器**：统一管理所有数据源的刷新频率
2. **状态监听器**：状态变化时触发UI更新
3. **缓存策略**：localStorage存储历史状态，支持离线查看
4. **批量更新**：多个API返回后一次性更新UI，减少重绘

### 6.3 错误状态处理
```javascript
const errorStates = {
  NETWORK_ERROR: { color: '#ef4444', message: '网络连接失败', fallback: 'cached' },
  API_ERROR: { color: '#f59e0b', message: 'API服务异常', fallback: 'empty' },
  TIMEOUT: { color: '#8b5cf6', message: '请求超时', fallback: 'stale' },
  PARSE_ERROR: { color: '#ec4899', message: '数据格式错误', fallback: 'default' }
};
```

## 7. 部署方案

### 7.1 开发环境
```
部署方式：本地文件系统直接打开
路径：file:///Users/liuxiaocheng/Documents/aiworkspace/nous/dashboard/index.html
依赖：本地运行的API服务（Hermes Gateway, Kanban, SelfMind）
```

### 7.2 生产环境
```
方案A：纯静态HTML部署
- 单文件index.html包含所有CSS/JS
- 部署到任意Web服务器（nginx/apache）
- CORS配置允许访问本地API

方案B：轻量级代理服务器（备选）
- 如果需要跨域访问本地API
- 使用simple-http-proxy提供代理
- 仍然保持前端无框架约束
```

### 7.3 构建流程
```bash
# 无构建步骤，纯原生开发
1. 编辑 index.html
2. 编辑 style.css（内联或外联）
3. 编辑 app.js（模块化组织）
4. 浏览器直接测试
```

## 8. 性能优化策略

### 8.1 渲染优化
1. **虚拟DOM模拟**：手动DOM diff，减少不必要的更新
2. **分批渲染**：大数据集分页或虚拟滚动
3. **CSS优化**：使用transform代替left/top动画
4. **图片优化**：无外部图片依赖，纯CSS/SVG图形

### 8.2 数据加载优化
1. **增量更新**：只更新变化的数据部分
2. **请求合并**：相同端点的多次请求去重
3. **缓存策略**：
   - 内存缓存：最近数据
   - localStorage：历史数据（24小时过期）
   - 服务端缓存：依靠API自身缓存头

### 8.3 sparkline曲线优化
```javascript
// SVG sparkline生成算法
function generateSparkline(data, width=200, height=50, color='#2563eb') {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const points = data.map((value, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((value - min) / (max - min)) * height;
    return `${x},${y}`;
  }).join(' ');
  
  return `<svg width="${width}" height="${height}">
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2"/>
  </svg>`;
}
```

## 9. 安全考虑

### 9.1 跨域访问
- **开发环境**：本地文件协议允许跨域访问localhost
- **生产环境**：需要配置CORS或使用代理

### 9.2 数据安全
- 不存储敏感信息在localStorage
- API密钥不硬编码在前端
- 所有数据在客户端内存中处理

### 9.3 输入验证
- API响应数据验证
- 防止XSS攻击：innerText代替innerHTML
- SVG内容安全：不执行外部脚本

## 10. 开发路线图

### Phase 1: 基础框架 (1-2天)
- 项目结构搭建
- 深色主题CSS实现
- 状态管理机基础实现
- 轮询调度器实现

### Phase 2: 核心模块 (2-3天)
- M1团队状态面板实现
- M2任务看板基础展示
- M3黑板通知静态展示
- API数据对接测试

### Phase 3: 高级功能 (2天)
- M4记忆曲线动态绘制
- M5知识索引展示
- 错误处理和降级策略
- 性能优化和缓存实现

### Phase 4: 优化部署 (1天)
- 响应式布局完善
- 浏览器兼容性测试
- 文档和部署指南
- 坦哥验收准备

## 11. 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| API服务不稳定 | 数据不完整 | 中 | 实现降级策略，使用缓存数据 |
| 跨域访问限制 | 功能不可用 | 高 | 开发阶段使用文件协议，生产环境配置代理 |
| 浏览器兼容性 | 布局异常 | 低 | 使用现代CSS特性，提供fallback |
| 性能问题 | 界面卡顿 | 中 | 实现虚拟滚动，优化DOM操作 |
| 数据量过大 | 内存占用高 | 低 | 实现分页加载，清理历史缓存 |

## 12. 验收标准

1. ✅ 浏览器打开index.html即可使用，无需安装
2. ✅ 五个模块全部显示真实数据，无硬编码
3. ✅ Agent状态30秒自动刷新，异常状态红色高亮
4. ✅ 记忆曲线按agent切换正确显示不同数据
5. ✅ 深色主题，Linear风格，界面美观统一
6. ✅ 响应式布局，适配主流桌面浏览器
7. ✅ 错误处理完善，网络异常时优雅降级
8. ✅ 性能良好，无界面卡顿，内存占用合理

## 13. 附录

### 13.1 颜色方案
```
深色主题：
- 背景: #0f172a
- 卡片背景: #1e293b
- 文字主色: #f1f5f9
- 文字次色: #94a3b8
- 边框: #334155

状态颜色：
- 在线: #10b981
- 离线: #ef4444
- 警告: #f59e0b
- 进行中: #3b82f6

Agent专属色：
- hermes: #2563eb (蓝)
- aris: #10b981 (绿)
- plato: #f97316 (橙红)
```

### 13.2 文件结构
```
nous/
├── dashboard/
│   ├── index.html          # 主入口文件
│   ├── style.css           # 样式文件（可内联）
│   └── app.js              # 主应用逻辑
├── docs/
│   └── team-dashboard/
│       ├── REQUIREMENT.md  # 需求文档
│       └── ARCHITECTURE.md # 本架构文档
└── README.md
```

### 13.3 技术决策记录 (ADR)

**ADR-001: 无框架原生实现**
- 决策：不使用Vue/React等框架
- 理由：需求明确要求单文件HTML，零依赖部署
- 影响：需要手动实现状态管理和DOM更新

**ADR-002: 深色主题优先**
- 决策：默认深色主题，不提供主题切换
- 理由：Linear风格统一，符合现代设计趋势
- 影响：需要精心设计深色配色方案

**ADR-003: SVG sparkline曲线**
- 决策：使用原生SVG而非canvas或库
- 理由：轻量、可缩放、CSS可控制
- 影响：需要手动实现曲线生成算法

---

*架构设计完成，供小亚开发参考。有任何技术问题请及时反馈。*

**柏拉图 - 架构师**
*2026年5月21日*