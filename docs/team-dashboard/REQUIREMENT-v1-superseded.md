---
title: Team Dashboard 需求文档
project: nous/team-dashboard
author: 苏格拉底(Socrates)
created: 2026-05-20
updated: 2026-05-22
version: 1.1
status: approved
---

# Team Dashboard 需求文档

## 项目背景

Nous团队需要一个统一的工作空间，让坦哥和团队成员能实时看到整个团队的状态、工作进度和协作信息。这是Nous三人协作的第一个验证项目，走标准五步链：需求→架构→开发→评审→验收。

## 目标用户

- 坦哥（决策者）— 一眼看全局，快速判断团队状态和任务进展
- 苏哥（PM）— 追踪需求、验收交付
- 柏拉图（架构师）— 查看架构任务和评审状态
- 小亚（开发者）— 查看开发任务和黑板通知

## 核心功能模块

### M1: 团队状态面板

展示三个agent的实时状态：
- 在线/离线状态（基于gateway健康检查）
- 对话端点可用性（真正的探活指标）
- 当前正在执行的任务
- 最近一条对话摘要

数据来源：各agent的gateway API (/health + /chat)

### M2: Kanban任务看板

展示所有任务卡片，按状态分栏：
- Ready — 待认领
- Running — 进行中
- Blocked — 阻塞
- Done — 已完成

每张卡片显示：
- 任务ID和标题
- Assignee（苏哥/柏拉图/小亚）
- 创建时间和进度摘要
- 优先级标签

数据来源：Hermes Kanban API

### M3: 黑板通知区

展示三块黑板（for-socrates, for-aris, for-plato）的最新通知：
- 每块黑板按时间倒序显示最近5条
- 点击可展开查看完整内容
- 新通知高亮标记

数据来源：wiki/blackboard/ 目录文件

### M4: 自Mind记忆概览

展示团队记忆健康状态：
- 总条目数 / 活跃条目数
- 平均衰减分数
- 记忆强度趋势曲线（sparkline）
- 按agent切换的记忆曲线（hermes蓝/aris绿/plato橙红）

数据来源：SelfMind HTTP API (localhost:3002)

### M5: Wiki知识库索引

展示wiki文档树：
- 按type分类（project/concept/nous/daily-report等）
- 最近更新的5篇文档
- 文档间关系链接

数据来源：wiki/index.md + SelfMind wiki API

## 交互要求

1. 页面自动刷新（30秒轮询），不手动刷新
2. Agent状态异常时红色告警
3. Kanban卡片可拖拽切换状态（未来功能，v1先只展示）
4. 记忆曲线切换agent时重新加载对应数据
5. 深色主题，Linear/Notion风格，界面干净

## 技术约束

1. 纯前端HTML/CSS/JS，无需后端框架
2. 数据通过API fetch获取，不硬编码
3. 所有API endpoint用localhost（同一台机器部署）
4. 响应式布局，适配桌面浏览器
5. 曲线图用SVG sparkline，不用progress bar面积填充

## 交付标准

1. 浏览器打开index.html即可使用
2. 五个模块全部可交互、有真实数据
3. Agent状态实时准确（对话端点探活）
4. 记忆曲线按agent切换正确显示
5. 坦哥验收通过才算交付