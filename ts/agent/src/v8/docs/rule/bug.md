
### 已经修正的部分

以下修正建议在逻辑上是一致且正确的，但由于涉及一定的代码语义扩展或设计约定，我将其打包提供给您一键决定。请通过下方的交互式表单选择是否应用它们：

| 编号 | 章节 | 建议的修正内容 | 评审专家 |
| :--- | :--- | :--- | :--- |
| **1** | 13. Provider 模式 | 延迟或拆除过度设计的本地 `rule/provider` 目录树。第一阶段直接并入 `rule/runtime` 和 `rule/registry`，如果需要导出 provider，采用 V8 既有的全局 `src/v8/provider`，避免在 rule 下重复造轮子。 | `scope-guardian` |
| **2** | 4.5 Veto 机制配置 | 将硬约束 Veto 配置从 label 过滤扩展为 `candidateId` 精准过滤，规避多个候选实体拥有相同 label 时的 collateral 误杀，或在推理周期内的 label 命名漂移问题。 | `adversarial` |
| **3** | 11. Agent Tools | 补全 `PolicyContext` 权限约束。参考 bind_fact 模式，在 `evaluate_rule` 工具和 `inspect_rules` 过滤中，调用 `PolicyContext` 的 `isEntityAllowed` 与 `isTypeAllowed` 做数据隔离校验。 | `feasibility` |
| **4** | 5. Rule Evaluator | 消除“伪独立组件”。将 RuleEvaluator 从 1 节的架构总览图中移至 RuleRegistry 内部，并明确其在第 5 节中并非一个独立的类或子系统，而是 Rule 接口上的一个 `rule.evaluator` 回调函数。 | `coherence`, `scope-guardian` |

---

# 待之后再说

### P0 -- 必须修改 (Must Fix)

#### 错误 (Errors)

##### 1. `currentVerdict` 在工具创建闭包中未被赋值，导致规则工具无法使用 (coherence, feasibility, adversarial)
- **章节**: `11.6 工具创建入口` / `11.4 inspect_verdict` / `11.5 reconcile_verdict`
- **为什么它很重要**: `inspect_verdict` 和 `reconcile_verdict` 的实现高度依赖 `currentVerdict`。然而，第 11.6 节的 `createRuleTools` 直接将其初始化为 `let currentVerdict: SystemVerdict | null = null`，且在整个工具内部没有任何赋值、更新或触发 `generateVerdict()` 的链路。因此，在运行时调用这两个工具将 100% 触发 `PRECONDITION_FAILED`。这使得设计文档所宣称的 Agent 与双轨机制工具流完全失效。
- **可信度**: 0.95
- **事实证据**:
  ```text
  Section 11.6: let currentVerdict: SystemVerdict | null = null with no subsequent assignment.
  Section 11.4 returns PRECONDITION_FAILED when !currentVerdict.
  Section 12.3 runAgentWithRules creates ruleTools but never calls generateVerdict or sets currentVerdict.
  ```

##### 2. Reconciler 比较的字段不一致，导致冲突判断逻辑出现歧义 (coherence, feasibility, adversarial)
- **章节**: `10.4 ReconcileInput` / `10.5 示例` / `ReconcileResult`
- **为什么它很重要**: 文档中 Reconciler 的核对字段是混乱的。第 10.4 节宣称 “比较模型的答案 `SemanticVerdict.answer`（自由文本/Label）与系统裁决的 `SystemVerdict.recommendedCandidateId`（候选ID）”；但在 10.5 节的示例中，比较的却是两个 Label 字符串（`ALLOWED` vs `DENIED`）；而在 `ReconcileResult` 的定义中却又使用了 `modelCandidateId` 和 `systemCandidateId`。如果不将其统一，将导致实现者编写出不兼容的 Reconciler（频繁误报或漏报一致性错误），也无法处理模型输出 null 时的 fallback。
- **可信度**: 0.92
- **事实证据**:
  ```text
  Section 10.4 states reconciliation compares SemanticVerdict.answer with SystemVerdict.recommendedCandidateId.
  Section 10.5 example compares model answer "ALLOWED" (a label) against system label "DENIED", not a candidateId.
  ReconcileResult fields are named modelCandidateId and systemCandidateId, implying ID comparison.
  ```

##### 3. 工作区候选与规则引擎候选类型不兼容 (feasibility)
- **章节**: `9.4 Candidate` / `11.6 createRuleTools` / `12.1 Engine integration`
- **为什么它很重要**: 规则模块的评分公式（MCDA）和否决（Veto）需要对 `Candidate[]`（其中包含 `label` 如 HIGH/LOW/ALLOWED 等）做解析，但目前已有的 `Workspace`（`src/v8/engine/runtime/workspace.ts`）里，其 candidates 纯粹是字符串数组（由 `propose_candidates` 填入的实体 ID，如 `Merch:M001`）。这样 `generateVerdict` 将无法获得携带 label 结构的有效 `Candidate[]`，这会卡死端到端的决策打分。
- **可信度**: 0.92
- **事实证据**:
  ```text
  design.md defines Candidate as { candidateId, label } with direction mapping keyed on HIGH/LOW/ALLOWED/DENIED.
  src/v8/engine/runtime/workspace.ts: candidates is string[] (entity IDs only).
  src/v8/engine/tools/candidate-tools.ts maps c.label into workspace.setCandidates(ids) as entity handles.
  ```

##### 4. 判定网关纯粹依赖 LLM 自律，系统安全保障可能被模型彻底绕过 (adversarial)
- **章节**: `12.2 Rule 何时介入` / `12.3 Executor 集成骨架`
- **为什么它很重要**: 设计中将双轨判决作为防范 V5 中 “模型肆意推翻规则” 的终极安全网，但是目前在 Executor 层面上，整个双轨制网关和一致性校验机制居然是**非强制**的。如果模型不主动调用 `reconcile_verdict`，或者直接执行 `runAgentWithRules` 返回了解析的文本而没有任何 Executor 层的拦截器，那么所谓的 “安全保障” 纯粹流于口头建议，而不能构成架构上的硬堡垒。
- **可信度**: 0.92
- **事实证据**:
  ```text
  Section 12.2 defines Mode A (LLM Only) with no RuleRuntime involvement.
  Section 12.3 returns parseVerdict(result.text) with no reconcile gate or agreed check.
  ```

#### 遗漏 (Omissions)

##### 5. 在整个判决生命周期中缺失事实快照锁定，可能引发时序竞争冲突 (adversarial)
- **章节**: `2.2 与 Engine 的集成方式` / `11.3 evaluate_rule` / `11.5 reconcile_verdict`
- **为什么它很重要**: 模型最终的 SemanticVerdict 与系统的 SystemVerdict 必须基于**同一时间点、同一状态的 FactStore** 进行核对，否则核对将失去意义。但由于 LLM 规则推理的耗时和多步思考，如果在 generateVerdict 和 reconcile 之间混入了 Fact 绑定变更，两边基于不同版本的事实作出判断，核对器将错误地触发警报（模型与系统其实都是对的，只是看了不同的画面）。设计文档对此没有定义任何 Pin 快照或 hash 校验机制。
- **可信度**: 0.88
- **事实证据**:
  ```text
  Section 11.3 evaluate_rule calls facts: workspace.getFacts() on each invocation.
  Section 12.1 step 2 and step 4 are separated by open-ended LLM tool use with no snapshot transaction boundary.
  ```

---

### P1 -- 应该修改 (Should Fix)

#### 错误 (Errors)

##### 6. 实体过滤落空时，实体规则误当作全局规则执行 (coherence, feasibility, adversarial)
- **章节**: `2.4 evaluateRules` / `5.4 执行流程`
- **为什么它很重要**: 2.4 中，如果 `matchingEntities` 数组为空（因为无实体匹配 `appliesTo`，或者传入的 graph 为空），代码就会 fall through 进入全局评估分支 `evaluateSingleRule` 并清空 `entityId`。一旦针对实体的规则不带 `entityId` 执行，它在读取事实快照时将彻底失效、报错，或是全局 veto 掉了某种判定。
- **可信度**: 0.89
- **事实证据**:
  ```text
  Section 2.4: if (matchingEntities.length === 0) then comments "全局规则（无特定实体匹配）" and evaluates.
  filterMatchingEntities returns [] when no types match appliesTo.
  ```
- **修复方案**: 应该拆分判断。若 `appliesTo` 非空但筛选出的实体数量为 0，表明该实体规则由于事实缺失不应触发评估，需直接 skip 或返回 `NOT_APPLICABLE`；只有当 `appliesTo` 明确定义为全局规则时，才应该无 `entityId` 运行。

##### 7. 评分结果的推荐候选 ID (recommendedCandidateId) 忽略了 9.5 节约定的排序规则 (coherence, adversarial)
- **章节**: `2.4 generateVerdict` / `9.5 排序逻辑`
- **为什么它很重要**: 在 `generateVerdict` 中，文档写道 `recommendedCandidateId: scored[0]?.candidateId`。但在第 6.6 节中，MCDA 评分器接口仅仅声明返回 `ScoredCandidate[]`，没有任何排序保证；而系统在 9.5 节却规定了严格的排序逻辑（未被一票否决 > 评分降序 > 置信度降序）。若不强制在 generate 处或 Scorer 返回前进行排序，那么系统做出的 Verdict 将可能把最差的候选人推荐上去，甚至跟 9.5 节自我矛盾。
- **可信度**: 0.90
- **事实证据**:
  ```text
  Section 2.4: recommendedCandidateId: scored[0]?.candidateId.
  Section 9.5 defines three-level sort: non-vetoed first, then normalizedScore desc, then confidence desc.
  ```
- **修复方案**: 明确 MCDA 评分器输出的数组必须在内部按 9.5 节规则严格排好序，或者在 `generateVerdict` 中显式调用 `sortCandidates` 辅助函数。

#### 遗漏 (Omissions)

##### 8. 置信度评估定义了公式，但在 System Verdict 产生阶段未应用 (coherence)
- **章节**: `2.1 定位` / `8. Confidence Estimation` / `2.4 generateVerdict`
- **为什么它很重要**: 文档在第 8 节中设计了完美的置信度数学公式：`confidence = max(0, 1 - missingRatio * missingFactPenalty)`，也要求在 `ScoredCandidate` 结构中输出 `confidence: number`；但在 2.4 节的核心实现骨架和评分逻辑中，没有任何一处逻辑读取了缺失事实或执行了第 8 节的置信度计算公式。这属于典型的“有定义无实现”骨架遗漏。
- **可信度**: 0.90
- **事实证据**:
  ```text
  Section 2.1 lists "Confidence Estimation" as a core responsibility.
  Section 8.3 defines the formula, but Section 2.4 code never applies it.
  ```
- **修复方案**: 在 `generateVerdict` 或评分器算分中，传入 `missingFacts` 列表，计算该候选人在该条 soft_criterion 规则上的置信度并填入。

##### 9. 整个 Executor 继承机制纯属口头设想，缺乏具体的接入点定义 (feasibility)
- **章节**: `12. 运行机制与集成`
- **为什么它很重要**: 设计中勾勒了 Mode B （LLM 事实搜集 -> 系统打分 -> 核对）的完美画面，但现在的 `src/v8/engine/agent/executor.ts`、`src/v8/engine/runtime/config.ts` 以及相关的配置中完全不包含规则引擎的依赖注入，也没有任何钩子去调起 rules 校验和初始化。为了让实现者不面临两边对不上的窘境，应当在文档中增加一节详细描述：如何扩展 Executor 以及 `RuntimeConfig` 的注入路径。
- **可信度**: 0.93

---

### P2 -- 可以修改 (Consider Fixing)

#### 遗漏 (Omissions)

##### 10. MCDA 归一化公式中在“触发 0 个 soft rules”时分母为零漏洞 (feasibility, adversarial)
- **章节**: `6.4 评分公式`
- **为什么它很重要**: 公式 `normalizedScore = rawScore / maxPossibleScore` 将 `maxPossibleScore` 定义为触发的所有 `soft_criterion` 的权重之和。如果此次没有触发任何 soft rules，分母为 0 就会在 TS/JS 运行时产生 `NaN` 或零除异常。
- **可信度**: 0.84
- **修复方案**: 增加保护分支：若 `maxPossibleScore === 0`，则 `normalizedScore` 默认为 `0` 或者不进行归一化直接输出 rawScore。

##### 11. RequiredFact 的 scope 定义（如 type / global）没有对应的 FactStore 解析规则 (feasibility, adversarial)
- **章节**: `4.4 RequiredFact` / `8.3 置信度`
- **为什么它很重要**: `RequiredFact` 支持 `entity | type | global`。但 5.5 中我们只看到了根据特定实体 `entityId` 调用的 `getValue`。目前已有的 `FactStore` 也没有对应 `type`（解析实体类别）或者 `global`（全局配置事实）的提取接口，导致无法实现该元数据的自动校验。
- **可信度**: 0.81
- **修复方案**: 精炼 RequiredFact 的作用范围为单实体（entity）级别，或在文档中给出 `type` 级别和 `global` 级别事实的解析伪代码。

---

### 残余顾虑 (Residual Concerns)

- **评分器与 V6 遗留代码迁移**: 尽管 V8 打算做线性扫描简化，但 V6 中基于 `criticPredictive` 的评分器依然有大量可以复用的矩阵与计算。文档缺乏关于如何从 V6 将 rules 平滑迁移和简化到 V8 路径上的指南。
- **Evaluator 异常导致的 Fail-Safe 缺口**: 当 hard_constraint 规则的回调方法抛出异常时，2.4 的代码会返回 `triggered: false, error: err`。由于 veto 只在 `triggered === true` 时生效，一旦在生产环境中因为网络、数据库等报错，本应一票否决的安全网会误判为 “未触发（不否决）”，从而使安全保护彻底击穿。应当引入 fail-closed 安全兜底机制（异常即否决或返回错误级 SystemVerdict）。
- **MEDIUM 方向评分的方向感知对称缺陷**: MEDIUM 方向（risk_up 和 risk_down 均分配 +0.3 权重）在 soft 规则下会导致不管事实往哪边偏（无论是风险升高还是降低），MEDIUM 的候选人都会赚取正分，这在稀疏规则集下会对其他指向性的 label 形成压制性极大的噪声。

---

### 递延问题 (Deferred Questions)

- 系统裁决（System Verdict）的生成逻辑到底应该在 LLM 代理循环中作为 LLM 发现不对劲时自行调用的 Tool（如 `generate_verdict`），还是应该纯粹在 Executor 外层、LLM 回答完成后离线触发？如果是后者，如何处理 LLM 的解释文字与 System Verdict 发生打架的问题？
- 当所有 soft rules 的权重和方向使得所有 Candidates 都被打成 0 分，且全部遭到 hard_constraint 一票否决时，`recommendedCandidateId` 是否应当返回 null，还是应该返回一个携带紧急异常代码（`ALL_VETOED`）的特殊 ID？
- 第一阶段的 Reconciler 一致性算法是否支持对复杂的多实体绑定（如模型判定 entityA allowed, entityB denied）进行逐一配对校验？还是依然局限在 V6 的单标签（ALLOWED）纯字符串相等比较？

---