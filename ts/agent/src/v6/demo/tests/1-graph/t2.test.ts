import { generateText, stepCountIs } from 'ai'
import { describe, expect, it } from 'vitest'
import { model } from '../../../../lib/model'
import { buildPredictiveSystemPrompt } from '../../../agent/prompt'
import { createFactTools, resetSessionFacts } from '../../../agent/tools/facts'
import { createGraphTools } from '../../../agent/tools/graph'
import { createMethodTools } from '../../../agent/tools/method'
import type { DecisionTask } from '../../../ontology/decision'
import { OPEN_POLICY } from '../../../policy/context'
import { FactStore } from '../../../runtime/eventStore'
import { buildOntology } from '../../../runtime/ontology-builder'
import { seedGraph2 } from './seed2'

// ── 通用执行器 ──

async function runPredictiveAgent(task: DecisionTask) {
  resetSessionFacts()
  const policy = task.policyCtx
  const currentFacts = new FactStore()
  const ontology = buildOntology({ version: '1.0.0' })
  const graph = seedGraph2()

  const systemPrompt = buildPredictiveSystemPrompt(task, ontology)
  const userMessage = `请对以下实体进行决策分析：${(task.entryEntities ?? []).join(', ')}。\n目标：${task.goal}`

  const graphTools = createGraphTools(graph, policy, currentFacts)
  const methodTools = createMethodTools(graph, currentFacts, policy)
  const factTools = createFactTools(policy)

  const tools = { ...graphTools, ...methodTools, ...factTools }

  const result = await generateText({
    model,
    system: systemPrompt,
    prompt: userMessage,
    tools,
    stopWhen: stepCountIs(50),
    temperature: 0,
  })
  return result
}

function makeTask(overrides: Partial<DecisionTask> & { goal: string; entryEntities: string[] }): DecisionTask {
  return {
    taskId: 'test-' + Date.now(),
    mode: 'predictive',
    intent: 'risk_assessment',
    scope: {},
    policyCtx: OPEN_POLICY,
    ...overrides,
  }
}

function extractTextAnswer(result: Awaited<ReturnType<typeof generateText<any>>>): string {
  return result.text ?? ''
}

function hasToolCall(result: Awaited<ReturnType<typeof generateText<any>>>, toolName: string): boolean {
  return result.steps.some((step) => step.toolCalls?.some((tc) => tc.toolName === toolName))
}

// ── 测试套件 ──

describe('LLM-Agent Graph 推理有效性', () => {
  /*
   * 场景 S1：全部规则通过 → 允许借阅
   *
   * 小红（无逾期、已借 0 本）申请借阅《相对论导读》（上架 60 天）。
   * 三条规则均不触发，Agent 应判定：允许借阅。
   * 验证点：Agent 能正确识别"无阻断条件"并给出肯定结论。
   */
  it('S1: 无规则触发 → 允许借阅', async () => {
    const task = makeTask({
      goal: '评估小红是否能借《相对论导读》',
      entryEntities: ['xiao_hong', 'book_erta'],
    })

    const result = await runPredictiveAgent(task)
    const text = extractTextAnswer(result)

    // Agent 应调用 inspect_node 探索实体
    expect(hasToolCall(result, 'inspect_node')).toBe(true)
    // Agent 应给出允许的判断（文本中包含积极信号）
    expect(text).toMatch(/允许|可以借|eligible|allow/i)
    console.log('[S1] steps:', result.steps.length, 'text:', text.slice(0, 200))
  }, 120_000)

  /*
   * 场景 S2：仅借阅上限触发 → 拒绝
   *
   * 老王（无逾期、已借 3 本）申请借阅《相对论导读》（旧书）。
   * R1 borrow_limit_exceeded 触发（3 >= 3），R2/R3 不触发。
   * 验证点：Agent 能识别单一 hard_constraint 即可否决。
   */
  it('S2: 仅借阅上限触发 → 拒绝', async () => {
    const task = makeTask({
      goal: '评估老王是否能借《相对论导读》',
      entryEntities: ['lao_wang', 'book_erta'],
    })

    const result = await runPredictiveAgent(task)
    const text = extractTextAnswer(result)

    expect(hasToolCall(result, 'inspect_node')).toBe(true)
    // Agent 应识别借阅上限问题
    expect(text).toMatch(/上限|超|不能|拒绝|deny|limit|exceeded/i)
    console.log('[S2] steps:', result.steps.length, 'text:', text.slice(0, 200))
  }, 120_000)

  /*
   * 场景 S3：仅逾期规则触发 → 拒绝
   *
   * 小李（有逾期、已借 1 本）申请借阅《相对论导读》（旧书）。
   * R3 overdue_blocks_borrow 触发，R1/R2 不触发。
   * 验证点：Agent 能正确识别逾期是唯一阻断原因。
   */
  it('S3: 仅逾期阻断 → 拒绝', async () => {
    const task = makeTask({
      goal: '评估小李是否能借《相对论导读》',
      entryEntities: ['xiao_li', 'book_erta'],
    })

    const result = await runPredictiveAgent(task)
    const text = extractTextAnswer(result)

    expect(hasToolCall(result, 'inspect_node')).toBe(true)
    expect(text).toMatch(/逾期|overdue|不能|拒绝|deny/i)
    console.log('[S3] steps:', result.steps.length, 'text:', text.slice(0, 200))
  }, 120_000)

  /*
   * 场景 S4：仅新书保护期触发 → 拒绝
   *
   * 小红（无逾期、已借 0 本）申请借阅《量子力学前沿》（上架 2 天）。
   * R2 new_book_not_lendable 触发（2 < 7），R1/R3 不触发。
   * 验证点：Agent 能通过探索书籍属性发现新书保护期约束。
   */
  it('S4: 仅新书保护触发 → 拒绝', async () => {
    const task = makeTask({
      goal: '评估小红是否能借《量子力学前沿》',
      entryEntities: ['xiao_hong', 'book_quantum'],
    })

    const result = await runPredictiveAgent(task)
    const text = extractTextAnswer(result)

    expect(hasToolCall(result, 'inspect_node')).toBe(true)
    expect(text).toMatch(/新书|保护期|上架|天|new.?book|not.?lendable|拒绝|deny|不能/i)
    console.log('[S4] steps:', result.steps.length, 'text:', text.slice(0, 200))
  }, 120_000)

  /*
   * 场景 S5：双规则叠加触发 → 拒绝
   *
   * 小李（有逾期、已借 1 本）申请借阅《量子力学前沿》（上架 2 天）。
   * R2 + R3 同时触发。
   * 验证点：Agent 能识别并列举多条阻断原因。
   */
  it('S5: 逾期 + 新书双规则触发 → 拒绝', async () => {
    const task = makeTask({
      goal: '评估小李是否能借《量子力学前沿》',
      entryEntities: ['xiao_li', 'book_quantum'],
    })

    const result = await runPredictiveAgent(task)
    const text = extractTextAnswer(result)

    expect(hasToolCall(result, 'inspect_node')).toBe(true)
    // 应同时提到逾期和新书两个原因
    expect(text).toMatch(/逾期|overdue/i)
    expect(text).toMatch(/新书|保护期|上架|new.?book/i)
    console.log('[S5] steps:', result.steps.length, 'text:', text.slice(0, 200))
  }, 120_000)

  /*
   * 场景 S6：Agent 调用方法验证资格
   *
   * 验证 Agent 是否使用 call_method 调用 checkBorrowEligibility
   * 来确认小明的借阅资格状态。
   * 验证点：Agent 不仅读属性，还能主动调用实体方法获取结构化结论。
   */
  it('S6: Agent 调用 checkBorrowEligibility 方法', async () => {
    const task = makeTask({
      goal: '调用小明的 checkBorrowEligibility 方法，判断其借阅资格',
      entryEntities: ['xiao_ming'],
    })

    const result = await runPredictiveAgent(task)
    const text = extractTextAnswer(result)

    expect(hasToolCall(result, 'call_method') || hasToolCall(result, 'describe_method')).toBe(true)
    expect(text).toMatch(/eligible|资格|逾期|不能|暂停/i)
    console.log('[S6] steps:', result.steps.length, 'text:', text.slice(0, 200))
  }, 120_000)

  /*
   * 场景 S7：Agent 调用方法验证新书状态
   *
   * 验证 Agent 通过 call_method(checkNewBookStatus) 判断
   * book_ai_history 是否处于新书保护期。
   * 验证点：Agent 能将图书馆的 newBookProtectionDays (7天) 作为参数传入方法。
   */
  it('S7: Agent 调用 checkNewBookStatus 方法判断新书', async () => {
    const task = makeTask({
      goal: '判断《人工智能简史》是否处于新书保护期（不可外借）',
      entryEntities: ['book_ai_history', 'city_library'],
    })

    const result = await runPredictiveAgent(task)
    const text = extractTextAnswer(result)

    // Agent 应该至少 inspect 了 book 节点
    expect(hasToolCall(result, 'inspect_node')).toBe(true)
    // 应确认是新书
    expect(text).toMatch(/新书|保护期|3.*天|不足.*7|isNew|true/i)
    console.log('[S7] steps:', result.steps.length, 'text:', text.slice(0, 200))
  }, 120_000)

  /*
   * 场景 S8：图探索 — 通过邻居查询发现关联
   *
   * 给定 city_library 作为入口，Agent 需要通过 query_neighbors/search_nodes
   * 找到所有被管理的书籍，验证渐进式披露的有效性。
   * 验证点：Agent 不是直接获得全量数据，而是通过工具逐步探索图结构。
   */
  it('S8: 从图书馆入口探索管辖书籍', async () => {
    const task = makeTask({
      goal: '列出 city_library 管理的所有书籍',
      entryEntities: ['city_library'],
      intent: 'recommendation',
    })

    const result = await runPredictiveAgent(task)
    const text = extractTextAnswer(result)

    // Agent 应使用 query_neighbors 或 search_nodes 来发现书籍
    const usedExploration = hasToolCall(result, 'query_neighbors') || hasToolCall(result, 'search_nodes')
    expect(usedExploration).toBe(true)
    // 结果中应包含多本书
    expect(text).toMatch(/book_|飘|三体|老人与海|人工智能|人类简史|相对论|量子/i)
    console.log('[S8] steps:', result.steps.length, 'text:', text.slice(0, 300))
  }, 120_000)

  /*
   * 场景 S9：事实绑定（bind_fact）与查询（lookup_fact）
   *
   * Agent 在读取节点属性后应调用 bind_fact 将值写入 FactStore，
   * 后续步骤能通过 lookup_fact 确认已绑定。
   * 验证点：Agent 遵循 "fact-with-binding" 原则，先读后绑。
   */
  it('S9: Agent 执行 bind_fact 记录事实', async () => {
    const task = makeTask({
      goal: '收集小明的所有借阅相关事实（currentBorrowCount、hasOverdueBook），并绑定到 FactStore',
      entryEntities: ['xiao_ming'],
    })

    const result = await runPredictiveAgent(task)

    // Agent 应调用 bind_fact
    expect(hasToolCall(result, 'bind_fact')).toBe(true)
    console.log('[S9] steps:', result.steps.length, 'bind_fact calls:', result.steps.filter((s) => s.toolCalls?.some((tc) => tc.toolName === 'bind_fact')).length)
  }, 120_000)

  /*
   * 场景 S10：搜索能力 — 按类型搜索节点
   *
   * Agent 不知道具体的书籍 ID，仅知道要搜索"Reader"类型的所有实体。
   * 验证点：Agent 能使用 search_nodes(type: "Reader") 找到全部读者。
   */
  it('S10: search_nodes 按类型搜索', async () => {
    const task = makeTask({
      goal: '找到图中所有 Reader 类型的实体，列出他们的姓名和借阅状态',
      entryEntities: [],
      intent: 'recommendation',
    })

    const result = await runPredictiveAgent(task)
    const text = extractTextAnswer(result)

    expect(hasToolCall(result, 'search_nodes')).toBe(true)
    // 应找到多个读者
    expect(text).toMatch(/小明|小红|老王|小李/i)
    console.log('[S10] steps:', result.steps.length, 'text:', text.slice(0, 300))
  }, 120_000)
})
