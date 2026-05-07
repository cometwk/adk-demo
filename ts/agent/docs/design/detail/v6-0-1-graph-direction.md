评估：移除 direction: 'in'

1. 本体视角✅ 合理

Ontology 定义 RelationSchema，每个 schema 是一等公民：

{ type: 'borrows', fromType: 'Reader', toType: 'Book' }// 独立关系
{ type: 'borrowedBy', fromType: 'Book', toType: 'Reader' } // 独立关系

优点：

- 每个关系独立定义，语义清晰
- 与业务数据库外键方向一致（borrows 存在 Reader 表，borrowedBy 查询逻辑在 Book）
- 避免了"同一关系的两个方向"这种本体概念冗余

---

2. 图提供事实视角⚠️ 需要注意

图的本质是为 Agent 提供事实。

移除 direction: 'in' 后：

- Agent 从 Reader 出发，可通过 borrows 发现 Book ✅
- Agent 从 Book 出发，要发现"谁借了这本书"，必须：
  a. 知道 Book 类型有 borrowedBy 关系（依赖 System Prompt 披露）
  b. 业务开发者必须定义 borrowedBy 方法

风险：

- 如果业务只定义单向关系（如只有 borrows，没有 borrowedBy），Agent 无法反向探索
- Agent 的探索能力依赖业务开发者的完整定义

---

3. Agent 受控推理视角⚠️ 增加认知负担

受控推理意味着：System Prompt 给出入口实体 + Schema，Agent 按需探索。

移除 direction: 'in' 后的 Agent 探索路径：

入口：Reader(xiao_ming)
探索：Reader → borrows → Book(book_ai_history)
反向探索：Book → ?? → Reader(谁借了这本书？)

Agent 需要：

1. 知道 Book 类型有哪些 outgoing relations（依赖 Schema 披露）
2. 选择合适的关系（如 borrowedBy)
3. 调用 query_neighbors with direction='out'

对比保留 direction: 'in'：

反向探索：query_neighbors(book_ai_history, direction='in')
Agent 无需知道反向关系的存在，Graph 提供事实
