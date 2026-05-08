---
title: refactor: V6 Rules 系统简化
type: refactor
status: completed
date: 2026-05-08
origin: docs/brainstorms/2026-05-08-v6-rules-simplification-requirements.md
---

# refactor: V6 Rules 系统简化

## Overview

删除 V6 规则系统的过度工程化特性（DAG 排序、subsumedBy、dependsOn、severity 加权、inference_rule），保留 FactStore + Direction 映射 + Veto + 确定性 Critic 核心骨架。代码量预计减少约 120 行。

## Problem Frame

V6 规则系统为 4 条 Demo 规则搭建了支持 50+ 条规则的基础设施。TODO 文档建议保留三步走骨架（FactStore + 确定性 Critic + Reconciler），其余功能等规则规模超过 50 条后再引入。（见 origin 文档）

## Requirements Trace

- R1. Rule.kind 简化为 2 种：`hard_constraint` + `soft_criterion`
- R2. 删除 `inference_rule`、`conflict_policy`、`explanation_policy`
- R3. 删除 `dependsOn` 字段
- R4. 删除 `subsumedBy` 字段
- R5. 删除 Severity 加权，只用 weight
- R6. Direction 映射改为全局配置（scoring.ts 常量）
- R7. 评分公式：`rawScore = Σ(weight × directionContrib)`
- R8. 保留 Veto 机制
- R9-R12. 保留 FactStore、missingFacts、ScoredCandidate 结构、Reconciler
- R13. 直接修改 src/v6/
- R14. 删除 DAG 排序，改为线性扫描

## Scope Boundaries

- 不修改 FactStore（eventStore.ts）
- 不修改 Executor 工具（tools/rules.ts 的 inspect_rules/evaluate_rule 保留）
- 不修改 Prompt
- 不修改 Reconciler
- 不修改 Critic 路由（critic.ts）

## Context & Research

### Relevant Code and Patterns

- `src/v6/ontology/rules.ts` — Rule 类型定义和注册表
- `src/v6/ontology/ruleDag.ts` — DAG 评估（sortRules、evaluateRuleDag）
- `src/v6/ontology/scoring.ts` — MCDA 评分（scoreCandidates、severityWeights）
- `src/v6/agent/criticPredictive.ts` — Critic 入口，调用 evaluateRuleDag + scoreCandidates
- `src/v6/demo/ex4/rules.ts` — Demo 规则定义（4 条）

### Call Chain

```
critic.ts → criticPredictive.ts
  → evaluateRuleDag (ruleDag.ts) → getRules + sortRules
  → scoreCandidates (scoring.ts) → Direction 映射 + severity 加权

tools/rules.ts → evaluateSingleRule (ruleDag.ts)
```

## Key Technical Decisions

- **Direction 映射硬编码**：在 scoring.ts 中定义 `DEFAULT_DIRECTION_MAPPING` 常量，不从 ontology 动态读取（R6）
- **directionContrib 数值保持不变**：risk_up: HIGH +1, LOW -0.5；risk_down: LOW +1, HIGH -0.5（R7）
- **保留 ruleDag.ts 但简化**：删除 sortRules 和 DAG 逻辑，保留 evaluateRuleDag（线性扫描）和 evaluateSingleRule（R14）
- **EvaluatedRule.isSubsumed 改为 false 常量**：删除蕴含检测后，所有规则 isSubsumed = false

## Open Questions

### Resolved During Planning

- 全局 Direction 映射配置：scoring.ts 硬编码常量（简单，候选类型固定）
- directionContrib 数值范围：保持当前值（已解决 V5 bug）
- ruleDag.ts 是否保留：保留但简化为线性扫描（evaluateSingleRule 被 tools 使用）

### Deferred to Implementation

- 无

## Implementation Units

- [x] **Unit 1: 简化 Rule 类型定义**

**Goal:** 删除过度工程化字段，RuleKind 简化为 2 种

**Requirements:** R1, R2, R3, R4

**Dependencies:** None

**Files:**
- Modify: `src/v6/ontology/rules.ts`

**Approach:**
1. RuleKind 枚举删除 inference_rule、conflict_policy、explanation_policy，保留 hard_constraint、soft_criterion
2. Rule 类型删除 dependsOn、subsumedBy、severityFn 字段
3. RuleResult 类型删除 severity、derivedFacts 字段
4. queryRules 函数删除 kind 参数对删除类型的支持

**Patterns to follow:**
- 保持现有类型导出方式

**Test scenarios:**
- Happy path: registerRule 简化后的 Rule 类型正常工作
- Happy path: getRules 返回已注册规则
- Edge case: queryRules 按 kind 过滤只接受 hard_constraint/soft_criterion

**Verification:**
- TypeScript 编译无错误
- Demo 规则注册成功

---

- [x] **Unit 2: 简化 ruleDag.ts**

**Goal:** 删除 DAG 排序逻辑，改为线性扫描

**Requirements:** R14

**Dependencies:** Unit 1

**Files:**
- Modify: `src/v6/ontology/ruleDag.ts`

**Approach:**
1. 删除 KIND_ORDER 常量
2. 删除 sortRules 函数
3. evaluateRuleDag 改为直接循环 getRules()，不做排序
4. 删除 isSubsumed 检查逻辑（所有 EvaluatedRule.isSubsumed = false）
5. 删除 derivedFacts 处理逻辑（facts.withDerived 调用）
6. 保留 Veto 收集逻辑

**Patterns to follow:**
- 保留 evaluateRuleDag 函数签名不变

**Test scenarios:**
- Happy path: evaluateRuleDag 返回 results + vetoedLabels
- Happy path: hard_constraint 触发时 vetoedLabels 包含正确候选
- Integration: criticPredictive.ts 调用 evaluateRuleDag 正常工作

**Verification:**
- TypeScript 编译无错误
- Demo 场景 Critic 运行正常

---

- [x] **Unit 3: 简化 scoring.ts**

**Goal:** 删除 severity 加权，Direction 映射改为全局常量

**Requirements:** R5, R6, R7

**Dependencies:** Unit 2

**Files:**
- Modify: `src/v6/ontology/scoring.ts`

**Approach:**
1. ScoringProfile 删除 severityWeights 字段
2. 删除 DEFAULT_RISK_SCORING_PROFILE.severityWeights
3. 新增 DEFAULT_DIRECTION_MAPPING 常量（全局配置）
4. scoreCandidates 删除 isSubsumed 检查
5. scoreCandidates 删除 severityMult 计算，改为：`rawScore += weight * dirContrib`
6. 保留 weight 计算（getEffectiveWeight）
7. 保留 normalizedScore 计算
8. 保留 confidence 计算（missingRatio）

**Patterns to follow:**
- Direction 映射格式保持 `{ HIGH: { risk_up: +1, risk_down: -0.5 }, LOW: { risk_up: -0.5, risk_down: +1 }, ... }`

**Test scenarios:**
- Happy path: scoreCandidates 返回排序后的 ScoredCandidate[]
- Happy path: vetoed 候选 rawScore = -Infinity
- Edge case: 所有规则未触发时 confidence = 1.0
- Edge case: 有 missingFacts 时 confidence 降低

**Verification:**
- TypeScript 编译无错误
- Demo 场景评分结果与简化前一致

---

- [x] **Unit 4: 更新 Demo 规则定义**

**Goal:** Demo 规则适配简化后的类型

**Requirements:** R1, R8

**Dependencies:** Unit 3

**Files:**
- Modify: `src/v6/demo/ex4/rules.ts`

**Approach:**
1. 所有规则的 kind 保持不变（已是 hard_constraint 或 soft_criterion）
2. 删除 rules.ts 中不需要的字段（如有 severity 相关代码）
3. 确保 veto 配置正确（hard_constraint 的 candidatesByLabel）
4. 确保 weight 存在（soft_criterion）

**Patterns to follow:**
- 现有 Demo 规则结构

**Test scenarios:**
- Happy path: registerLibraryRules 正常注册 4 条规则
- Integration: setupLibraryScenario 正常初始化

**Verification:**
- Demo 运行成功
- 评分结果与简化前一致

---

- [x] **Unit 5: 更新 tools/rules.ts 输出**

**Goal:** inspect_rules 输出删除废弃字段

**Requirements:** R3, R4

**Dependencies:** Unit 1

**Files:**
- Modify: `src/v6/agent/tools/rules.ts`

**Approach:**
1. inspect_rules 返回删除 dependsOn、subsumedBy、hasVeto 字段
2. evaluate_rule 返回删除 isSubsumed 字段

**Patterns to follow:**
- 保持 tool 函数签名不变

**Test scenarios:**
- Happy path: inspect_rules 返回规则元数据
- Happy path: evaluate_rule 返回 triggered + explanation

**Verification:**
- TypeScript 编译无错误

---

- [ ] **Unit 6: 运行 Demo 验证**

**Goal:** 验证简化后系统正常运行

**Requirements:** Success Criteria

**Dependencies:** Unit 1-5

**Files:**
- Run: `src/v6/demo/ex4/main.ts`（如果存在）

**Approach:**
1. 运行 Demo 场景
2. 检查评分结果：ALLOWED 候选应被 veto（hard_constraint 触发）
3. 检查 SystemVerdict 结构完整

**Test scenarios:**
- Integration: runDecisionAssistant 正常返回 DecisionResponse
- Integration: reconciliation 正常比较 systemVerdict vs modelVerdict

**Verification:**
- Demo 运行无错误
- 评分结果符合预期（ALLOWED 被 veto）

## System-Wide Impact

- **Interaction graph:** criticPredictive.ts 调用 evaluateRuleDag 和 scoreCandidates，签名不变，内部逻辑简化
- **Error propagation:** 无变化，保持现有错误处理
- **State lifecycle risks:** 无变化，FactStore 仍为请求级快照
- **API surface parity:** tools/rules.ts 的 inspect_rules/evaluate_rule 输出字段减少，但向后兼容（字段被删除而非改名）
- **Integration coverage:** Demo 场景覆盖完整 Critic 流程
- **Unchanged invariants:** Reconciler、Prompt、Executor tools 保持不变

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Demo 规则依赖删除的字段 | 逐个检查 demo/ex4/rules.ts，确保无 severity/dependsOn/subsumedBy 引用 |
| evaluateSingleRule 返回结构变化 | 检查 tools/rules.ts 调用点，确保无 isSubsumed 引用 |
| 评分结果与简化前不一致 | 运行 Demo 前后对比，验证 veto 和 direction 映射逻辑正确 |

## Sources & References

- **Origin document:** [docs/brainstorms/2026-05-08-v6-rules-simplification-requirements.md](../brainstorms/2026-05-08-v6-rules-simplification-requirements.md)
- Design rationale: `docs/design/detail/v6-0-3-rules-TODO.md`
- Current implementation: `src/v6/ontology/rules.ts`, `src/v6/ontology/ruleDag.ts`, `src/v6/ontology/scoring.ts`