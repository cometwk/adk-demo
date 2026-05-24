// ── Pipeline Test Helper ──
// Creates test context and use-case scenarios for pipeline testing

import { newPipelineContext, PipelineContext, type PipelineTask } from '../../../pipeline'
import { buildOntology, type Ontology  } from '../../../ontology'

// ── Import InMemory Stores from Provider ──
import { InMemoryComputeStore, InMemoryGraphStore, InMemoryVectorStore } from '../../../provider/in-memory/index'

// ── Import seedGraph from seed.ts ──
import { seedGraph } from './seed'
import { RuleRegistry } from '../../../rule'

// Re-export for test usage
export { InMemoryComputeStore, InMemoryGraphStore, InMemoryVectorStore, seedGraph }

// ── Build Test Ontology (Library Domain) ──

export function buildTestOntology(): Ontology {
  // return {
  //   version: 'test-1.0.0',
  //   types: [
  //     { name: 'Reader', description: 'Library reader', properties: [{ name: 'name', type: 'string', description: 'Reader name' }], methods: [] },
  //     { name: 'Book', description: 'Library book', properties: [{ name: 'title', type: 'string', description: 'Book title' }], methods: [] },
  //     { name: 'Branch', description: 'Library branch', properties: [{ name: 'name', type: 'string', description: 'Branch name' }], methods: [] },
  //     { name: 'Author', description: 'Book author', properties: [{ name: 'name', type: 'string', description: 'Author name' }], methods: [] },
  //     { name: 'Category', description: 'Book category', properties: [{ name: 'name', type: 'string', description: 'Category name' }], methods: [] },
  //     { name: 'Series', description: 'Book series', properties: [{ name: 'name', type: 'string', description: 'Series name' }], methods: [] },
  //   ],
  //   relations: [
  //     { type: 'borrows', fromType: 'Reader', toType: 'Book', description: 'Reader borrows book' },
  //     { type: 'overdue', fromType: 'Reader', toType: 'Book', description: 'Reader has overdue book' },
  //     { type: 'registered_at', fromType: 'Reader', toType: 'Branch', description: 'Reader registered at branch' },
  //     { type: 'written_by', fromType: 'Book', toType: 'Author', description: 'Book written by author' },
  //     { type: 'belongs_to', fromType: 'Book', toType: 'Category', description: 'Book belongs to category' },
  //     { type: 'available_at', fromType: 'Book', toType: 'Branch', description: 'Book available at branch' },
  //   ],
  // }
  return buildOntology({ version: 'library-1.0.0' })
}

// ── Build Test Rules ──

export function buildTestRules(): RuleRegistry {
  return {
    register: () => {},
    get: () => undefined,
    resolve: () => [],
    list: () => [],
    clear: () => {},
  } as any
}

// ── Create Test Context ──

export function newPipelineTestContext(): PipelineContext {
  const graphStore = new InMemoryGraphStore()
  const computeStore = new InMemoryComputeStore()
  const vectorStore = new InMemoryVectorStore()
  const ontology = buildTestOntology()
  const ruleRegistry = buildTestRules()

  return newPipelineContext({
    graphStore: graphStore as any,
    computeStore: computeStore as any,
    vectorStore: vectorStore as any,
    ontology,
    ruleRegistry,
  })
}

// ── Use-Case Scenarios (from src/ex/use-case.ts) ──

export type UseCaseScenario = {
  taskId: string
  goal: string
  entryEntities: string[]
  intent?: string
}

export const useCaseScenarios: Record<string, UseCaseScenario> = {
  S0: {
    taskId: 'S0',
    goal: '哪些读者最活跃？',
    entryEntities: [],
  },
  S1: {
    taskId: 'S1',
    goal: '评估小红是否能从西馆借阅《人类简史》',
    entryEntities: ['Reader:xiao_hong', 'Book:book_sapiens', 'Branch:branch_west'],
  },
  S2: {
    taskId: 'S2',
    goal: '评估老王是否能从主馆借阅《人类简史》',
    entryEntities: ['Reader:lao_wang', 'Book:book_sapiens', 'Branch:branch_central'],
  },
  S3: {
    taskId: 'S3',
    goal: '评估小李是否能借阅《人类简史》，需检查是否有逾期书籍',
    entryEntities: ['Reader:xiao_li', 'Book:book_sapiens'],
  },
  S4: {
    taskId: 'S4',
    goal: '评估小红是否能借阅《三体（第一部）》，需检查类目限制和会员等级',
    entryEntities: ['Reader:xiao_hong', 'Book:book_tb1'],
  },
  S5: {
    taskId: 'S5',
    goal: '评估小明是否能借阅《哈利·波特》，需结合分馆保护期规则',
    entryEntities: ['Reader:xiao_ming', 'Book:book_hp3', 'Branch:branch_central'],
  },
  S6: {
    taskId: 'S6',
    goal: '判断小明是否可以借阅《三体·死神永生》',
    entryEntities: ['Reader:xiao_ming', 'Book:book_tb3'],
  },
  S7: {
    taskId: 'S7',
    goal: '评估小红是否能借阅《宇宙的奇迹》，需检查是否有馆际互借方案',
    entryEntities: ['Reader:xiao_hong', 'Book:book_cosmos', 'Branch:branch_west'],
  },
  S8: {
    taskId: 'S8',
    goal: '判断刘慈欣是否为热门作者',
    entryEntities: ['Author:author_liu'],
    intent: 'recommendation',
  },
  S9: {
    taskId: 'S9',
    goal: '统计《哈利·波特》当前预约人数',
    entryEntities: ['Book:book_hp3'],
    intent: 'recommendation',
  },
  S10: {
    taskId: 'S10',
    goal: '评估小红是否能借阅《量子纠缠导论》，需全面检查所有借阅约束',
    entryEntities: ['Reader:xiao_hong', 'Book:book_quantum', 'Branch:branch_west'],
  },
}

// ── Run Use-Case Scenario ──

export function getScenario(scenarioId: string): PipelineTask {
  const scenario = useCaseScenarios[scenarioId]
  if (!scenario) {
    throw new Error(`Unknown scenario: ${scenarioId}`)
  }
  return {
    type: 'reasoning',
    goal: scenario.goal,
    entryEntities: scenario.entryEntities,
    intent: scenario.intent,
  }
}