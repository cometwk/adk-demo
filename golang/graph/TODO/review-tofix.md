这份内容是一份详尽的**架构/设计文档评审结果报告**，主要针对一个自定义查询语言（DSL）及其编译器、规划器的设计。

以下是完整的中文翻译，保留了原有的排版、表格结构以及技术术语：

---

## 文档评审结果

* **评审文档**：`docs/query-dsl.md`（查询 DSL 文档）, `docs/query-planner.md`（查询规划器文档）, `docs/query-compiler.md`（查询编译器文档）
* **类型**：规划/方案 (plan)
* **评审角色**：coherence（一致性视角）、feasibility（可行性视角）、scope-guardian（范围把控视角）、security-lens（安全视角）、adversarial（对抗性/极端情况视角）
* **scope-guardian** —— 3 份文档中包含超过 10 个实现单元以及新的抽象概念
* **security-lens** —— 暴露了 API 端点、涉及 SQL 生成，但未指定认证模型
* **adversarial** —— 包含 5 个以上需求、重大架构决策以及新的抽象概念



已应用 1 项自动修复。打包了 5 项修复等待审批。共有 15 项发现需要考虑（8 个错误，7 个遗漏）。

### 已应用自动修复

* **移除了 `query-compiler.md` 中第 8.3 节 SQL 示例里重复的 `LIMIT ? OFFSET ?**` —— 外层查询不应重新进行分页，因为内层子查询已经控制了根行数（涉及视角：feasibility, scope-guardian）。

---

### 批量确认

以下修复有明确且唯一的正确答案，但会触及文档的核心含义。是否全部应用？

| # | 章节 | 修复方案 | 评审角色 |
| --- | --- | --- | --- |
| 1 | query-compiler 6.1 | 在 `CompileQuery` 和 `CompileAggregate` 函数签名中添加 `rootPrimaryKey` 字符串参数，并将其贯穿到 API 处理器示例中。 | feasibility,<br> |
| 2 | query-dsl 4 /<br> <br>query-compiler 7.5 | 增加校验逻辑：`in`/`not_in` 操作符要求数组不能为空；在 `expandInOp` 中处理空数组时，使用 `1=0`/`1=1` 作为兜底策略。 | adversarial |
| 3 | query-compiler 10 | 将 `engine.SQL(sql, args...).Find(&rows)` 替换为 `engine.SQL(sql, args...).QueryInterface()` —— 因为 Xorm 的 `Find()` 用于结构体切片，而 `QueryInterface()` 返回 `[]map[string]interface{}`。 | feasibility |
| 4 | query-compiler 12.1 | 纠正错误的安全声明：将“非用户直接输入”替换为诚实的陈述，即 V1 字段名是由用户提供的 DSL 输入，且未经过校验，其安全性取决于 API 的访问控制。 | adversarial,<br> <br>security-lens |
| 5 | query-compiler 10 | 明确选择 Web 框架（Gin 或 Echo）并更新处理器示例；现有代码库使用的是 Echo。 | feasibility |

---

### P0 —— 必须修复

#### 错误 (Errors)

| # | 章节 | 问题描述 | Reviewer | 置信度 |
| --- | --- | --- | --- | --- |
| 1 | query-compiler<br> <br>7.9.2 | **根节点优先分页（Root Pagination First）**：第一个子查询仅应用了根谓词，但外层查询中的存在性过滤器（existential filters）会在分页后消除行，从而导致产出的页面结果少于请求的数量。子查询的边界定义不清：必须包含非扇出 JOIN（non-fan-out JOINs）、它们的谓词以及所有存在性作用域；只有扇出 JOIN（fan-out JOIN）应该延迟到外层查询中。 | adversarial | 0.92 |

#### 遗漏 (Omissions)

| # | 章节 | 问题描述 | Reviewer | 置信度 |
| --- | --- | --- | --- | --- |
| 2 | query-dsl 8 /<br> <br>query-compiler 10 | 未对 3 个 POST 端点指定任何身份验证/授权机制。缺乏调用者（Actor）、角色（Role）或权限模型。究竟谁可以调用这些 API？ | security-lens | 0.92 |
| 3 | query-compiler<br> <br>12.1 / 12.3 | **存在 SQL 注入风险**：未经验证的字段/表名（如 `select.fields`、`where.field`、`order_by.field`、`group_by.field`）是用户提供的 DSL 值，并被直接拼接到了 SQL 字符串中。安全声明（“来自 TraversalPlan IR，非用户直接输入”）是不正确的 —— 规划器（Planner）虽然验证了别名的唯一性和关系的存在性，但明确**没有**验证字段名。 | security-lens,<br> <br>adversarial | 0.90 |
| 4 | query-dsl 1 /<br> <br>query-planner 9.3 | **表名大小写不匹配**：DSL 使用了大驼峰 `PascalCase`（"AgentRel"），但 `RelationSchema` 使用的是蛇形命名 `snake_case`（"agent_rel"）。第二阶段的校验直接对比了这些字符串。§9.3 中的演练错误地将 `"AgentRel" == "agent_rel"` 标记为通过。需要引入命名规范或映射层。 | feasibility | 0.90 |

---

### P1 —— 应该修复

#### 错误 (Errors)

| # | 章节 | 问题描述 | Reviewer | 置信度 |
| --- | --- | --- | --- | --- |
| 5 | query-compiler<br>

<br>5.5 | **聚合安全规则过度限制**：V1 版本禁止在非扇出（non-fan-out）别名上进行**所有**指标计算，但 `GROUP BY rel.agent_no, COUNT(od.id)` 在语义上是正确的（基于每个根节点对扇出端点进行 COUNT）。该规则应细化为：允许对父节点进行 GROUP BY + 对扇出节点进行 COUNT，仅拦截在父节点上进行 SUM/AVG 的操作。 | adversarial | 0.78 |

#### 遗漏 (Omissions)

| # | 章节 | 问题描述 | Reviewer | 置信度 |
| --- | --- | --- | --- | --- |
| 6 | query-planner 8 /<br>

<br>query-compiler 10 | `plan_token` 是规范化 JSON 的 SHA256 哈希值（确定性、可预先计算），并作为 URL 查询参数传递（会被记录到日志中），且在重复使用时没有过期时间或认证检查。应该使用密码学随机的 UUID、设置 TTL（生存时间），并在请求体或请求头中传递。 | security-lens | 0.85 |
| 7 | query-compiler 7.9.2 | 列出了 3 种确定 `rootPrimaryKey`（根主键）的方法，但未选定任何一种。这是 `PaginateRootFirst` 的核心细节 —— 错误的字段会导致错误或重复的结果。必须在实现前予以明确。 | adversarial | 0.85 |
| 8 | query-planner 5.2 /<br>

<br>query-dsl 2 | V1 版本中对“存在性叶节点（existential-leaf）”的禁止，导致无法表达“全称量词（universal quantification）”模式（例如，“所有订单都满足 X 的商户”）。目前没有证据表明实际的查询模式是否需要此功能。需在文档中注明哪些模式在 V1 中是无法实现的。 | adversarial | 0.82 |
| 9 | query-dsl 2-3 /<br>

<br>query-compiler 7 | **缺乏资源限制**：没有最大遍历步数限制、没有最大 IN 数组大小限制、没有最大 LIMIT 上限、没有查询超时机制、没有限流。这为数据库带来了拒绝服务攻击（DoS）的风险。 | security-lens | 0.82 |
| 10 | query-compiler 10 | 查询了敏感财务数据（`deposit_amt` 存款金额、`trans_amt` 交易金额），但没有任何数据分类、行级安全（RLS）或租户隔离措施。 | security-lens | 0.80 |
| 11 | query-dsl 2 | 线性流水线（Linear pipeline）DSL 无法表达分支遍历（即从同一个节点延伸出两个关系，例如：“商户及其代理商以及他们的订单”）。文档未承认这一局限性。 | adversarial | 0.75 |
| 12 | query-compiler 11.2 | 原生 SQL 编译器的决策仅针对 `Xorm Builder` 进行了评估。未考虑其他支持子查询和 `EXISTS` 的 Go 语言 SQL 构建器（如 `squirrel`、`goqu`）。 | adversarial | 0.72 |

---

### P2 —— 考虑修复

#### 遗漏 (Omissions)

| # | 章节 | 问题描述 | Reviewer | 置信度 |
| --- | --- | --- | --- | --- |
| 13 | query-planner 8.2 | V1 版本的 `PlanCache` 使用了 `sync.Map`，但没有大小限制、TTL 或淘汰机制 —— 这会导致长期运行的进程中内存无限制增长。 | feasibility,<br>

<br>adversarial | 0.70 |
| 14 | query-compiler 7.5 | `LIKE` 操作符接受任意的用户输入模式，且没有通配符限制 —— 这会导致数据被枚举以及高昂的全表扫描开销。 | security-lens | 0.72 |
| 15 | query-dsl 8 /<br>

<br>query-compiler 10 | 两阶段调用的 API 模式（先生成方案 plan，再执行查询 query）增加了延迟，且没有为一次性查询提供单次调用的便利选项。 | adversarial | 0.70 |

---

### 残留疑虑 (Residual Concerns)

| # | 疑虑点 | 来源视角 |
| --- | --- | --- |
| 1 | 未解决多列主键在“根节点优先分页（Root Pagination First）”下的正确性问题。 | feasibility |
| 2 | Plan ID 的确定性依赖于任意类型 `WherePredicate.Value` 的 JSON 序列化结果 —— 不同的调用者可能会对相同的值进行不同的序列化。 | adversarial |
| 3 | 现有的 `demo/pkg/query/` 包具有重叠的操作符映射（eq/neq/gt/gte/lt/lte/in/notIn/like/isNull）和聚合函数集 —— 文档未提及或承认这一点。 | feasibility |
| 4 | V2 版本的 Redis 缓存引入了新的攻击面（Redis 认证、网络暴露、序列化问题），文档未做阐述。 | security-lens |

---

### 暂缓问题 (Deferred Questions)

| # | 问题 | 来源视角 |
| --- | --- | --- |
| 1 | DSL 中的 `match.type` 应该使用 `snake_case`（与 SQL 保持一致），还是使用大驼峰 `PascalCase` 并配合映射层？ | feasibility,<br>

<br>adversarial |
| 2 | 实际业务查询中，有多少比例需要全称量词（ALL）模式（该模式需要嵌套的存在性遍历）？ | adversarial |
| 3 | 目标 API 调用者是谁？内部服务、已认证的用户，还是两者兼有？这将决定最终的认证模型。 | security-lens |
| 4 | `PaginateRootFirst`（根节点优先分页） + `NOT EXISTS` 导致产出的页面结果少于请求的限制数量（Limit），这是否可以接受？ | adversarial |
| 5 | 关系注册表（Relation Registry）是否应该限制不同的调用者可以访问哪些表/关系？ | security-lens |

---

### 覆盖率 (Coverage)

| 角色 (Persona) | 状态 (Status) | 发现数 (Findings) | 自动修复 (Auto) | 批量修复 (Batch) | 当前存在 (Present) | 残留疑虑 (Residual) |
| --- | --- | --- | --- | --- | --- | --- |
| coherence | 已完成 | 5 | 0 | 0 | 5 | 2 |
| feasibility | 已完成 | 7 | 1 | 2 | 3 | 4 |
| scope-guardian | 已完成 | 4 | 1 | 0 | 2 | 3 |
| security-lens | 已完成 | 6 | 0 | 2 | 3 | 4 |
| adversarial | 已完成 | 12 | 0 | 1 | 9 | 5 |
| product-lens | 未激活 | -- | -- | -- | -- | -- |
| design-lens | 未激活 | -- | -- | -- | -- | -- |