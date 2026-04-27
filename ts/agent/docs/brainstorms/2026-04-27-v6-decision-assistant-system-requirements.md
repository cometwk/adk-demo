---
date: 2026-04-27
topic: v6-decision-assistant-system
---

# V6：可工程化决策辅助系统（含 V6.5 双模式）

## Problem Frame

V5 实现了辅助决策 Agent 的核心闭环：`C` 一等化、渐进式实体披露、决策态显式化、多答案输出。但 V5 demo 暴露了三个结构性问题：

1. **评分与业务直觉脱节**：`evaluate_candidates` 用"触发数/总数"打分，没有 weight、severity、veto，LLM 看到不合理得分后静默绕过系统——回到 V3 状态。

2. **事实是扁平 KV**：`workload_alice` 这种命名让规则系统无法知道"该规则要找哪个实体的 workload"，导致 missingFacts 误报。

3. **模型盲调方法**：`call_method(project_api, evaluateRisk, {teamLoad: 0, seniorCount: 0})` 参数 schema 合法但语义荒谬，下游结论被污染。

V6 要解决的真实挑战：本体规模与质量、评分校准、事实绑定、意图与实体接入、权限与隐私、长链路可信度、可重放与反馈。

同时，真实决策场景有对偶两类问题：
- **前向**：从当前事实推未来结果（风险评估、优先级排序）
- **后向**：从已发生结果反推原因（事故归因、延期复盘）

V6.5 作为双模式扩展，在同一架构下补齐时间、因果、归因三个维度。

## Requirements

**FactStore 与结构化绑定**
- R1. 每条 fact 必须标注 `(entityId, property, value, source, confidence, validFrom, validUntil, observedAt)`，不能再是扁平 KV。
- R2. 规则评估时按 binding 自动取值，按 `appliesTo` + `requiredFacts` 从 FactStore 拉对应实体的 property。
- R3. 任何 fact 可追溯到 source（graph_property | method_result | aggregation | user_input | derived），避免模型编数字。
- R4. `validUntil` 让陈旧 fact 自动降权或触发重新拉取。

**Rule DAG 与 MCDA 评分**
- R5. Rule 升级为有版本、weight、direction、severityFn、veto、dependsOn、subsumedBy 的结构。
- R6. 规则按 DAG 拓扑评估：先 inference_rule（产生 derived facts），再 hard_constraint（可能 veto），最后 soft_criterion（加权）。
- R7. 评分基于 MCDA，用 `directionMapping` 描述每条规则推哪个候选，不用 label 字符串硬编码。
- R8. hard_constraint 命中 veto 时候选直接出局，不再"扣点分"。
- R9. confidence 基于 missingFactImpact 计算，不是 LLM 编数字。
- R10. 支持 calibration：用户反馈可更新 weightOverrides 并附带版本号。

**双轨判决与冲突暴露**
- R11. 输出必须并列 systemVerdict（确定性规则系统）和 modelVerdict（LLM 综合判断）。
- R12. 一致时高置信结论；不一致时显式呈现冲突，由用户决策。
- R13. 不让 LLM 静默覆盖系统结论；冲突就是冲突，必须 surface。
- R14. reconciler 必须推断 likelyCause：missing_facts | rule_weight_misalignment | model_overrides_system | system_too_coarse。

**前端 Pipeline**
- R15. 用户自然语言提问必须经过 intent classification + entity linking + clarification。
- R16. 澄清问题是结构化选择题，不是 free-form chat。
- R17. 调用方不再写死 entryEntities；DecisionTask 由前端 pipeline 生成。

**Planner / Executor / Critic 三段式**
- R18. Planner 只读 ontology + intent + entryEntities，输出 ExplorationPlan，不能调用工具。
- R19. Executor 接受 plan 作为初始 budget，职责严格限定：探索图、绑定事实、提议候选、给出综合理由。
- R20. Executor prompt 明确："最终评分由系统完成，你的职责是把 fact binding 集齐。"
- R21. Critic 必须是 deterministic 的（rule DAG + MCDA），不调用 LLM，作为对照组约束 LLM 自由发挥。
- R22. 移除 evaluate_candidates 工具；拆成 evaluate_rule（细粒度）+ critic 内部 scoreCandidates。

**PolicyContext**
- R23. 图访问必须 policy 感知：principal、scope、redaction、audit。
- R24. inspect_node 对 sensitiveProperties 做 mask；query_neighbors 按 scope 过滤邻居。
- R25. 被 redacted 的属性不能写入 evidence。

**决策可重放与反事实**
- R26. 每次决策保存 trace：本体版本、入口、工具调用、fact binding、verdict、用户反馈。
- R27. 支持反事实重跑：用 overrides 替换 FactStore binding，重跑 ruleDag + scoreCandidates（纯 deterministic）。
- R28. 输出包含 counterfactualOffers（1-3 个高敏感度 fact 的 what-if 入口）。

**V6.5 双模式：时间维度**
- R29. FactBinding 必须有 validFrom/validUntil/observedAt 时间字段。
- R30. EventStore 存储事件流；FactStore = EventStore.factsAt(now) 的投影。
- R31. inspect_node 支持 `at?: string` 参数做时间旅行查询。
- R32. 新增 query_events / record_event 工具。

**V6.5 双模式：因果维度**
- R33. CausalGraph 必须与 Ontology.relations 分开：R 描述结构关系，CausalGraph 描述机制性因果。
- R34. CausalEdge 有 cause、effect、mechanism、typicalLag、strength、relatedRuleIds。
- R35. 新增 walk_causal_graph 工具，支持 backward/forward 方向遍历。

**V6.5 双模式：归因维度**
- R36. diagnostic 模式下候选是 CandidateCause（可共存的原因集合），不是互斥枚举。
- R37. 归因评分基于 but-for 测试（必要性 + 充分性），不是 MCDA 加权。
- R38. attribution 不强制 sum=1；多因并存时允许多个 attribution 都高。
- R39. 当 top-2 attribution 都 > 0.4，必须标注 overdetermined=true 并在 UI 警告。
- R40. but-for 模式 simulate 由 critic 内部调用，不开放给 LLM executor。

**Intent 矩阵与双模式路由**
- R41. DecisionIntent 必须区分 predictive（risk_assessment, prioritization...）和 diagnostic（rca, post_mortem, anomaly_explanation...）。
- R42. frontend/intent.ts 先做 mode 一级分类，再路由到不同 planner/prompt/critic。
- R43. 同一架构、同一份 EventStore、同一套双轨判决机制。

## Success Criteria

- 用 V5 demo 数据跑 V6 critic，HIGH > MEDIUM > LOW（不再是 LOW=0.67 的荒谬结果）。
- 规则 `engineer_burnout_threshold` 在 alice 和 bob 上各自独立评估，不再 missingFacts 误报。
- `call_method` 拒绝 `{teamLoad: 0}` 这种"语法对、语义错"的盲调。
- system 与 model 不一致时 UI 必须显式标注冲突，提供反馈入口。
- 用户问"project_portal 上周延期了为什么"时，系统进入 diagnostic 模式并输出归因排序。
- but-for 测试：抹除 api_dependency_slip 事件后，milestone_missed 概率下降。

## Scope Boundaries

- 不做完整多 Agent 协作；V6 内部是 planner/executor/critic 三角色但只有 executor 是 LLM 驱动。
- 不做 do-calculus / Pearl 三层因果；仅做局部事件擦除 + 因果链重放的简化反事实。
- 不做规则 DSL；规则仍是 TypeScript 函数。
- 不做向量检索的实体链接；走 ID 模糊匹配 + 别名表 + 上下文。
- 不做实时图/实时事件流；FactStore/EventStore 是请求级快照。
- 不替用户做最终决策；即使 system+model 都判 HIGH，UI 仍只是"建议"并有反馈入口。

## Key Decisions

- **critic 必须 deterministic**：不调用 LLM，可重放、可缓存、可单测。
- **FactStore 是最关键迁移**：V5 → V6 第一步先替换 facts dict。
- **评分不暴露给 LLM**：executor prompt 明确"你不需要知道中间分"。
- **planner 不能调用工具**：输出必须是 plan，不是 plan + 半步执行。
- **冲突强制 surface**：不一致时 UI 必须显式标注，这是"可校准"的根。
- **attribution 不强制归一**：允许多因并存，不人为制造"主原因"。
- **CausalGraph 与 R 分开**：结构关系和因果关系维度不同，不混。

## Dependencies / Assumptions

- V4/V5 的 AI SDK tool-calling loop 已作为基础成立。
- 项目按版本目录演进：`src/v6` 独立存在，保留 v5 对照。
- demo 仍围绕项目交付风险评估场景。
- V6.5 因果模型由人工建模，不从历史数据自动学习。

## Outstanding Questions

### Deferred to Planning

- [Affects R5-R10][Technical] MCDA ScoringProfile 的默认值和 UI 调参方式？
- [Affects R18][Technical] Planner 用小 LLM 调用还是启发式规则？
- [Affects R33-R35][Technical] CausalGraph 的 seed 数据规模和结构？
- [Affects R37][Technical] but-for 测试的计算成本上限和缓存策略？

## Next Steps

→ `/ce:plan docs/brainstorms/2026-04-27-v6-decision-assistant-system-requirements.md`