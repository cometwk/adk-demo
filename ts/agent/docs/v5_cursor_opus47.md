# OPUS-4-7 - Generalization challenges of V5 design
_Exported on 2026/4/27 at GMT+8 10:07:50 from Cursor (3.2.11)_

---

**User**

先阅读 V5 关键信息：
1 设计@docs/think_v5.md 
2 执行过程@tmp/v5_2.json 

然后，讨论
若扩展到一般化的场景中，面临什么样的挑战

---

**Cursor**

阅读完 `docs/think_v5.md`（V5 设计）和 `tmp/v5_2.json`（一次完整执行轨迹）后，我们可以看到 V5 在 demo 场景下跑得相当漂亮：从 `inspect_schema/inspect_rules` → 入口实体披露 → `describe_method` → `call_method` → `record_evidence` → `propose/evaluate_candidates`，决策链完整，证据可追溯。

但这场漂亮的演示，建立在一组**"理想世界假设"**之上。一旦扩展到通用化的真实场景（企业、跨域知识、多用户、长生命周期），这些假设就会逐个失效。下面按层次讨论挑战，并结合 `tmp/v5_2.json` 中已经暴露出来的"病灶"。

---

## 一、本体 G = {T, R, C, E} 的规模与质量

V5 demo 中：3 个类型、4 种关系、7 条规则、9 个实体。`prompt.ts` 还能一次性把 T/R/C 的摘要塞进 system prompt。

通用化时这个数量级会瞬间崩盘：

| 维度 | demo | 通用 |
|------|------|------|
| T | 3 | 几十到上百（业务、组织、产品、合规、客户……） |
| R | 4 | 几百种（同一对实体可能存在多种语义关系） |
| C | 7 | 上千（公司制度 + 部门 SOP + 行业法规 + 隐性偏好） |
| E | 9 | 10⁶~10⁹ |

由此带来的真实挑战：

1. **本体提取本身就是一个大项目**。真实业务中没有现成的 `seed.ts`。需要从 SOP、Confluence、政策文档、专家头脑里抽取，且不一致、不完备、有冲突。
2. **本体演化**：T/R 会被合并、拆分、重命名；C 有时效（去年的规则今年作废）。需要版本与兼容策略，否则 golden trace 会大面积失效。
3. **多本体并存**：HR、财务、产品、技术各有自己的本体；"项目"在 PMO 和工程系统里语义不同。需要 ontology alignment / entity resolution，而这本身又是一个 LLM/图算法难题。
4. **数据脏**：缺失值、单位不一致（小时 vs 人日）、过期快照、矛盾事实。`engineer.workload=85` 在 demo 里是干净的整数，真实数据是"上周打卡 + 当周计划 + 自报告"的脏混合。

---

## 二、C 一等化的副作用：规则不再是"7 条小卡片"

V5 最有价值的设计是把 C 从"藏在 method 里"提升到一等可查询对象（`ontology/decision.ts`、`inspect_rules`）。但通用化时会暴露三类深层问题：

### 1. 规则爆炸 + 命名冲突 + 重复蕴含

demo 里我们已经能看到端倪——`engineer_burnout_threshold`、`project_team_load`、`senior_coverage` 三条规则在语义上是部分重叠的（同一份"团队负载"事实，被三条规则各自计入分数），最终造成**重复计分**。规则越多，这种隐式重叠会越严重，需要：
- 规则依赖图（哪些规则共享 fact）
- 规则去重 / 归并
- 形式化优先级（hard > derived > soft），而不是单纯按数量加和

### 2. 软硬规则混合时的评分不可信 —— demo 已经亲口承认了

最关键的一段在 `tmp/v5_2.json` 中：`evaluate_candidates` 返回的排名是

```
HIGH:   0.33
MEDIUM: 0.50
LOW:    0.67
```

而 LLM 在最终输出里**直接推翻了系统的评分**，硬把结论改成 `HIGH`：

> "系统评分显示 LOW 得分最高……考虑到实际风险因素的严重性，**我给出 HIGH 风险评级**。"

这是一个非常重要的信号：当前的 `evaluate_candidates` 仅基于"规则触发计数"做加权（见 `src/v5/agent/tools/decision.ts` 的实现），与**真实业务对风险的因果直觉**严重不一致。通用化时这个问题会放大成系统级风险：

- 系统可信 → LLM 不质疑 → 错误结论传播
- LLM 可信 → 系统形同虚设 → 失去可审计性

真正可用的打分需要 MCDA / AHP / 专家先验校准，而不是触发与否的 0/1 加权。

### 3. 规则与事实的命名空间问题 —— demo 也踩了

同一段 `evaluate_candidates` 结果中，`engineer_burnout_threshold` 报了 `missingFacts: [workload, seniority]`，但模型其实已经传了 `workload_alice / workload_bob / seniority_alice…`。原因是 `facts` 是扁平 key-value，没有"哪个实体的哪个属性"的命名空间。通用化时实体数量一多，扁平 facts 必然崩溃，必须升级成 `(entityId, property) → value` 的结构化事实绑定。

---

## 三、E 渐进披露：入口实体的"假问题"

V5 在 prompt 里写得轻巧：

```441:443:docs/think_v5.md
ENTRY ENTITIES:
- project_portal
```

但通用化时**入口实体几乎不可能"被给定"**。用户问的是：

- "这个项目风险大吗？"
- "我团队下季度撑得住吗？"
- "把这个 bug 修了会引入什么风险？"

这意味着系统必须先做：

1. **意图识别 + 实体链接**：自然语言里"这个项目" → 哪条 graph node？
2. **消歧**：同名实体（两个 alice）、跨系统 ID（Jira `PROJ-123` vs Git repo `portal`）；
3. **权限边界**：不同用户能看到的子图不同，必须在工具层做权限剪枝，否则 `query_neighbors` 会泄露未授权实体；
4. **隐私 / 合规**：工时、绩效、薪资是敏感字段，C 中的 `explanation_policy` 必须知道哪些 evidence 不能被引用、不能被复述。

V5 的 `search_nodes / inspect_node / query_neighbors` 在数据量小、权限平的 demo 里足够，通用场景下需要在**工具调用前后**插入鉴权、脱敏、审计层。

---

## 四、Agent loop 的实际成本与漂移

`tmp/v5_2.json` 这次轨迹用了大约 **18 次 tool call**、**8 个工具种类**，得到一个相对清晰的结论。注意几个信号：

### 1. "盲调"仍未消除

```
call_method(project_api, evaluateRisk, {teamLoad: 0, seniorCount: 0})
→ {risk: "HIGH", reasons: ["没有高级工程师", ...]}
```

模型在没有调查 `project_api` 工程师的情况下，直接编造了 `0/0` 的参数，得到一个**看起来很合理的错误结论**。下一步它才回去补查，得到 `MEDIUM` 的真实结论。`describe_method` 这个工具能阻止"参数缺失",阻止不了"用零做参数"。通用化时这种"语法合法、语义荒谬"的调用会大量出现。需要在 method 层加 precondition assertion（比如 teamLoad > 0 才有意义）。

### 2. 步数随图规模线性甚至超线性增长

demo 里 portal 只有 1 个依赖、1 个 owning team、2 个工程师；真实项目通常有 5–20 个依赖、跨多个团队、几十名工程师。tool call 步数会从 ~20 升到 ~200，意味着：

- 上下文 token 爆炸（成本与延迟）
- 错误累积（每一步都有概率漂移）
- 决策不可重现（同一问题两次跑出不同结论）

需要的不是"加更多工具"，而是 **planner / sub-agent / 子图剪枝**：先用一个轻量 plan 决定要不要展开 dependency 子图。

### 3. 工具数量增长的"选择困难"

V5 已经有 11 个工具，prompt 中按类别给了使用顺序（"先 inspect_schema/inspect_rules → 再 search/inspect/query → 用 describe_method → call_method"）。通用化时工具数会增长到几十甚至上百（每个业务域一组），LLM 选错工具或重复调用同一工具的概率显著上升。需要分层：

- 一级：抽象的"探索 / 推理 / 决策"
- 二级：按业务域（HR / 项目 / 合规 / 财务）路由
- 三级：具体 tool

---

## 五、决策语义层：从"打分"到"可解释 + 可反事实"

通用化决策辅助系统，光给 `recommendation + alternatives + evidence` 还不够，会面临：

1. **因果 vs 相关性**：demo 里"alice 工时 85h" + "项目优先级 high" 被一起列为风险因素，但二者之间是否真的因果传导？模型很难分辨，会把"相关"当"因果"做推荐。
2. **反事实 (what-if)**：用户真正想问的是"如果我把 alice 的工时降到 60，风险会变成什么？" V5 当前没有反事实接口，必须重跑一次完整 loop。需要把规则 + 方法做成可微分 / 可重放的小型仿真。
3. **不确定性的真假**：V5 的 `Uncertainty` 字段很优雅，但 demo 里它是 LLM "声明"的、不是系统度量出来的。通用场景下需要量化不确定性（缺失字段比例、置信区间、历史预测准确率），否则 `confidence: 0.76` 只是一个安慰性数字。
4. **冲突呈现**：当系统打分（LOW）与 LLM 判断（HIGH）冲突时——就是这次 demo 真实发生的情况——应该向用户**显式暴露冲突**，而不是让 LLM 静悄悄覆盖系统结论。

---

## 六、人机协同与责任边界

`docs/think_v5.md` 第十四节明确写："不追求完全自动决策"。这个克制非常正确，但通用化时还要补几个产品级问题：

1. **澄清式提问**：模糊问题应该反问用户（"你关心的是技术风险还是排期风险？"），而不是自己生成 3 个候选硬选。
2. **决策结果的呈现层**：项目经理看不懂 `cand_9 / ev_7 / engineer_burnout_threshold`。需要把 evidence id 渲染成自然语言段落，并保留可点击穿透到原始事实。
3. **反馈闭环**：用户驳回了"HIGH"判断，这条信息要不要回流为新的训练样本？要不要调整规则权重？没有反馈闭环，系统会停在 demo day 的水平。
4. **审计与责任**：Agent 推荐"暂停 portal 项目" → 真的暂停了 → 出了问题，谁负责？需要 trace 不可篡改、规则版本可冻结、决策可重放（V5 的"决策上下文 + ToolResult 标准化"是个好开头，但还需 immutable log）。

---

## 七、把 demo 的"病灶"映射成通用挑战

把 `tmp/v5_2.json` 暴露的具体问题，再升一级抽象一下，方便 V5 → V5.x 的演进：

| demo 中的现象 | 通用场景的挑战 |
|----------------|----------------|
| `evaluateRisk(teamLoad:0, seniorCount:0)` 盲调 | 工具语法合法、语义无意义；需要 precondition / fact-completeness 检查 |
| `evaluate_candidates` 算出 LOW 得分最高，LLM 强行改 HIGH | 规则评分模型与业务直觉脱节；缺少校准机制 |
| `engineer_burnout_threshold` 报 missingFacts，其实已传 | facts 扁平 key-value 没有实体命名空间，规则与事实绑定不严谨 |
| 三条规则共享同一份团队负载事实 | 规则间隐式蕴含，存在重复计数 |
| 模型把 `evaluate_candidates` 的结论作为参考但不照单全收 | 系统层与 LLM 层对"权威性"分配不清 |
| 全部规则在 prompt 中列出 | 规则数量上百时，必须按 intent 检索而非全量曝光 |

---

## 八、一句话总结

> **V5 的设计哲学（显式 C + 渐进 E + 证据 + 多答案）是正确方向；但 demo 之所以 work，是因为它同时享受了"小本体、干净数据、单一用户、单一意图"这四份免费午餐。通用化的真正挑战不在工具或 prompt，而在 (1) 本体工程（如何持续构建并演化 C 与 R），(2) 评分校准（如何让规则打分与业务直觉一致），(3) 实体接入与权限（如何在保护隐私下做 entity resolution），以及 (4) 长链路 loop 的可信度（如何阻止 LLM 静悄悄覆盖系统结论）。**

如果你愿意，我可以基于这份分析，在 `docs/think_v5.md` 里追加一节 "十六、通用化挑战与 V5.4+ 路线图"，把上面这些挑战映射成具体的下一步落地任务（比如 `(entityId, property) → value` 的 fact 命名空间、precondition assertion、规则依赖图、conflict-aware ranking）。要不要我直接草拟？

---

**User**

好的，基于这些分析，草拟一份完整的设计 thinki_v6.md 更好

---

**Cursor**

好的，我把前面那份分析展开成完整的 V6 设计文档。先看一眼 V5 当前的几个关键源文件，确保 V6 的接口与文件演进路径是连贯的，然后写 `docs/think_v6.md`。

我把 V5 的核心代码结构和 demo 暴露的具体问题都对照清楚了。现在写 V6 设计草案，放在 `docs/think_v6.md`。

V6 设计草案已写入 `docs/think_v6.md`（1141 行，与 V5 体量相当）。结构上对标 V5，但每节都直接对应前一轮分析中点出的具体病灶。

## 文档结构速览

`docs/think_v6.md` 共十五节，可以按四块来看：

**1. 问题陈述（第一节）**  
直接引用 V5 demo 的源代码和轨迹来"开膛"——比如打分逻辑

```260:271:src/v5/agent/tools/decision.ts
for (const candidate of candidates) {
    if (!candidate) continue;
    const label = candidate.label.toUpperCase();
    let score: number;

    if (label === "HIGH" || label === "高风险") {
        score = triggeredCount / Math.max(totalCriteria, 1);
    } else if (label === "LOW" || label === "低风险") {
        score = 1 - triggeredCount / Math.max(totalCriteria, 1);
    } else {
        score = 0.5;
    }
```

——把"LOW=0.67、LLM 改 HIGH"、"facts 扁平 KV 命名空间冲突"、"`evaluateRisk(0,0)` 盲调"这三件事直接钉为 V6 必须解决的结构性问题。

**2. 设计哲学与架构（第二~五节）**
- 一句话定义：`V6 = V5 决策闭环 + 工程化本体 + 校准评分 + 双轨判决 + 意图前端 + 策略后端`
- 五条原则：本体即代码、事实有归属、打分要校准、判决双轨、决策可重放
- 系统从"工具型"升级为"系统型"：Front-end → Reasoning Loop → Reconciliation 三层
- 给出 `src/v6/` 文件结构（与 `src/v5/` 平行展开，不破坏 V5）

**3. 核心类型与机制（第六~八节）—— 文档的实质**
- **`FactBinding` / `FactStore`**：把 `{teamLoad: 150, workload_alice: 85}` 这种扁平 KV 替换成 `(entityId, property)` 命名空间 + source 追踪 + validUntil
- **`Rule` 升级 + RuleDAG**：加 `weight` / `direction` / `severityFn` / `dependsOn` / `subsumedBy`，解决 demo 中三条规则共享同一负载事实的重复计数
- **MCDA `scoreCandidates`**：用 direction-aware 加权 + veto + calibration 替换"触发数/总数"
- **`SystemVerdict + ModelVerdict + Reconciliation`**：双轨判决，LLM 不能再静默覆盖系统结论
- **`PolicyContext`**：工具层装饰器做权限/隐私剪枝
- **`Planner / Executor / Critic` 三段式**：planner 不能调工具，critic 必须 deterministic
- **`CounterfactualOffer`**：what-if 重放走 critic-only，不调用 LLM

**4. 落地路线与工程契约（第九~十五节）**
- 第九节给了一份 V5 vs V6 对同一问题的执行链对比，能看到"LLM 改 HIGH"如何被 reconciliation 显式 surface
- 第十节七条关键设计决策（其中"LLM 不应看到中间分"是直接针对 demo 中越权修正的根因）
- 第十一节 V5 → V6 的四阶段迁移（V6.0 FactStore → V6.1 RuleDAG+MCDA → V6.2 双轨判决 → V6.3 前端+planner → V6.4 策略+反事实+反馈）
- 第十二节测试策略，重点是"用 `tmp/v5_2.json` 的输入跑 V6 critic，必须得到 HIGH > MEDIUM > LOW"作为回归基准
- 第十四节"暂不做什么"明确划出多 Agent、因果图、规则 DSL、向量检索、实时图等延后项

## 与 V5 文档的衔接关系

| V5 已立的桩 | V6 在其上的加固 |
|---|---|
| `Constraint` 一等化 (`ontology/constraints.ts`) | 升级为 `Rule` + RuleDAG + 版本号 |
| `DecisionWorkspace` | 拆为 `FactStore` + `Verdict` 两套，分离"事实"与"判断" |
| `evaluate_candidates` 工具 | 移除（替换为 `evaluate_rule` 细粒度 + critic 内部 `scoreCandidates`） |
| 单一 LLM verdict | systemVerdict + modelVerdict + reconciliation |
| 工具列表（`graph` / `method` / `ontology` / `decision`） | 全部保留，加 policy 装饰；新增 `bind_fact` / `lookup_fact` / `simulate` |
| 调用方写死 `entryEntities` | 前端 pipeline：intent + entityLinker + clarify |

## 一句总结

> **V4 让 Agent 会用图。V5 让 Agent 会用图辅助人做决策。V6 让"Agent 辅助决策"这件事变成可工程化、可校准、可问责的系统。**

如果你对其中任何一节想展开成可落地的代码骨架（比如先把 V6.0 的 `FactStore` 和 `bind_fact / lookup_fact` 工具落到 `src/v6/`），我可以接着做。

