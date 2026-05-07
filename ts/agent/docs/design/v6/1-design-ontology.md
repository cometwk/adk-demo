# 核心框架

该系统的设计与实现围绕着将 AI 从简单的“图搜索工具”进化为“工业级决策支持系统”这一核心目标， 
经历了从 V5 到 V6 的深度演进。其核心框架可以总结为：
**本体（Ontology）定义规范、图（Graph）提供事实、Agent（Agent）执行受控推理**。

本文的讨论范围:

1. 本体设计 (Ontology: G = {E, R, T, C})
  - T = TypeSchema + RelationSchema  
  - C = 不在讨论范围内 (C（准则/规则）的一等公民化)

2. 图数据与事实管理 (Graph & Facts)
  - graph: **渐进式实体披露 (Progressive Disclosure)**：System Prompt 仅提供入口实体和 Schema，
    Agent 必须通过 `inspect_node` 和 `query_neighbors` 按需探索图，以适配大规模数据和隐私权限场景。
    s
  - facts (FactStore 与 FactBinding): 不在讨论范围内 
  - 权限与隐私 (PolicyContext)：不在讨论范围内

3. Agent 架构与推理逻辑 (Agent Loop): 不在讨论范围


---
参考目前的实现
- @src/v6/ontology/schema.ts 本体模型中的 T
- @src/v6/runtime/graph.ts 本体模型中的 E, R
- @src/v6/agent/tools/graph.ts 按需探索图
  - search_nodes
  - inspect_node
  - query_neighbors

demo
- @src/v6/demo/ex4/entities.ts 定义 T 中的 TypeSchema
- @src/v6/demo/ex4/ontology.ts 定义 T
- @src/v6/demo/ex4/seed.ts 初始化 E , R


目前我有一个想法：

export class Reader extends BaseNode {
}

除了包含 agentProperty, agentMethod 方法之外，
还要我能包含 agentRelation , 来处理 graph 中 E 和 R 的数据，比如

```ts
const relations: RelationSchema[] = [
  { type: 'borrows',    fromType: 'Reader', toType: 'Book',    description: '读者当前借阅（已借出、未归还）' },
]

class Reader extends BaseNode {
  
  // 定义了 RelationSchema, 同时，实现了为实现 Graph.getOutEdges 提供了基础函数
  @agentRelation{
    type: 'borrows',  // 参考 RelationSchema 
    // fromType: 'Reader', // 这个不需要，类型就是本class
    toType: 'Book',   // 这是返回类型 
    description: '读者当前借阅（已借出、未归还）'
  }
  borrows():{
    // 在实际落地业务中，do somthing such as query db
    // ...

    return {'borrows': ['book-id-1', 'book-id-2']}  
  }

}
```

在具体的业务落地中，这样定义模式，方便跟实际的业务数据库的 DDL 和表关系绑定！

额外需要考虑的问题
1. Graph 中 需要评估 , 有必须区分 getOutEdges 和 getInEdges 吗？
2. BaseNode 提供 Graph.getOutEdges 到 agentRelation function 的辅助函数？

请详细评估该方案