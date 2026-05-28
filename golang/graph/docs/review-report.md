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

已自动修复 1 项，批量确认修复 6 项。剩余 14 项发现需要关注（3 P0，7 P1，3 P2）。

---

## 已自动修复

- 移除 `query-compiler.md` Section 8.3 SQL 示例中多余的 `LIMIT ? OFFSET ?`——外层查询不应重复分页，因为内层子查询已控制根表行数（feasibility、scope-guardian）

## 已批量确认修复


| #   | 文档                                   | 修复内容                                                                                                                                                               | 提出者                                    |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| 1   | query-compiler 6.1                   | 为 `CompileQuery` 和 `CompileAggregate` 函数签名增加 `rootPrimaryKey string` 参数，并在 API handler 中透传                                                                         | feasibility、scope-guardian、adversarial |
| 2   | query-planner 6 / query-compiler 7.5 | 增加 `in`/`not_in` 操作符空数组校验（`ErrEmptyInValues`），`expandInOp` 对空数组生成 `1=0`，`expandNotInOp` 对空数组生成 `1=1`                                                               | adversarial                            |
| 3   | query-compiler 10                    | 将 `engine.SQL(sql, args...).Find(&rows)` 替换为 `engine.SQL(sql, args...).QueryInterface()`——Xorm 的 `Find()` 用于结构体切片，`QueryInterface()` 返回 `[]map[string]interface{}` | feasibility                            |
| 4   | query-compiler 12.1                  | 修正错误的安全声明：原声明称"表名/字段名来自 IR，非用户直接输入"，实际字段名来自用户 DSL 输入且 V1 未校验。更新为诚实描述 V1 安全边界依赖于 API 访问控制                                                                           | adversarial、security-lens              |
| 5   | query-compiler 10                    | Web 框架从 Gin 统一为 Echo，与现有代码库保持一致，更新所有 handler 示例                                                                                                                    | feasibility                            |
| 6   | query-compiler 7.9.2                 | 修正 Root Pagination First 子查询边界：内层子查询包含所有 non-fan-out JOIN、谓词和 existential scope，仅 fan-out JOIN 延迟到外层；新增 8.4 编译示例说明分页保证 | adversarial                            |


---

## P0 —— 必须修复

实现前必须解决，否则会导致构建错误的东西。

### 缺失


| #   | 章节                              | 问题                                                                                                                                                                                    | 提出者                       | 置信度  |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---- |
| 2   | query-dsl 8 / query-compiler 10 | **API 端点无认证/授权**：3 个 POST 端点（/graph/plan、/graph/query、/graph/aggregate）可以执行任意图遍历查询，但未定义任何访问控制、角色或权限模型。谁能调用这些 API？                                                                     | security-lens             | 0.92 |
| 3   | query-compiler 12.1 / 12.3      | **字段名 SQL 注入风险**：`select.fields`、`where.field`、`order_by.field`、`group_by.field` 是用户 DSL 输入，直接插值到 SQL 字符串中。Planner 校验了 alias 唯一性和 relation 存在性，但明确未校验字段名。原安全声明"非用户直接输入"已被修正，但根本风险仍需解决 | security-lens、adversarial | 0.90 |
| 4   | query-dsl 1 / query-planner 9.3 | **表名大小写不匹配**：DSL 示例使用 PascalCase（`"AgentRel"`），但 RelationSchema 使用 snake_case（`"agent_rel"`）。Phase 2 校验直接字符串比较这两个值。第 9.3 节演练中错误地将 `"AgentRel" == "agent_rel"` 标记为通过。需要统一命名规范或增加映射层    | feasibility               | 0.90 |


---

## P1 —— 应该修复

规划或实现中很可能会遇到的问题。

### 错误


| #   | 章节                 | 问题                                                                                                                                                                     | 提出者         | 置信度  |
| --- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---- |
| 5   | query-compiler 5.5 | **聚合安全规则过度限制**：V1 禁止所有非 fan-out 端 alias 上的聚合，但 `GROUP BY rel.agent_no, COUNT(od.id)` 是语义正确的（按根分组计数 fan-out 行）。应细化规则：允许 GROUP BY 在父端 + COUNT 在 fan-out 端，仅禁止父端的 SUM/AVG | adversarial | 0.78 |


### 缺失


| #   | 章节                                  | 问题                                                                                                                                              | 提出者           | 置信度  |
| --- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---- |
| 6   | query-planner 8 / query-compiler 10 | **plan_token 安全性**：plan_token 是 SHA256(canonical_json)，确定性可预计算，通过 URL query 参数传递（会被日志记录），无过期、无使用授权检查。应使用密码学随机 UUID，设置 TTL，通过 body/header 传递     | security-lens | 0.85 |
| 7   | query-compiler 7.9.2                | **rootPrimaryKey 确定方式未决**：文档列出 3 种方案但未选择。这是 PaginateRootFirst 的承重细节——选错字段会导致分页结果错误或重复。函数签名已添加参数，但具体从哪里获取仍未指定                                    | adversarial   | 0.85 |
| 8   | query-planner 5.2 / query-dsl 2     | **V1 existential-leaf 限制导致全称量查询不可表达**：V1 禁止从 existential alias 继续遍历，使得"全称量"模式（如"所有订单都满足条件 X 的商户"）无法表达。未提供证据说明 V1 实际需要支持哪些查询模式。应文档化 V1 下哪些模式不可表达 | adversarial   | 0.82 |
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
| 1   | Root Pagination First 对多列主键未做设计，composite PK 需要修改 SQL 模板和 rootPrimaryKey 参数类型                   | feasibility   |
| 2   | Plan ID 确定性依赖 `any` 类型 WherePredicate.Value 的 JSON 序列化——不同调用方可能对相同语义值产生不同序列化结果，导致缓存未命中          | adversarial   |
| 3   | 现有 `demo/pkg/query/` 包已有重叠的 operator 映射和聚合函数处理，未在设计文档中引用，可能导致实现分歧                               | feasibility   |
| 4   | V2 Redis 缓存引入新攻击面（Redis 认证、网络暴露、序列化漏洞），当前文档未涉及                                                  | security-lens |
| 5   | 即使添加 Table Schema Registry，系统仍通过字符串插值生成标识符。Registry 验证的任何缺口都可能重新引入 SQL 注入风险，应采用纵深防御（如引号包裹 + 转义） | security-lens |


---

## 待决问题


| #   | 问题                                                                             | 来源                      |
| --- | ------------------------------------------------------------------------------ | ----------------------- |
| 1   | DSL `match.type` 应使用 snake_case（匹配 SQL）还是 PascalCase（配合映射层）？                   | feasibility、adversarial |
| 2   | 实际业务中有多少比例的查询需要全称量（ALL）模式？这决定了 V1/V2 边界是否正确                                    | adversarial             |
| 3   | API 的预期调用方是谁？内部服务、认证用户、还是两者兼有？这决定认证模型                                          | security-lens           |
| 4   | PaginateRootFirst 内层子查询已包含 existential scope，分页保证严格准确 | adversarial             |
| 5   | Relation Registry 是否需要对不同调用方限制可用表/关系？                                          | security-lens           |
| 6   | rootPrimaryKey 应如何确定？添加到 TraversalPlan IR 中？从 TableSchema Registry 查找？还是调用方配置？ | adversarial             |
| 7   | 系统预期部署边界？面向互联网则无认证是致命的；服务间调用则风险不同                                              | security-lens           |


---

## 评审覆盖度


| 角色             | 状态  | 发现数 | 自动修复 | 批量确认 | 待处理 | 残余  |
| -------------- | --- | --- | ---- | ---- | --- | --- |
| coherence      | 已完成 | 5   | 0    | 0    | 5   | 2   |
| feasibility    | 已完成 | 7   | 1    | 2    | 3   | 4   |
| scope-guardian | 已完成 | 4   | 1    | 0    | 2   | 3   |
| security-lens  | 已完成 | 6   | 0    | 2    | 3   | 4   |
| adversarial    | 已完成 | 12  | 0    | 2    | 8   | 5   |
| product-lens   | 未启用 | --  | --   | --   | --  | --  |
| design-lens    | 未启用 | --  | --   | --   | --  | --  |


