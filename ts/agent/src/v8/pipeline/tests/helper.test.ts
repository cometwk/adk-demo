import { describe, it, expect } from 'vitest'
import {
  InMemoryGraphStore,
  InMemoryComputeStore,
  InMemoryVectorStore,
  buildTestOntology,
  buildTestRules,
  newPipelineTestContext,
  seedLibraryData,
  getScenario,
  useCaseScenarios,
} from './helper'

describe('InMemoryGraphStore', () => {
  it('should add and retrieve nodes', async () => {
    const store = new InMemoryGraphStore()
    store.addNode({ id: 'Test:test', type: 'Test', properties: { name: '测试' } })
    const node = await store.getNode('Test:test')
    expect(node).toBeDefined()
    expect(node?.id).toBe('Test:test')
    expect(node?.type).toBe('Test')
    expect(node?.properties.name).toBe('测试')
  })

  it('should return null for non-existent node', async () => {
    const store = new InMemoryGraphStore()
    const node = await store.getNode('NonExistent')
    expect(node).toBeNull()
  })

  it('should find nodes by type', async () => {
    const store = new InMemoryGraphStore()
    store.addNode({ id: 'Book:book1', type: 'Book' })
    store.addNode({ id: 'Reader:reader1', type: 'Reader' })
    store.addNode({ id: 'Book:book2', type: 'Book' })

    const result = await store.findNodes({ type: 'Book' })
    expect(result.items).toHaveLength(2)
    expect(result.page.hasMore).toBe(false)
  })

  it('should respect limit in findNodes', async () => {
    const store = new InMemoryGraphStore()
    store.addNode({ id: 'Book:book1', type: 'Book' })
    store.addNode({ id: 'Book:book2', type: 'Book' })
    store.addNode({ id: 'Book:book3', type: 'Book' })

    const result = await store.findNodes({ type: 'Book', limit: 2 })
    expect(result.items).toHaveLength(2)
  })

  it('should get neighbors correctly', async () => {
    const store = new InMemoryGraphStore()
    store.addNode({ id: 'Reader:r1', type: 'Reader' })
    store.addNode({ id: 'Book:b1', type: 'Book' })
    store.addEdge({ from: 'Reader:r1', to: 'Book:b1', type: 'borrows' })

    const neighbors = await store.getNeighbors('Reader:r1')
    expect(neighbors.items).toHaveLength(1)
    expect(neighbors.items[0].nodeId).toBe('Book:b1')
    expect(neighbors.items[0].relation).toBe('borrows')
    expect(neighbors.items[0].direction).toBe('out')
  })

  it('should query and return empty rows', async () => {
    const store = new InMemoryGraphStore()
    const result = await store.query()
    expect(result.ok).toBe(true)
    expect(result.data.rows).toEqual([])
  })
})

describe('InMemoryComputeStore', () => {
  it('should add data source', () => {
    const store = new InMemoryComputeStore()
    store.addDataSource('test', [{ id: 1 }])
    expect(store).toBeDefined()
  })

  it('should aggregate and return empty rows', async () => {
    const store = new InMemoryComputeStore()
    const result = await store.aggregate()
    expect(result.rows).toEqual([])
  })
})

describe('InMemoryVectorStore', () => {
  it('should search and return empty hits', async () => {
    const store = new InMemoryVectorStore()
    const result = await store.search()
    expect(result.hits).toEqual([])
  })
})

describe('buildTestOntology', () => {
  it('should return library domain ontology', () => {
    const ontology = buildTestOntology()
    expect(ontology.version).toBe('test-1.0.0')
    expect(ontology.types).toHaveLength(6)
    expect(ontology.relations).toHaveLength(6)
  })

  it('should include Reader type', () => {
    const ontology = buildTestOntology()
    const readerType = ontology.types.find((t) => t.name === 'Reader')
    expect(readerType).toBeDefined()
    expect(readerType?.description).toBe('Library reader')
    expect(readerType?.properties).toHaveLength(1)
  })

  it('should include Book type', () => {
    const ontology = buildTestOntology()
    const bookType = ontology.types.find((t) => t.name === 'Book')
    expect(bookType).toBeDefined()
    expect(bookType?.description).toBe('Library book')
  })

  it('should include borrows relation', () => {
    const ontology = buildTestOntology()
    const borrowsRel = ontology.relations.find((r) => r.type === 'borrows')
    expect(borrowsRel).toBeDefined()
    expect(borrowsRel?.fromType).toBe('Reader')
    expect(borrowsRel?.toType).toBe('Book')
  })

  it('should include belongs_to relation for category', () => {
    const ontology = buildTestOntology()
    const belongsRel = ontology.relations.find((r) => r.type === 'belongs_to')
    expect(belongsRel).toBeDefined()
    expect(belongsRel?.fromType).toBe('Book')
    expect(belongsRel?.toType).toBe('Category')
  })
})

describe('buildTestRules', () => {
  it('should return minimal rule registry', () => {
    const registry = buildTestRules()
    expect(registry.register).toBeDefined()
    expect(registry.get).toBeDefined()
    expect(registry.resolve).toBeDefined()
    expect(registry.list).toBeDefined()
    expect(registry.clear).toBeDefined()
  })

  it('should return empty list from list()', () => {
    const registry = buildTestRules()
    expect(registry.list()).toEqual([])
  })

  it('should return undefined from get()', () => {
    const registry = buildTestRules()
    expect(registry.get('any-id')).toBeUndefined()
  })
})

describe('newPipelineTestContext', () => {
  it('should create context with all stores', () => {
    const ctx = newPipelineTestContext()
    expect(ctx.registry).toBeDefined()
    expect(ctx.registry.list()).toContain('reasoning')
  })
})

describe('seedLibraryData', () => {
  it('should seed all test entities', () => {
    const store = new InMemoryGraphStore()
    seedLibraryData(store)

    // Check Readers
    expect(store.getNode('Reader:xiao_hong')).resolves.toBeDefined()
    expect(store.getNode('Reader:lao_wang')).resolves.toBeDefined()
    expect(store.getNode('Reader:xiao_li')).resolves.toBeDefined()
    expect(store.getNode('Reader:xiao_ming')).resolves.toBeDefined()

    // Check Books
    expect(store.getNode('Book:book_sapiens')).resolves.toBeDefined()
    expect(store.getNode('Book:book_hp3')).resolves.toBeDefined()
    expect(store.getNode('Book:book_tb1')).resolves.toBeDefined()
    expect(store.getNode('Book:book_tb3')).resolves.toBeDefined()
    expect(store.getNode('Book:book_cosmos')).resolves.toBeDefined()
    expect(store.getNode('Book:book_quantum')).resolves.toBeDefined()

    // Check Authors
    expect(store.getNode('Author:author_liu')).resolves.toBeDefined()

    // Check Branches
    expect(store.getNode('Branch:branch_west')).resolves.toBeDefined()
    expect(store.getNode('Branch:branch_central')).resolves.toBeDefined()

    // Check Categories
    expect(store.getNode('Category:cat_science')).resolves.toBeDefined()
  })

  it('should set correct properties for Reader', async () => {
    const store = new InMemoryGraphStore()
    seedLibraryData(store)

    const xiaoHong = await store.getNode('Reader:xiao_hong')
    expect(xiaoHong?.properties.name).toBe('小红')
    expect(xiaoHong?.properties.membershipLevel).toBe('basic')

    const xiaoLi = await store.getNode('Reader:xiao_li')
    expect(xiaoLi?.properties.membershipLevel).toBe('gold')
  })

  it('should set correct properties for Book', async () => {
    const store = new InMemoryGraphStore()
    seedLibraryData(store)

    const sapiens = await store.getNode('Book:book_sapiens')
    expect(sapiens?.properties.title).toBe('人类简史')

    const hp3 = await store.getNode('Book:book_hp3')
    expect(hp3?.properties.title).toBe('哈利·波特与阿兹卡班的囚徒')
    expect(hp3?.properties.daysOnShelf).toBe(5)
  })

  it('should create correct relations', async () => {
    const store = new InMemoryGraphStore()
    seedLibraryData(store)

    // Check registered_at relations
    const neighborsWest = await store.getNeighbors('Reader:xiao_hong')
    expect(neighborsWest.items.some((n) => n.relation === 'registered_at')).toBe(true)

    // Check overdue relation
    const neighborsLi = await store.getNeighbors('Reader:xiao_li')
    expect(neighborsLi.items.some((n) => n.relation === 'overdue')).toBe(true)

    // Check belongs_to relation for category
    const neighborsBook = await store.getNeighbors('Book:book_tb1')
    expect(neighborsBook.items.some((n) => n.relation === 'belongs_to')).toBe(true)

    // Check available_at relation
    const neighborsSapiens = await store.getNeighbors('Book:book_sapiens')
    expect(neighborsSapiens.items.some((n) => n.relation === 'available_at')).toBe(true)
  })
})

describe('useCaseScenarios', () => {
  it('should have all S0-S10 scenarios', () => {
    const ids = Object.keys(useCaseScenarios)
    expect(ids).toContain('S0')
    expect(ids).toContain('S1')
    expect(ids).toContain('S2')
    expect(ids).toContain('S3')
    expect(ids).toContain('S4')
    expect(ids).toContain('S5')
    expect(ids).toContain('S6')
    expect(ids).toContain('S7')
    expect(ids).toContain('S8')
    expect(ids).toContain('S9')
    expect(ids).toContain('S10')
    expect(ids).toHaveLength(11)
  })

  it('should have correct goal for S1', () => {
    expect(useCaseScenarios.S1.goal).toBe('评估小红是否能从西馆借阅《人类简史》')
    expect(useCaseScenarios.S1.entryEntities).toEqual([
      'Reader:xiao_hong',
      'Book:book_sapiens',
      'Branch:branch_west',
    ])
  })

  it('should have correct goal for S4 (category restriction)', () => {
    expect(useCaseScenarios.S4.goal).toBe('评估小红是否能借阅《三体（第一部）》，需检查类目限制和会员等级')
    expect(useCaseScenarios.S4.entryEntities).toEqual(['Reader:xiao_hong', 'Book:book_tb1'])
  })

  it('should have intent for S8 and S9', () => {
    expect(useCaseScenarios.S8.intent).toBe('recommendation')
    expect(useCaseScenarios.S9.intent).toBe('recommendation')
  })
})

describe('getScenario', () => {
  it('should return PipelineTask for valid scenario', () => {
    const task = getScenario('S1')
    expect(task.type).toBe('reasoning')
    expect(task.goal).toBe('评估小红是否能从西馆借阅《人类简史》')
    expect(task.entryEntities).toEqual([
      'Reader:xiao_hong',
      'Book:book_sapiens',
      'Branch:branch_west',
    ])
  })

  it('should throw for unknown scenario', () => {
    expect(() => getScenario('S99')).toThrow('Unknown scenario: S99')
  })

  it('should return task with intent when specified', () => {
    const task = getScenario('S8')
    expect(task.intent).toBe('recommendation')
  })

  it('should return task without intent when not specified', () => {
    const task = getScenario('S1')
    expect(task.intent).toBeUndefined()
  })
})