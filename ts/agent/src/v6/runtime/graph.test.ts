import { describe, it, expect } from 'vitest'
import { Graph, BaseNode } from './graph'
import { agentProperty } from './decorator'

class Book extends BaseNode {
  @agentProperty({ type: 'string', description: '书名', agentVisible: true })
  title: string

  constructor(id: string, title: string) {
    super(id)
    this.title = title
  }
}

class Reader extends BaseNode {
  @agentProperty({ type: 'string', description: '读者姓名', agentVisible: true })
  name: string

  constructor(id: string, name: string) {
    super(id)
    this.name = name
  }
}

class Library extends BaseNode {
  constructor(id: string) {
    super(id)
  }
}

describe('Graph.searchNodes', () => {
  it('全局搜索：返回所有节点', () => {
    const g = new Graph()
    g.addNode(new Book('book_three_body', '三体'))
    g.addNode(new Reader('xiao_ming', '小明'))

    const result = g.searchNodes({})
    expect(result.items.length).toBe(2)
    expect(result.items.find(n => n.nodeId === 'book_three_body')).toBeDefined()
    expect(result.items.find(n => n.nodeId === 'xiao_ming')).toBeDefined()
  })

  it('全局搜索 + type 过滤', () => {
    const g = new Graph()
    g.addNode(new Book('book_three_body', '三体'))
    g.addNode(new Reader('xiao_ming', '小明'))

    const result = g.searchNodes({ type: 'Book' })
    expect(result.items.length).toBe(1)
    expect(result.items[0].nodeId).toBe('book_three_body')
    expect(result.items[0].type).toBe('Book')
  })

  it('relatedTo：返回邻居节点，含 relation 和 direction', () => {
    const g = new Graph()
    g.addNode(new Book('book_three_body', '三体'))
    g.addNode(new Book('book_gone_with_wind', '飘'))
    g.addNode(new Reader('xiao_ming', '小明'))

    g.addEdge({ from: 'xiao_ming', to: 'book_three_body', type: 'borrows' })
    g.addEdge({ from: 'xiao_ming', to: 'book_gone_with_wind', type: 'borrows' })

    const result = g.searchNodes({ relatedTo: 'xiao_ming' })
    expect(result.items.length).toBe(2)

    const book1 = result.items.find(n => n.nodeId === 'book_three_body')
    expect(book1).toBeDefined()
    expect(book1!.relation).toBe('borrows')
    expect(book1!.direction).toBe('out')

    const book2 = result.items.find(n => n.nodeId === 'book_gone_with_wind')
    expect(book2).toBeDefined()
    expect(book2!.relation).toBe('borrows')
    expect(book2!.direction).toBe('out')
  })

  it('relatedTo + type：过滤邻居类型', () => {
    const g = new Graph()
    g.addNode(new Book('book_three_body', '三体'))
    g.addNode(new Library('city_library'))
    g.addNode(new Reader('xiao_ming', '小明'))

    g.addEdge({ from: 'xiao_ming', to: 'book_three_body', type: 'borrows' })
    g.addEdge({ from: 'xiao_ming', to: 'city_library', type: 'visits' })

    const result = g.searchNodes({ relatedTo: 'xiao_ming', type: 'Book' })
    expect(result.items.length).toBe(1)
    expect(result.items[0].nodeId).toBe('book_three_body')
  })

  it('relatedTo：in 方向邻居（反向边）', () => {
    const g = new Graph()
    g.addNode(new Book('book_three_body', '三体'))
    g.addNode(new Library('city_library'))

    g.addEdge({ from: 'book_three_body', to: 'city_library', type: 'managed_by' })

    // 从 Library 视角搜索，应返回 Book（direction: 'in')
    const result = g.searchNodes({ relatedTo: 'city_library' })
    expect(result.items.length).toBe(1)
    expect(result.items[0].nodeId).toBe('book_three_body')
    expect(result.items[0].relation).toBe('managed_by')
    expect(result.items[0].direction).toBe('in')
  })

  it('全局搜索结果不含 relation/direction 字段', () => {
    const g = new Graph()
    g.addNode(new Book('book_three_body', '三体'))

    const result = g.searchNodes({})
    expect(result.items[0].relation).toBeUndefined()
    expect(result.items[0].direction).toBeUndefined()
  })

  it('query 匹配 agentVisible 属性内容（全局搜索）', () => {
    const g = new Graph()
    g.addNode(new Book('book_1', '三体'))
    g.addNode(new Book('book_2', '红楼梦'))

    const result = g.searchNodes({ query: '三体' })
    expect(result.items.length).toBe(1)
    expect(result.items[0].nodeId).toBe('book_1')
  })

  it('query 匹配 agentVisible 属性内容（relatedTo 搜索）', () => {
    const g = new Graph()
    g.addNode(new Book('book_three_body', '三体'))
    g.addNode(new Book('book_gone_with_wind', '飘'))
    g.addNode(new Reader('xiao_ming', '小明'))

    g.addEdge({ from: 'xiao_ming', to: 'book_three_body', type: 'borrows' })
    g.addEdge({ from: 'xiao_ming', to: 'book_gone_with_wind', type: 'borrows' })

    const result = g.searchNodes({ relatedTo: 'xiao_ming', query: '三体' })
    expect(result.items.length).toBe(1)
    expect(result.items[0].nodeId).toBe('book_three_body')
  })
})