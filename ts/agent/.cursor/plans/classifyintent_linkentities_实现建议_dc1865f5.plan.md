---
name: classifyIntent linkEntities 实现建议
overview: 为 v6 frontend 实现设计文档 §7.1 中缺失的 classifyIntent (LLM fallback) 和 linkEntities (query-level NER + entity resolution)，并将二者编排为 frontEnd() 函数接入 runDecisionAssistant pipeline。
todos:
  - id: enhance-classify-intent
    content: "改造 frontend/intent.ts: 保留 detectIntent 为纯规则同步函数，新增 classifyIntent 异步函数（规则 + LLM fallback）"
    status: completed
  - id: add-ner-extraction
    content: 在 frontend/entityLinker.ts 中新增 extractMentionsByRules + extractMentionsByLLM，实现从 userQuery 到 EntityMention[] 的提取
    status: completed
  - id: implement-link-entities
    content: 实现 linkEntities 异步函数：mentions 提取 → createEntityLinker resolution → ambiguity 计算 → LinkEntitiesResult
    status: completed
  - id: create-frontend-orchestrator
    content: 新建 frontend/index.ts，实现 frontEnd() 编排器，组合 classifyIntent + linkEntities + clarify
    status: completed
  - id: wire-into-pipeline
    content: 改造 index.ts 的 runDecisionAssistant，用 frontEnd() 替换当前的 detectIntent + 手动 entryEntities
    status: completed
  - id: add-aliases-to-demo
    content: 为 ex4 demo 的 seed 添加别名映射（小明→xiao_ming 等），验证端到端自动实体链接
    status: completed
isProject: false
---

# classifyIntent 和 linkEntities 实现建议

## 现状问题

`runDecisionAssistant` ([src/v6/index.ts](src/v6/index.ts) L55) 当前只调用了 `detectIntent(userQuery)`（纯关键词），然后直接把调用方传入的 `entryEntities` 塞进 `DecisionTask`。设计文档 §7.1 的 `frontEnd()` 编排器（意图识别 + 实体链接 + 澄清）完全缺失。

---

## 一、classifyIntent 增强

**文件:** [src/v6/frontend/intent.ts](src/v6/frontend/intent.ts)

现有 `detectIntent` 是纯关键词评分（L91-140），注释里提到 LLM fallback 但未实现。建议改造为两阶段：

### 阶段 1：保留现有关键词匹配（快速路径）

现有逻辑不变，若 `confidence >= 0.6` 直接返回。

### 阶段 2：LLM fallback（慢速路径）

当关键词 confidence < 0.6 时，调用 LLM 做结构化分类：

```typescript
import { generateObject } from 'ai'
import { z } from 'zod'
import { model } from '../../lib/model'

const IntentSchema = z.object({
  mode: z.enum(['predictive', 'diagnostic']),
  intent: z.enum([
    'risk_assessment', 'prioritization', 'recommendation',
    'capacity_planning', 'what_if_planning',
    'rca', 'post_mortem', 'anomaly_explanation',
    'regression_attribution', 'incident_diagnosis',
  ]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
})

async function classifyIntentWithLLM(
  userQuery: string,
  ruleResult: IntentResult,
): Promise<IntentResult> {
  const { object } = await generateObject({
    model,
    schema: IntentSchema,
    prompt: `将用户问题分类为决策意图。
规则系统初步判断: mode=${ruleResult.mode}, intent=${ruleResult.intent}, confidence=${ruleResult.confidence}

用户问题: "${userQuery}"

predictive 意图（前向预测）: risk_assessment, prioritization, recommendation, capacity_planning, what_if_planning
diagnostic 意图（后向归因）: rca, post_mortem, anomaly_explanation, regression_attribution, incident_diagnosis`,
  })

  return {
    mode: object.mode,
    intent: object.intent,
    confidence: object.confidence,
    matchedKeywords: ruleResult.matchedKeywords,
  }
}
```

### 改造后的 classifyIntent

```typescript
export async function classifyIntent(userQuery: string): Promise<IntentResult> {
  const ruleResult = detectIntent(userQuery) // 现有纯规则函数改名
  if (ruleResult.confidence >= 0.6) return ruleResult
  return classifyIntentWithLLM(userQuery, ruleResult)
}
```

**设计决策:**

- `generateObject` (Vercel AI SDK) 用 JSON schema 保证输出结构化，不需要手动 parse
- 把规则结果作为 hint 传给 LLM，让 LLM 在规则系统已有线索的基础上做精细判断
- 保持 `detectIntent` 为同步纯函数（测试/确定性场景用），新增 `classifyIntent` 为异步函数

---

## 二、linkEntities 实现

**文件:** [src/v6/frontend/entityLinker.ts](src/v6/frontend/entityLinker.ts)

现有 `createEntityLinker` 只能对已知 name 字符串做精确/别名/子串匹配。**缺失的关键环节是从 userQuery 中提取实体提及 (NER)**。

### 方案：规则提取 + LLM 回退 的两阶段 NER

#### 阶段 1：规则提取（快速、确定性）

从 query 中用模式匹配抽取 mention：

```typescript
export type EntityMention = {
  text: string
  source: 'rule' | 'llm'
  hintType?: string // 从上下文推断的可能类型 ("Book", "Reader" 等)
}

function extractMentionsByRules(query: string): EntityMention[] {
  const mentions: EntityMention[] = []

  // 1. 书名号 《...》 → 大概率是某种命名实体
  for (const m of query.matchAll(/《([^》]+)》/g)) {
    mentions.push({ text: m[1], source: 'rule', hintType: 'Book' })
  }

  // 2. 引号内容 "..." / '...'
  for (const m of query.matchAll(/["""]([^"""]+)["""]/g)) {
    mentions.push({ text: m[1], source: 'rule' })
  }

  // 3. 已知别名表直接命中（由 ontology aliases 提供）
  // 这部分在 link 阶段处理

  return mentions
}
```

#### 阶段 2：LLM NER 回退

当规则提取结果不足（如 query 中实体没有明确标记）时，调 LLM：

```typescript
import { generateObject } from 'ai'
import { z } from 'zod'

const NerSchema = z.object({
  mentions: z.array(z.object({
    text: z.string().describe('实体在原文中的表述'),
    hintType: z.string().optional().describe('推测的实体类型'),
  })),
})

async function extractMentionsByLLM(
  query: string,
  typeNames: string[], // ontology 中的类型列表
): Promise<EntityMention[]> {
  const { object } = await generateObject({
    model,
    schema: NerSchema,
    prompt: `从用户问题中提取所有实体提及。
可能的实体类型: ${typeNames.join(', ')}

用户问题: "${query}"

只返回实体提及，不要包含动词或描述性短语。`,
  })
  return object.mentions.map(m => ({ ...m, source: 'llm' as const }))
}
```

#### 完整的 linkEntities 流程

```typescript
export type LinkEntitiesResult = {
  bestPick: string[]          // 最终选定的 entity IDs
  ambiguity: number           // 0..1, 多候选歧义程度
  details: Array<{
    mention: EntityMention
    candidates: EntityLinkResult[]
    picked: EntityLinkResult | null
  }>
}

export async function linkEntities(
  userQuery: string,
  graph: Graph,
  config: EntityLinkerConfig & { typeNames?: string[] } = {},
): Promise<LinkEntitiesResult> {
  // 1. 提取 mentions
  let mentions = extractMentionsByRules(userQuery)
  if (mentions.length === 0 && config.typeNames?.length) {
    mentions = await extractMentionsByLLM(userQuery, config.typeNames)
  }

  // 2. 对每个 mention 做 entity resolution
  const linker = createEntityLinker(graph, config)
  const details = mentions.map(mention => {
    const result = linker.link(mention.text)
    // 也尝试用 hintType 做 type-scoped 搜索
    const byType = mention.hintType
      ? linker.findByType(mention.hintType)
          .filter(r => r.entityId.toLowerCase().includes(mention.text.toLowerCase())
                    || mention.text.toLowerCase().includes(r.entityId.toLowerCase()))
      : []
    const candidates = result ? [result, ...byType] : byType
    const uniqueCandidates = dedup(candidates)
    return {
      mention,
      candidates: uniqueCandidates,
      picked: uniqueCandidates[0] ?? null,
    }
  })

  // 3. 计算歧义分数
  const multiCandidateCount = details.filter(d => d.candidates.length > 1).length
  const unlinkedCount = details.filter(d => d.picked === null).length
  const ambiguity = mentions.length > 0
    ? (multiCandidateCount + unlinkedCount * 2) / (mentions.length * 2)
    : 0

  return {
    bestPick: details.map(d => d.picked?.entityId).filter(Boolean) as string[],
    ambiguity: Math.min(1, ambiguity),
    details,
  }
}
```

**设计决策:**

- 规则提取优先（《》书名号、引号、别名表），LLM 只在规则提取为空时触发
- `ambiguity` 分数：多候选贡献 1 分，完全未链接贡献 2 分，归一化到 0..1
- 返回 `details` 供澄清流程使用（知道哪个 mention 有歧义）
- 利用现有 `createEntityLinker` 做 resolution，不重复造轮子

---

## 三、frontEnd 编排器

**新文件:** [src/v6/frontend/index.ts](src/v6/frontend/index.ts)

将 classifyIntent + linkEntities + clarify 组合为设计文档描述的 `frontEnd()`:

```typescript
export async function frontEnd(
  userQuery: string,
  graph: Graph,
  ontology: Ontology,
  ctx: { contextualEntityIds?: string[], policyCtx?: PolicyContext } = {},
): Promise<
  | { kind: 'task'; task: DecisionTask }
  | { kind: 'clarify'; questions: ClarifyQuestion[] }
> {
  const intent = await classifyIntent(userQuery)
  const entities = await linkEntities(userQuery, graph, {
    contextualEntityIds: ctx.contextualEntityIds,
    typeNames: ontology.types.map(t => t.name),
  })

  // 低置信或高歧义 → 澄清
  if (intent.confidence < 0.6 || entities.ambiguity > 0.5) {
    const questions: ClarifyQuestion[] = []
    if (intent.confidence < 0.6) {
      questions.push(buildIntentClarification(intent.intent))
    }
    for (const d of entities.details) {
      if (d.candidates.length > 1) {
        questions.push(buildEntityClarification(d.mention.text, d.candidates))
      }
    }
    if (questions.length === 0) {
      questions.push(buildIntentClarification(intent.intent))
    }
    return { kind: 'clarify', questions }
  }

  return {
    kind: 'task',
    task: {
      taskId: randomUUID(),
      mode: intent.mode,
      intent: intent.intent,
      goal: userQuery,
      entryEntities: entities.bestPick,
      scope: { typesOfInterest: ontology.types.map(t => t.name) },
      policyCtx: ctx.policyCtx ?? OPEN_POLICY,
    },
  }
}
```

---

## 四、接入 runDecisionAssistant

**文件:** [src/v6/index.ts](src/v6/index.ts)

改造 L54-67 的逻辑：

```typescript
// Before (current):
const intentResult = detectIntent(userQuery)
const task: DecisionTask = { entryEntities: input.entryEntities, ... }

// After:
const frontEndResult = await frontEnd(userQuery, graph, ontology, {
  contextualEntityIds: input.entryEntities,  // 调用方的 hint 作为上下文偏好
})

if (frontEndResult.kind === 'clarify') {
  // 返回澄清（需要在 DecisionResponse 中增加一个 clarify 分支）
  return { kind: 'clarify', questions: frontEndResult.questions }
}

const task = frontEndResult.task
// 如果调用方显式给了 entryEntities，merge 进去（向后兼容）
if (input.entryEntities?.length) {
  task.entryEntities = [...new Set([...task.entryEntities ?? [], ...input.entryEntities])]
}
```

**向后兼容策略:** 当调用方传了 `entryEntities` 时，它们作为 `contextualEntityIds` 参与 entity linker 的优先级排序，同时 merge 到最终结果中。现有 demo 无需改动即可继续工作。

---

## 五、对 ex4 demo 的影响

改造后，demo 可以简化为：

```typescript
const predictiveResult = await runDecisionAssistant({
  userQuery: '小明能借《人工智能简史》吗？请根据图书馆规定进行评估。',
  graph,
  ontology: libraryOntology,
  factStore,
  // entryEntities 不再需要手动指定！
  verbose: true,
})
```

前端自动从 query 中提取 "小明" → `xiao_ming`, 《人工智能简史》 → `book_ai_history`。但需要在 seed 中为这些实体配置别名映射：

```typescript
const aliases = {
  '小明': 'xiao_ming',
  '人工智能简史': 'book_ai_history',
  '市图书馆': 'city_library',
}
```

---

## 关键设计权衡

- **LLM 调用次数**: classifyIntent 最多 1 次, linkEntities 最多 1 次, 总共 0-2 次 LLM 调用（规则命中时为 0 次）
- **延迟**: 规则优先策略下，大多数明确 query 走纯规则路径（~~0ms），模糊 query 才触发 LLM（~~500ms）
- **确定性**: 关键词匹配路径完全确定性，LLM 路径通过 `generateObject` + schema 约束输出结构
- **别名表 vs LLM NER**: 别名表是 O(1) 查找且确定性高，建议作为主力；LLM NER 仅处理别名表覆盖不到的长尾

