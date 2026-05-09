# V7 核心框架

本系统, 围绕着将 AI 从简单的"图搜索工具"进化为"工业级决策支持系统"这一核心目标， 
经历了从 V5 到 V6 的深度演进。其核心框架可以总结为：

**本体（Ontology）定义规范、图（Graph）提供事实、Agent（Agent）执行受控推理**。

## 1 graph

本文的讨论范围:

1. 本体设计 (Ontology: G = {E, R, T, C})
  - T = TypeSchema + RelationSchema  
  - C = 不在讨论范围内 (C（准则/规则）的一等公民化)

2. 图数据与事实管理 (Graph & Facts)
  - graph: **渐进式实体披露 (Progressive Disclosure)**：System Prompt 仅提供入口实体和 Schema，
    Agent 必须通过 `inspect_node` 和 `query_neighbors` 按需探索图，以适配大规模数据和隐私权限场景。

  - facts (FactStore 与 FactBinding): 不在讨论范围内 
  - 权限与隐私 (PolicyContext)：不在讨论范围内

3. Agent 架构与推理逻辑 (Agent Loop): 不在讨论范围

## graph 相关文件

```text
src
├── runtime/
│   ├── schema.ts               ← 定义 Ontology Schema = RelationSchema + TypeSchema
│   ├── decorator.ts            ← 注解接口 agentProperty / methodtProperty / agentRelation
│   ├── registry.ts             ← 注解实现
│   ├── ontology-builder.ts     ← buildOntology: 提取 biz class 返回 Ontology = types + relations
│   ├── graph.ts                ← 图数据
│   └── types.ts                ← 基础类型: ToolResult / Page / FactBinding
│
```

可能更多的 ts 文件

