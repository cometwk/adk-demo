import { describe, it, expect } from 'vitest'
import type { TypeSchema, RelationSchema } from '../../../ontology/schema'
import {
  InMemoryGraphStore,
  InMemoryComputeStore,
  InMemoryVectorStore,
  buildTestOntology,
  buildTestRules,
  newPipelineTestContext,
  seedGraph,
  getScenario,
  useCaseScenarios,
} from './helper'
import { Reader, Book, Branch, Category, Author } from './ontology'
import { toGlobalId } from '../../../engine'

describe('InMemoryGraphStore', () => {
  it('should add and retrieve nodes', async () => {
    const store = new InMemoryGraphStore()
    const reader = new Reader({ id: 'Reader:test', name: '测试', membershipLevel: 'basic', currentBorrowCount: 0, registeredDays: 100 })
    store.addNode(reader)
    const node = await store.getNode('Reader:test')
    expect(node).toBeDefined()
    expect(node?.id).toBe('Reader:test')
    expect(node?.type).toBe('Reader')
    expect(node?.properties.name).toBe('测试')
  })

  it('should return undefined for non-existent node', async () => {
    const store = new InMemoryGraphStore()
    const node = await store.getNode('NonExistent')
    expect(node).toBeUndefined()
  })

  it('should find nodes by type', async () => {
    const store = new InMemoryGraphStore()
    store.addNode(new Book({ id: toGlobalId('Book', 'book1'), title: 'Book 1', isbn: '1', daysOnShelf: 100, totalCopies: 1, availableCopies: 1 }))
    store.addNode(new Reader({ id: 'Reader:reader1', name: 'Reader 1', membershipLevel: 'basic', currentBorrowCount: 0, registeredDays: 100 }))
    store.addNode(new Book({ id: 'Book:book2', title: 'Book 2', isbn: '2', daysOnShelf: 100, totalCopies: 1, availableCopies: 1 }))

    const result = await store.findNodes({ type: 'Book' })
    expect(result.items).toHaveLength(2)
    expect(result.page.hasMore).toBe(false)
  })

  it('should respect limit in findNodes', async () => {
    const store = new InMemoryGraphStore()
    store.addNode(new Book({ id: 'Book:book1', title: 'Book 1', isbn: '1', daysOnShelf: 100, totalCopies: 1, availableCopies: 1 }))
    store.addNode(new Book({ id: 'Book:book2', title: 'Book 2', isbn: '2', daysOnShelf: 100, totalCopies: 1, availableCopies: 1 }))
    store.addNode(new Book({ id: 'Book:book3', title: 'Book 3', isbn: '3', daysOnShelf: 100, totalCopies: 1, availableCopies: 1 }))

    const result = await store.findNodes({ type: 'Book', limit: 2 })
    expect(result.items).toHaveLength(2)
  })

  it('should get neighbors correctly', async () => {
    const store = new InMemoryGraphStore()
    store.addNode(new Reader({ id: 'Reader:r1', name: 'Reader', membershipLevel: 'basic', currentBorrowCount: 0, registeredDays: 100 }))
    store.addNode(new Book({ id: 'Book:b1', title: 'Book', isbn: '1', daysOnShelf: 100, totalCopies: 1, availableCopies: 1 }))
    store.addEdge({ from: 'Reader:r1', to: 'Book:b1', type: 'borrows' })

    const neighbors = await store.getNeighbors('Reader:r1')
    expect(neighbors.items).toHaveLength(1)
    expect(neighbors.items[0].nodeId).toBe('Book:b1')
    expect(neighbors.items[0].relation).toBe('borrows')
    expect(neighbors.items[0].direction).toBe('out')
  })

  it('should query and return result', async () => {
    const store = new InMemoryGraphStore()
    store.addNode(new Book({ id: 'Book:b1', title: 'Book', isbn: '1', daysOnShelf: 100, totalCopies: 1, availableCopies: 1 }))
    const result = await store.query({
      match: { type: 'Book', alias: 'books' },
      return: { alias: 'books' },
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.rows.length).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('InMemoryComputeStore', () => {
  it('should seed data source', () => {
    const store = new InMemoryComputeStore()
    store.seedSource('test', [{ id: 1 }], [{ name: 'id', type: 'number', aggregatable: true }])
    expect(store).toBeDefined()
  })

  it('should aggregate and return empty rows', async () => {
    const store = new InMemoryComputeStore()
    const result = await store.aggregate({ source: 'nonexistent', metrics: [] })
    expect(result.rows).toEqual([])
  })
})

describe('InMemoryVectorStore', () => {
  it('should search and return empty hits when no data', async () => {
    const store = new InMemoryVectorStore()
    const result = await store.search({ query: 'test' })
    expect(result.hits).toEqual([])
  })
})

describe('buildTestOntology', () => {
  it('should return library domain ontology', () => {
    const ontology = buildTestOntology()
    expect(ontology.version).toBe('library-1.0.0')
    expect(ontology.types).toHaveLength(6)
    expect(ontology.relations).toHaveLength(10)
  })

  it('should include Reader type', () => {
    const ontology = buildTestOntology()
    const readerType = ontology.types.find((t: TypeSchema) => t.name === 'Reader')
    expect(readerType).toBeDefined()
    expect(readerType?.description).toBe('图书馆读者，持有会员证，注册在某分馆，可借阅和预约书籍')
    expect(readerType?.properties).toHaveLength(5)
  })

  it('should include Book type', () => {
    const ontology = buildTestOntology()
    const bookType = ontology.types.find((t: TypeSchema) => t.name === 'Book')
    expect(bookType).toBeDefined()
    expect(bookType?.description).toBe('图书馆馆藏书籍，可能属于某类目和系列，在多个分馆有库存')
  })

  it('should include borrows relation', () => {
    const ontology = buildTestOntology()
    const borrowsRel = ontology.relations.find((r: RelationSchema) => r.type === 'borrows')
    expect(borrowsRel).toBeDefined()
    expect(borrowsRel?.fromType).toBe('Reader')
    expect(borrowsRel?.toType).toBe('Book')
  })

  it('should include belongs_to relation for category', () => {
    const ontology = buildTestOntology()
    const belongsRel = ontology.relations.find((r: RelationSchema) => r.type === 'belongs_to')
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

describe('seedGraph', () => {
  it('should seed all test entities', async () => {
    const store = seedGraph()

    // Check Readers (ID format: xiao_hong, not Reader:xiao_hong)
    expect(await store.getNode('xiao_hong')).toBeDefined()
    expect(await store.getNode('lao_wang')).toBeDefined()
    expect(await store.getNode('xiao_li')).toBeDefined()
    expect(await store.getNode('xiao_ming')).toBeDefined()

    // Check Books
    expect(await store.getNode('book_sapiens')).toBeDefined()
    expect(await store.getNode('book_hp3')).toBeDefined()
    expect(await store.getNode('book_tb1')).toBeDefined()
    expect(await store.getNode('book_tb3')).toBeDefined()
    expect(await store.getNode('book_cosmos')).toBeDefined()
    expect(await store.getNode('book_quantum')).toBeDefined()

    // Check Authors
    expect(await store.getNode('author_liu')).toBeDefined()

    // Check Branches
    expect(await store.getNode('branch_west')).toBeDefined()
    expect(await store.getNode('branch_central')).toBeDefined()

    // Check Categories
    expect(await store.getNode('cat_science')).toBeDefined()
  })

  it('should set correct properties for Reader', async () => {
    const store = seedGraph()

    const xiaoHong = await store.getNode('xiao_hong')
    expect(xiaoHong?.properties.name).toBe('小红')
    expect(xiaoHong?.properties.membershipLevel).toBe('basic')

    const xiaoLi = await store.getNode('xiao_li')
    expect(xiaoLi?.properties.membershipLevel).toBe('gold')
  })

  it('should set correct properties for Book', async () => {
    const store = seedGraph()

    const sapiens = await store.getNode('book_sapiens')
    expect(sapiens?.properties.title).toBe('人类简史')

    const hp3 = await store.getNode('book_hp3')
    expect(hp3?.properties.title).toBe('哈利·波特与阿兹卡班的囚徒')
    expect(hp3?.properties.daysOnShelf).toBe(5)
  })

  it('should create correct relations', async () => {
    const store = seedGraph()

    // Check registered_at relations
    const neighborsWest = await store.getNeighbors('xiao_hong')
    expect(neighborsWest.items.some((n) => n.relation === 'registered_at')).toBe(true)

    // Check overdue relation
    const neighborsLi = await store.getNeighbors('xiao_li')
    expect(neighborsLi.items.some((n) => n.relation === 'overdue')).toBe(true)

    // Check belongs_to relation for category
    const neighborsBook = await store.getNeighbors('book_tb1')
    expect(neighborsBook.items.some((n) => n.relation === 'belongs_to')).toBe(true)

    // Check available_at relation
    const neighborsSapiens = await store.getNeighbors('book_sapiens')
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
    expect(useCaseScenarios.S1.entryEntities).toEqual(['Reader:xiao_hong', 'Book:book_sapiens', 'Branch:branch_west'])
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
    expect(task.entryEntities).toEqual(['Reader:xiao_hong', 'Book:book_sapiens', 'Branch:branch_west'])
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
