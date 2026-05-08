---
date: 2026-05-08
topic: v6-rules-simplification
---

# V6 Rules 系统简化

## Problem Frame

V6 规则系统（rules.ts + ruleDag.ts + scoring.ts）为 4 条 Demo 规则搭建了支持 50+ 条规则的基础设施：
- DAG 拓扑排序（5 种 kind + dependsOn 递归）
- subsumedBy 蕴含合并
- Severity 三级加权
- inference_rule derived facts 机制
- 候选级 Direction 映射配置

这些复杂度在当前规模下属于"过度工程化"。TODO 文档建议保留 **FactStore + 确定性 Critic + Reconciler** 三步走骨架，其余功能等规则规模超过 50 条后再引入。

## Requirements

**简化 Rule 类型**
- R1. Rule.kind 简化为 2 种：`hard_constraint`（可 veto）和 `soft_criterion`（加权打分）
- R2. 删除 `inference_rule`、`conflict_policy`、`explanation_policy` 三种 kind
- R3. 删除 `dependsOn` 字段——规则之间无依赖关系
- R4. 删除 `subsumedBy` 字段——不做蕴含合并检测

**简化评分逻辑**
- R5. 删除 Severity 加权（low/medium/high），只用 weight
- R6. 保留 Direction 映射，但改为全局配置而非候选级配置
- R7. 评分公式简化为：`rawScore = Σ(weight × directionContrib)`
- R8. 保留 Veto 机制——hard_constraint 触发时否决特定候选

**保留核心能力**
- R9. 保留 FactStore 结构化绑定（entityId + property）
- R10. 保留 missingFacts 检测，confidence = 1 - missingRatio
- R11. 保留 ScoredCandidate 输出结构（candidateId, rawScore, normalizedScore, confidence, triggeredRuleIds）
- R12. 保留 Reconciler 冲突显式化逻辑

**代码修改策略**
- R13. 直接修改 src/v6/ 目录，不创建简化版副本
- R14. 删除 evaluateRuleDag 中的拓扑排序逻辑，改为线性扫描规则列表

## Success Criteria

- Demo 场景（4 条规则）评分结果与简化前一致
- 删除的代码不影响现有 Demo 运行
- 代码量减少约 30%（ruleDag.ts + scoring.ts）
- 评分逻辑可解释：每个候选的分数 = Σ(触发规则的 weight × direction 映射值)

## Scope Boundaries

- 不修改 FactStore（eventStore.ts）——它已经是正确的
- 不修改 Executor 工具（tools/rules.ts）——inspect_rules 和 evaluate_rule 保留
- 不修改 Prompt——规则摘要格式保持不变
- 不修改 Reconciler——冲突检测逻辑保持不变
- 不修改 Critic 路由——只是 criticPredictive.ts 内部评分逻辑简化

## Key Decisions

- **保留 Direction 映射**：虽然属于 MCDA 复杂性，但它解决了 V5 的 LOW=0.67 bug，是核心价值
- **保留 Veto 机制**：hard_constraint 的否决功能与评分逻辑独立，不应合并到评分中
- **删除 inference_rule**：derived facts 由 Executor 直接 bind_fact，不需要规则系统产生
- **直接修改 v6**：不保留完整版副本，当前规模不需要双模式支持

## Dependencies / Assumptions

- 当前 Demo 规则数量 ≤ 10 条，不存在 dependsOn/subsumedBy 关系
- Executor 负责收集所有 facts，不需要 inference_rule 产生 derived facts
- 评分公式不涉及复杂的 MCDA 理论（leximin、weighted_min 等）

## Outstanding Questions

### Resolve Before Planning
- 无（所有关键决策已确认）

### Deferred to Planning
- [Affects R6][Technical] 全局 Direction 映射具体配置方式：是在 scoring.ts 中硬编码常量，还是从 ontology 读取？
- [Affects R7][Technical] directionContrib 的数值范围：当前是 +1/-0.5，是否需要可配置？
- [Affects R14][Technical] 删除 DAG 排序后，ruleDag.ts 是否还需要保留？还是直接在 criticPredictive.ts 中循环调用 rule.evaluator？

## Next Steps

→ `/ce:plan` for structured implementation planning