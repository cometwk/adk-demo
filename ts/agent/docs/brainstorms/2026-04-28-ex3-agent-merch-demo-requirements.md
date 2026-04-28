---
date: 2026-04-28
topic: ex3-agent-merch-demo
---

# Ex3 代理商-商户体系 Demo

## Problem Frame

现有 v6 框架已实现 dbt 数据管道场景（ex2），验证了 Predictive（风险评估）和 Diagnostic（问题诊断）两种决策分析模式。需要将框架扩展到代理商-商户分润业务领域，同时增加查询统计能力。

**目标用户**：开发团队，用于验证框架在新业务领域的适用性

**核心挑战**：
1. 定义代理商-商户领域的实体、关系、规则和因果图
2. 设计进件流程的决策分析场景
3. 在框架内集成查询统计能力

## Requirements

**决策分析场景**

- R1. 实现 Predictive 场景："评估代理商 A001 进件商户的风险"，基于进件基础条件校验规则
- R2. 实现 Diagnostic 场景："商户 M001 的进件申请为什么失败"，基于商户信息问题 → 通道拒绝因果链条

**实体与关系建模**

- R3. 定义实体类：Agent（代理商）、Merch（商户）、Apply（进件申请）、AgentRel（代理关系）、Channel（通道）
- R4. 定义关系：Agent --applies--> Merch（进件）、Agent --binds--> Merch（代理绑定）、Merch --uses--> Channel（通道使用）
- R5. 支持代理商层级关系查询（通过 AgentClosure 或 parent_id）

**规则定义**

- R6. 定义进件基础条件校验规则（至少包含：代理商禁用检测、商户信息完整性检测）

**因果图定义**

- R7. 定义进件失败因果链条：商户信息缺失/错误 → 通道拒绝 → 进件失败

**查询统计能力**

- R8. 实现单实体查询（代理商详情、商户详情、进件申请状态）
- R9. 实现层级关系查询（代理商下级列表、层级穿透汇总）
- R10. 实现关系聚合查询（某商户绑定的代理商列表）
- R11. 实现时间范围统计查询（通过 SQL 伪函数）

## Success Criteria

- 运行 `main.ts` 成功执行 Predictive 和 Diagnostic 两轮，输出有意义的结论
- 查询统计示例函数能正确调用并返回预期结构（伪函数返回 mock 数据即可）
- 代码结构与 ex2 保持一致（entities.ts, ontology.ts, rules.ts, causal.ts, seed.ts, main.ts）

## Scope Boundaries

- 不涉及通道（chan）和机构商户（chan_merch）的完整建模（按 intro.md 约定忽略）
- 不涉及分润计算的实际逻辑（仅需支持分润数据查询）
- 不涉及费率校验的复杂规则（仅进件基础条件校验）
- SQL 伪函数实现由用户后续完成，demo 中仅需定义接口和 mock 返回

## Key Decisions

- **时间序列数据查询采用 SQL 伪函数**：避免在框架内实现复杂的时间序列存储，由用户后续实现真正的 SQL 执行器
- **聚焦进件流程**：决策场景聚焦于进件，而非分润计算或交易分析，降低初始复杂度
- **规则精简**：仅实现进件基础条件校验规则，费率合规规则暂不实现

## Dependencies / Assumptions

- v6 框架的 Graph、FactStore、EventStore、CausalGraph、Rule 系统可复用
- SQL 伪函数接口定义后，用户将提供实现

## Outstanding Questions

### Deferred to Planning

- [Affects R3][Technical] Channel 实体是否需要在 entities.ts 中定义，还是仅作为 Apply 的关联属性？
- [Affects R8][Technical] 查询统计函数是放在独立的 query.ts 文件，还是在 main.ts 中直接定义？

## Next Steps

→ `/ce:plan` for structured implementation planning