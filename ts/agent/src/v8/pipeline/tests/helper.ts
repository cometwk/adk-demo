// ── Pipeline Test Helper ──
// Creates test context and use-case scenarios for pipeline testing

import { newPipelineContext } from '../core/context'
import type { PipelineContext, PipelineTask, TaskPlugin } from '../core/types'
import { reasoningPlugin } from '../tasks/reasoning/index'

// ── InMemory Stores ──

export class InMemoryGraphStore {
  private nodes: Map<string, { id: string; type: string; properties: Record<string, unknown> }> = new Map()
  private edges: Array<{ from: string; to: string; type: string }> = []

  addNode(node: { id: string; type: string; properties?: Record<string, unknown> }) {
    this.nodes.set(node.id, { ...node, properties: node.properties ?? {} })
    return this
  }

  addEdge(edge: { from: string; to: string; type: string }) {
    this.edges.push(edge)
    return this
  }

  async getNode(id: string) {
    return this.nodes.get(id) ?? null
  }

  async findNodes(opts: { type?: string; limit?: number }) {
    let items = Array.from(this.nodes.values())
    if (opts.type) {
      items = items.filter((n) => n.type === opts.type)
    }
    return {
      items: items.slice(0, opts.limit ?? 20),
      page: { offset: 0, limit: opts.limit ?? 20, hasMore: false },
    }
  }

  async getNeighbors(nodeId: string) {
    const neighbors = this.edges
      .filter((e) => e.from === nodeId || e.to === nodeId)
      .map((e) => ({
        nodeId: e.from === nodeId ? e.to : e.from,
        type: this.nodes.get(e.from === nodeId ? e.to : e.from)?.type ?? 'Unknown',
        relation: e.type,
        direction: e.from === nodeId ? 'out' : 'in',
      }))
    return {
      items: neighbors,
      page: { offset: 0, limit: 20, hasMore: false },
    }
  }

  async query() {
    return { ok: true, data: { rows: [] } }
  }
}

export class InMemoryComputeStore {
  private data: Map<string, unknown[]> = new Map()

  addDataSource(name: string, rows: unknown[]) {
    this.data.set(name, rows)
    return this
  }

  async aggregate() {
    return { rows: [] }
  }
}

export class InMemoryVectorStore {
  async search() {
    return { hits: [] }
  }
}

// ── Build Test Ontology (Library Domain) ──

export function buildTestOntology(): import('../../ontology/schema').Ontology {
  return {
    version: 'test-1.0.0',
    types: [
      { name: 'Reader', description: 'Library reader', properties: [{ name: 'name', type: 'string', description: 'Reader name' }], methods: [] },
      { name: 'Book', description: 'Library book', properties: [{ name: 'title', type: 'string', description: 'Book title' }], methods: [] },
      { name: 'Branch', description: 'Library branch', properties: [{ name: 'name', type: 'string', description: 'Branch name' }], methods: [] },
      { name: 'Author', description: 'Book author', properties: [{ name: 'name', type: 'string', description: 'Author name' }], methods: [] },
      { name: 'Category', description: 'Book category', properties: [{ name: 'name', type: 'string', description: 'Category name' }], methods: [] },
      { name: 'Series', description: 'Book series', properties: [{ name: 'name', type: 'string', description: 'Series name' }], methods: [] },
    ],
    relations: [
      { type: 'borrows', fromType: 'Reader', toType: 'Book', description: 'Reader borrows book' },
      { type: 'overdue', fromType: 'Reader', toType: 'Book', description: 'Reader has overdue book' },
      { type: 'registered_at', fromType: 'Reader', toType: 'Branch', description: 'Reader registered at branch' },
      { type: 'written_by', fromType: 'Book', toType: 'Author', description: 'Book written by author' },
      { type: 'belongs_to', fromType: 'Book', toType: 'Category', description: 'Book belongs to category' },
      { type: 'available_at', fromType: 'Book', toType: 'Branch', description: 'Book available at branch' },
    ],
  }
}

// ── Build Test Rules ──

export function buildTestRules(): import('../../rule/registry/registry').RuleRegistry {
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

// ── Seed Library Data ──

export function seedLibraryData(graphStore: InMemoryGraphStore): InMemoryGraphStore {
  // Readers
  graphStore.addNode({ id: 'Reader:xiao_hong', type: 'Reader', properties: { name: '小红', membershipLevel: 'basic' } })
  graphStore.addNode({ id: 'Reader:lao_wang', type: 'Reader', properties: { name: '老王', membershipLevel: 'silver' } })
  graphStore.addNode({ id: 'Reader:xiao_li', type: 'Reader', properties: { name: '小李', membershipLevel: 'gold' } })
  graphStore.addNode({ id: 'Reader:xiao_ming', type: 'Reader', properties: { name: '小明', membershipLevel: 'gold' } })

  // Books
  graphStore.addNode({ id: 'Book:book_sapiens', type: 'Book', properties: { title: '人类简史' } })
  graphStore.addNode({ id: 'Book:book_hp3', type: 'Book', properties: { title: '哈利·波特与阿兹卡班的囚徒', daysOnShelf: 5 } })
  graphStore.addNode({ id: 'Book:book_tb1', type: 'Book', properties: { title: '三体（第一部）' } })
  graphStore.addNode({ id: 'Book:book_tb3', type: 'Book', properties: { title: '三体·死神永生', seriesVolume: 3 } })
  graphStore.addNode({ id: 'Book:book_cosmos', type: 'Book', properties: { title: '宇宙的奇迹' } })
  graphStore.addNode({ id: 'Book:book_quantum', type: 'Book', properties: { title: '量子纠缠导论', daysOnShelf: 2 } })

  // Authors
  graphStore.addNode({ id: 'Author:author_liu', type: 'Author', properties: { name: '刘慈欣' } })

  // Branches
  graphStore.addNode({ id: 'Branch:branch_west', type: 'Branch', properties: { name: '西馆', maxBorrowPerReader: 3 } })
  graphStore.addNode({ id: 'Branch:branch_central', type: 'Branch', properties: { name: '主馆', maxBorrowPerReader: 3, newBookProtectionDays: 7 } })

  // Categories
  graphStore.addNode({ id: 'Category:cat_science', type: 'Category', properties: { name: '自然科学', isRestricted: true, requiredMembershipLevel: 'gold' } })

  // Relations
  graphStore.addEdge({ from: 'Reader:xiao_hong', to: 'Branch:branch_west', type: 'registered_at' })
  graphStore.addEdge({ from: 'Reader:lao_wang', to: 'Branch:branch_central', type: 'registered_at' })
  graphStore.addEdge({ from: 'Reader:xiao_ming', to: 'Branch:branch_central', type: 'registered_at' })
  graphStore.addEdge({ from: 'Reader:xiao_li', to: 'Book:book_hp2', type: 'overdue' })
  graphStore.addEdge({ from: 'Book:book_tb1', to: 'Category:cat_science', type: 'belongs_to' })
  graphStore.addEdge({ from: 'Book:book_tb3', to: 'Category:cat_science', type: 'belongs_to' })
  graphStore.addEdge({ from: 'Book:book_sapiens', to: 'Branch:branch_west', type: 'available_at' })
  graphStore.addEdge({ from: 'Book:book_sapiens', to: 'Branch:branch_central', type: 'available_at' })
  graphStore.addEdge({ from: 'Book:book_cosmos', to: 'Branch:branch_central', type: 'available_at' })

  return graphStore
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