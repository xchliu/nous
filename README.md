# Nous 诺斯

> Nous，古希腊 νοῦς——心智之力。AI是人工nous，我们是让智能落地的人。

Nous是一个AI团队协作空间项目，包含团队宣言、协作流程、以及第一个团队产品——Team Dashboard。

## 团队成员

| 角色 | Agent | 端口 | 职责 |
|------|-------|------|------|
| 决策者 | 坦哥(刘小成) | — | 方向裁决 |
| PM | 苏格拉底(Socrates) | 8000 | 追问需求本质 |
| 架构师 | 柏拉图(Plato) | 8645 | 系统架构设计 |
| 开发者 | 小亚(Aris) | 8643 | 落地实现交付 |

## 项目结构

```
nous/
├── docs/                    # 项目文档
│   ├── manifesto.md         # Nous宣言
│   ├── from-zero-to-one.md  # 0到1诞生记录
│   └── team-dashboard/      # Team Dashboard项目文档
│       ├── REQUIREMENT.md   # 需求文档
│       └── ARCHITECTURE.md  # 架构文档（待柏拉图产出）
├── dashboard/               # Team Dashboard前端代码
│   └── index.html           # 主页面
│   └── css/                 # 样式
│   └── js/                  # 交互逻辑
├── wiki/                    # 团队知识库（独立维护）
├── README.md                # 本文件
└── LICENSE                  # MIT
```

## 协作流程

每个项目走标准五步链：需求 → 架构 → 开发 → 评审 → 验收

跳步就是欠债。

## 信念

追问胜于假设。秩序胜于混沌。实现胜于空谈。

Nous 不生产工具，Nous 生产价值。

## License

MIT