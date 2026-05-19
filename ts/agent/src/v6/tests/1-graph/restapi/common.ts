import axios, { AxiosResponse } from 'axios'
import { agentProperty, agentType } from '../../../runtime/decorator'
import { BaseNode } from '../../../runtime/graph'
import type { Paginated } from '../../../runtime/types'
import { jusetInitToken, SearchParams, TableData } from './axios'

export class CommonBaseNode<T> extends BaseNode {
  constructor(
    protected o: any,
    private prefix: string
  ) {
    super(String(o.id))
  }

  /**
   * 按条件查询，返回带有分页信息和记录数组
   */
  async search(query?: SearchParams): Promise<Paginated<T>> {
    const r = (await axios.get(`/admin${this.prefix}/search`, { params: query })) as TableData<T>
    return {
      items: r.data,
      page: {
        offset: r.page,
        limit: r.pagesize,
        hasMore: r.total > r.page * r.pagesize,
      },
    }
  }
}

@agentType({ description: '测试' })
export class Demo extends CommonBaseNode<Record<string, any>> {
  @agentProperty({ type: 'string', description: '名称' })
  get name(): string {
    return this.o.name
  }

  constructor(o: any) {
    super(o, '/agent')
  }
}

async function test() {
  await jusetInitToken()
  console.log('jusetInitToken success')
  const demo = new Demo({ id: 1, name: 'test' })
  const res = await demo.search()
  console.log('res = ', res)
}

test()
