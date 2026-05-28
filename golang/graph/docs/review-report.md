# Semantic Graph Runtime 设计文档评审报告

**评审文档**：

- `docs/query-dsl.md` —— Query DSL 规范
- `docs/query-planner.md` —— Graph Traversal Planner + Traversal IR 详细设计
- `docs/query-compiler.md` —— Projection/Metric Planner + SQL Compiler 详细设计

**文档类型**：plan（实现方案设计）

**评审日期**：2026-05-28

**评审团队**：

- coherence-reviewer（始终启用）
- feasibility-reviewer（始终启用）
- scope-guardian-reviewer —— 3 份文档包含大量实现单元和 IR 定义
- security-lens-reviewer —— 涉及 API 端点、SQL 生成、无认证模型
- adversarial-document-reviewer —— 超过 5 个实现单元，重大架构决策，新抽象

---

## 评审结论

已自动修复 1 项，批量确认修复 10 项。剩余 10 项发现需要关注（2 P0，5 P1，3 P2）。

---

## 已自动修复

- 移除 `query-compiler.md` Section 8.3 SQL 示例中多余的 `LIMIT ? OFFSET ?`——外层查询不应重复分页，因为内层子查询已控制根表行数（feasibility、scope-guardian）

## 已批量确认修复


| #   | 文档                                   | 修复内容                                                                                                                                                               | 提出者                                    |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| 1   | query-compiler 6.1 / query-planner 4.1 | `RootPrimaryKey` 由 Planner 从 `TableSchemaRegistry`（`DBMetas()`）解析，固化在 `TraversalPlan` IR 中；`CompileQuery`/`CompileAggregate` 直接读取 `plan.RootPrimaryKey`，不再由 API 调用方传入 | feasibility、scope-guardian、adversarial |
| 2   | query-planner 6 / query-compiler 7.5 | 增加 `in`/`not_in` 操作符空数组校验（`ErrEmptyInValues`），`expandInOp` 对空数组生成 `1=0`，`expandNotInOp` 对空数组生成 `1=1`                                                               | adversarial                            |
| 3   | query-compiler 10                    | 将 `engine.SQL(sql, args...).Find(&rows)` 替换为 `engine.SQL(sql, args...).QueryInterface()`——Xorm 的 `Find()` 用于结构体切片，`QueryInterface()` 返回 `[]map[string]interface{}` | feasibility                            |
| 4   | query-compiler 12.1                  | 修正错误的安全声明：原声明称"表名/字段名来自 IR，非用户直接输入"，实际字段名来自用户 DSL 输入且 V1 未校验。更新为诚实描述 V1 安全边界依赖于 API 访问控制                                                                           | adversarial、security-lens              |
| 5   | query-compiler 10                    | Web 框架从 Gin 统一为 Echo，与现有代码库保持一致，更新所有 handler 示例                                                                                                                    | feasibility                            |
| 6   | query-compiler 7.9.2                 | 修正 Root Pagination First 子查询边界：内层子查询包含所有 non-fan-out JOIN、谓词和 existential scope，仅 fan-out JOIN 延迟到外层；新增 8.4 编译示例说明分页保证 | adversarial                            |
| 7   | query-dsl 1 / query-planner 9.3      | V1 强制 `match.type` 使用 snake_case，与数据库表名精确匹配；更新全部示例，修正 Phase 2 校验演练                                                                                              | feasibility                            |
| 8   | query-compiler 5.5                   | 细化聚合安全规则：允许 GROUP BY 父端 + COUNT fan-out 端；仅禁止 fan-out 父端 alias 上的 SUM/AVG                                                                                          | adversarial                            |
| 9   | query-dsl 7.5 / query-planner 5.3、12 | 文档化 V1 语义死角（Existential Leaf、全称量 ALL 不可直接表达）；明确双重否定绕过方案；为 V2 预留 Nested Existential Scope 接口（`ParentScopeIndex`、`Quantifier`）                              | adversarial                            |


---

## P0 —— 必须修复

实现前必须解决，否则会导致构建错误的东西。

### 缺失


| #   | 章节                              | 问题                                                                                                                                                                                    | 提出者                       | 置信度  |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---- |
| 2   | query-dsl 8 / query-compiler 10 | **API 端点无认证/授权**：3 个 POST 端点（/graph/plan、/graph/query、/graph/aggregate）可以执行任意图遍历查询，但未定义任何访问控制、角色或权限模型。谁能调用这些 API？                                                                     | security-lens             | 0.92 |
| 3   | query-compiler 12.1 / 12.3      | **字段名 SQL 注入风险**：`select.fields`、`where.field`、`order_by.field`、`group_by.field` 是用户 DSL 输入，直接插值到 SQL 字符串中。Planner 校验了 alias 唯一性和 relation 存在性，但明确未校验字段名。原安全声明"非用户直接输入"已被修正，但根本风险仍需解决 | security-lens、adversarial | 0.90 |


---

## P1 —— 应该修复

规划或实现中很可能会遇到的问题。

### 缺失


| #   | 章节                                  | 问题                                                                                                                                              | 提出者           | 置信度  |
| --- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---- |
| 6   | query-planner 8 / query-compiler 10 | **plan_token 安全性**：plan_token 是 SHA256(canonical_json)，确定性可预计算，通过 URL query 参数传递（会被日志记录），无过期、无使用授权检查。应使用密码学随机 UUID，设置 TTL，通过 body/header 传递     | security-lens | 0.85 |
| 9   | query-dsl 2-3 / query-compiler 7    | **无资源限制**：无 traverse 步数上限、无 IN 数组大小上限、无 LIMIT 最大值、无查询超时、无限流。构成数据库 DoS 攻击向量                                                                      | security-lens | 0.82 |
| 10  | query-compiler 10                   | **敏感金融数据无隔离**：示例引用 deposit_amt、trans_amt 等金融字段，但无数据分类、行级安全或租户隔离。任何调用方可读取数据库用户权限内的所有行                                                            | security-lens | 0.80 |
| 11  | query-dsl 2                         | **线性管道 DSL 无法表达分支遍历**：从同一节点沿两条不同关系遍历（如"商户及其代理商和其订单"）无法在单个 DSL 查询中表达。此限制未被明确说明                                                                   | adversarial   | 0.75 |
| 12  | query-compiler 11.2                 | **Raw SQL Compiler 决策仅评估了 Xorm Builder**：替代 SQL 构建库（squirrel、goqu）支持子查询和 EXISTS，未被评估。如果可用，可降低手工 SQL 拼接的维护负担和注入风险                                | adversarial   | 0.72 |


---

## P2 —— 考虑修复

适度修复有意义的改进。

### 缺失


| #   | 章节                              | 问题                                                                                                        | 提出者                     | 置信度  |
| --- | ------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------- | ---- |
| 13  | query-planner 8.2               | **V1 PlanCache 无淘汰策略**：sync.Map 无大小限制、无 TTL、无淘汰。长运行进程中，每个唯一的 match+traverse 组合永远驻留内存。应至少添加 LRU 淘汰或最大条目数限制 | feasibility、adversarial | 0.70 |
| 14  | query-compiler 7.5              | **LIKE 操作符无限制**：接受任意用户模式（含通配符），可用于逐字符枚举数据或构造全表扫描。应考虑限制通配符使用或要求前缀                                          | security-lens           | 0.72 |
| 15  | query-dsl 8 / query-compiler 10 | **两轮 API 调用模式增加延迟**：每次查询需要两次 HTTP 往返（/graph/plan + /graph/query），无单次调用便捷选项。应考虑添加单次调用端点或文档化延迟权衡            | adversarial             | 0.70 |


---

## 残余风险


| #   | 风险                                                                                              | 来源            |
| --- | ----------------------------------------------------------------------------------------------- | ------------- |
| 1   | Root Pagination First 对多列主键未做设计，composite PK 需要修改 SQL 模板和 `TraversalPlan.RootPrimaryKey` 类型                   | feasibility   |
| 2   | Plan ID 确定性依赖 `any` 类型 WherePredicate.Value 的 JSON 序列化——不同调用方可能对相同语义值产生不同序列化结果，导致缓存未命中          | adversarial   |
| 3   | 现有 `demo/pkg/query/` 包已有重叠的 operator 映射和聚合函数处理，未在设计文档中引用，可能导致实现分歧                               | feasibility   |
| 4   | V2 Redis 缓存引入新攻击面（Redis 认证、网络暴露、序列化漏洞），当前文档未涉及                                                  | security-lens |
| 5   | 即使添加 Table Schema Registry，系统仍通过字符串插值生成标识符。Registry 验证的任何缺口都可能重新引入 SQL 注入风险，应采用纵深防御（如引号包裹 + 转义） | security-lens |


---

## 待决问题


| #   | 问题                                                                             | 来源                      |
| --- | ------------------------------------------------------------------------------ | ----------------------- |
| 1   | ~~DSL `match.type` 应使用 snake_case 还是 PascalCase？~~ → **已决**：V1 强制 snake_case | feasibility、adversarial |
| 2   | 实际业务中有多少比例的查询需要全称量（ALL）模式？V1 已文档化双重否定绕过，但 V2 优先级仍取决于业务占比                                    | adversarial             |
| 3   | API 的预期调用方是谁？内部服务、认证用户、还是两者兼有？这决定认证模型                                          | security-lens           |
| 4   | ~~PaginateRootFirst + NOT EXISTS 分页保证~~ → **已决**：内层子查询包含 existential scope | adversarial             |
| 5   | Relation Registry 是否需要对不同调用方限制可用表/关系？                                          | security-lens           |
| 6   | ~~rootPrimaryKey 来源~~ → **已决**：Planner 从 TableSchemaRegistry 解析，固化在 TraversalPlan IR | adversarial             |
| 7   | 系统预期部署边界？面向互联网则无认证是致命的；服务间调用则风险不同                                              | security-lens           |


---

## 评审覆盖度


| 角色             | 状态  | 发现数 | 自动修复 | 批量确认 | 待处理 | 残余  |
| -------------- | --- | --- | ---- | ---- | --- | --- |
| coherence      | 已完成 | 5   | 0    | 0    | 5   | 2   |
| feasibility    | 已完成 | 7   | 1    | 3    | 2   | 4   |
| scope-guardian | 已完成 | 4   | 1    | 0    | 2   | 3   |
| security-lens  | 已完成 | 6   | 0    | 2    | 3   | 4   |
| adversarial    | 已完成 | 12  | 0    | 5    | 4   | 5   |
| product-lens   | 未启用 | --  | --   | --   | --  | --  |
| design-lens    | 未启用 | --  | --   | --   | --  | --  |

