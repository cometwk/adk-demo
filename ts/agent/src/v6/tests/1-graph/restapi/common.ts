import axios from 'axios'
import { agentProperty, agentType } from '../../../runtime/decorator'
import { BaseNode } from '../../../runtime/graph'
import type { Paginated } from '../../../runtime/types'
import type { SearchParams, TableData } from '../../../provider/rest'

export class CommonBaseNode<T> extends BaseNode {
  constructor(
    protected o: any,
    private prefix: string
  ) {
    super(String(o.id))
  }

  /**
   * 按条件查询，返回带有分页信息和记录数组
   * @param query - 查询参数 参考文档 ./query.md
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

/** @deprecated 使用 RestCrudGraphStore；保留用于直接调用 search API */
@agentType({ description: '测试' })
export class Demo extends CommonBaseNode<Record<string, unknown>> {
  @agentProperty({ type: 'string', description: '名称' })
  get name(): string {
    return String(this.o.name ?? '')
  }

  constructor(o: Record<string, unknown>) {
    super(o, '/agent')
  }
}
