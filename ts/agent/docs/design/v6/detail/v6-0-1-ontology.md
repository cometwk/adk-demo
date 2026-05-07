# 建模 


## ontology 定义

> see think_v5.md

```
G = { E, R, T, C }

T: 类型/类集合
  - Engineer
  - Team
  - Project
  - DecisionTask
  - Evidence
  - CandidateAnswer

R: 关系 schema + 关系事实
  - schema: Engineer --member_of--> Team
  - schema: Engineer --assigned_to--> Project
  - schema: Project --depends_on--> Project
  - facts: 通过 tool 按需查询，不在 prompt 中全量展开

E: 实体集合
  - 不在 System Prompt 中全量注入
  - 通过入口实体、搜索、邻居查询、分页、字段投影逐步披露

C: 公理、约束、准则、权重、解释模板
  - 硬约束：不能违反的规则
  - 软约束：偏好、权重、评分维度
  - 推导规则：如何从事实得到中间判断
  - 冲突规则：多个信号冲突时如何呈现
  - 解释规则：最终答案如何引用事实和规则
```

在标准的 ontology 定义中， T 基本更加广泛的意义，在 v7 中做简化。

- T = TypeSchema + RelationSchema (且全量出现在提示词中)
  - Agent 现在拿到的地图从"只知道有哪些节点类型"升级为"知道类型之间有哪些边可走"，
    Planner 可以据此规划 `expectedSubgraphs` 中该沿哪些 relation 展开。 
- R = graph Edge 且受到 RelationSchema 约束
- E = graph Node 且受到 TypeSchema 约束
- C = 业务规则


## 代码实现

1. 先定义 `T`

```ts
@agentType({ description: '图书馆馆藏书籍，可能有新书保护期限制' })
export class Book extends BaseNode {
  // 包含属性和方法
  @agentProperty
  @agentMethod
} 
class Library {}
class Reader {}
```

2. 再定义 `R`

```ts
const relations: RelationSchema[] = [
  { type: 'borrows',    fromType: 'Reader', toType: 'Book',    description: '读者当前借阅（已借出、未归还）' },
  { type: 'overdue',    fromType: 'Reader', toType: 'Book',    description: '读者持有的逾期未还书籍' },
  { type: 'requests',   fromType: 'Reader', toType: 'Book',    description: '读者正在申请借阅的书籍' },
  { type: 'managed_by', fromType: 'Book',   toType: 'Library', description: '书籍归属于某个图书馆管理' },
]
```

3. 再注册 `C`

```ts
// ── Library borrow-request decision rules ──
//
// 三条核心约束规则，对应图书馆借阅规定：
//   Rule 1 — borrow_limit_exceeded  : 每人最多借 3 本（hard_constraint）
//   Rule 2 — new_book_not_lendable  : 新书（< 7 天）不可外借（hard_constraint）
//   Rule 3 — overdue_blocks_borrow  : 有逾期书籍则无法借新书（hard_constraint）
//
// 另有一条 soft_criterion 作为正向评分依据（读者资质良好）。
registerLibraryRules()
```

4. 最后创建 `G = E + R` (且受到 `T` = `TypeSchema + RelationSchema` 约束)

目前 v7 存在一个问题：G 是预先创建的固定尺寸。



## 讨论

在工程上，你可以把 E 当作 new T() ——这是一个非常好的建模起点
> ❗ 虽然, 在本体论理论上：E 不一定有 T、可以有多个 T、甚至 T 本身也是 E


### Q1：RelationSchema 和 Edge 到底是什么关系？

在 G = {E, R, T, C} 中，R 本身有**两个层次**：

```
R_schema (类型层)    R_fact (实例层)
────────────────    ──────────────────────────────
RelationSchema      Edge
from: "Reader"      from: "xiao_ming"   (node id)
to:   "Book"        to:   "book_ai_history"
type: "borrows"     type: "borrows"
description: ...    (无描述)
```

这就是 T ↔ E 的对应关系在 R 上的镜像：
- `TypeSchema` : `BaseNode` = `RelationSchema` : `Edge`
- `TypeSchema` 描述**可能存在的实体类型**，`RelationSchema` 描述**可能存在的边类型**
- `BaseNode` 是具体实例，`Edge` 是具体边

---

### Q2：E = new T() 是正确简化吗？

是的。本项目做了合理的 closed-world 简化：

```
本体论通用      →    本项目简化
──────────────────────────────────────
E 可无 T             每个 E 必有一个 T
E 可有多个 T         E = new T(id, ...)
T 自身也可以是 E      T = TS/JS class
```

这个简化没有副作用，反而让 Registry + 装饰器系统成立。

---

### Q3：既然 E = new T()，能否把 R 简化为 graph edge？

- `RelationSchema` 是 Schema，`Edge` 是 Instance。  
- `new T()` 受 TypeSchema 约束，`addEdge()` 同理应受 RelationSchema 约束。

```
T 层          E 层
──────────    ──────────────────────────────────
TypeSchema    BaseNode (new Reader / Book / Library)
              → @agentType 装饰器注册到 Registry

RelationSchema  Edge (addEdge)
                → Graph 构造时注入 relations
                → addEdge 验证 type / fromType / toType
```



**`addEdge` 现在强制执行两件事：**

1. **edge.type 必须已在 RelationSchema 中声明** — 防止 typo 或未定义的边类型悄悄进图
2. **fromNode / toNode 的 class 名必须与 schema 中的 fromType / toType 一致** — 防止错把 Library 节点连到 `borrows` 边的 from 端

**调用顺序（执行时序）现在反映设计意图：**

```
1. ontology.ts   → 声明 RelationSchema（先定义约束）
2. main.ts       → setupLibraryScenario({ relations })（将约束注入 Graph）
3. seed.ts       → addEdge(...)（在约束下写入事实）
```


### Q4-1：RelationSchema 在 prompt 中完全缺失

看 `prompt.ts` 第 19-24 行生成 `typesSummary`：

```35:36:src/v7/agent/prompt.ts
# Ontology 类型摘要
${typesSummary}
```

实际输出类似：

```
Reader: currentBorrowCount, hasOverdueBook, name | methods: checkBorrowEligibility
Book: title, isbn, daysOnShelf, lendable | methods: checkNewBookStatus
Library: maxBorrowPerReader, newBookProtectionDays | methods: evaluateBorrowRequest
```

**但 `ontology.relations` 从未被放入 prompt。** Agent 完全不知道 Reader → Book 之间有 `borrows`、`overdue`、`requests` 三种边。

这导致：
- **Planner 无法合理规划图探索路径** — 它不知道该沿哪些 relation 展开
- **Executor 发现边是"偶然"的** — 只有在 `inspect_node({ fields: ['outEdges'] })` 时才能发现
- **Agent 可能遗漏关键关系** — 因为它不知道这些关系的存在

### Q4-2：TypeSchema 对 Agent 的意义是"概念地图"，而非"操作入口"

Agent 不能直接 `new Reader()`，它通过 `inspect_node(nodeId)` 间接感知类型。TypeSchema 在 prompt 中的作用是：

```
"告诉 Agent：当你遇到一个 Reader 节点，它有 currentBorrowCount 属性可以读取"
→ 这是节点级的探索地图
```

但完整的探索地图应该是：

```
"告诉 Agent：Reader 和 Book 之间有 borrows/overdue/requests 关系可以查询"
→ 这是图结构级的探索地图
```

**缺了后者，Agent 只有节点维度的地图，没有边维度的地图。**


**改动摘要**：`prompt.ts` 三处 prompt 构建函数都加入了 `ontology.relations` 摘要：

| Prompt | 之前 | 之后 |
|---|---|---|
| Predictive | 只有 types | types + relations（含 description） |
| Planner | 只有 type names | type names + 关系结构图 |
| Diagnostic | 只有 types | types + relations（含 description） |

Agent 现在拿到的地图从"只知道有哪些节点类型"升级为"知道类型之间有哪些边可走"，Planner 可以据此规划 `expectedSubgraphs` 中该沿哪些 relation 展开。
