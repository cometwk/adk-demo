import axios, { AxiosResponse } from 'axios'
import { agentProperty, agentType } from '../../../runtime/decorator'
import { BaseNode } from '../../../runtime/graph'
import type { Paginated } from '../../../runtime/types'
import { jusetInitToken, SearchParams, TableData } from './axios'
import { CommonBaseNode } from './common'

// ddl/agent.sql
@agentType({ description: '代理' })
export class DemoAgent extends CommonBaseNode<Record<string, any>> {
  @agentProperty({ type: 'string', description: '名称' })
  get name(): string {
    return this.o.name
  }

  constructor(o: any) {
    super(o, '/agent')
  }
}
