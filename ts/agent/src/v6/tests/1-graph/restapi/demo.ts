import axios, { AxiosResponse } from 'axios'
import { agentProperty, agentType } from '../../../runtime/decorator'
import { BaseNode } from '../../../runtime/graph'
import type { Paginated } from '../../../runtime/types'
import { jusetInitToken, SearchParams, TableData } from './axios'
import { CommonBaseNode } from './common'

// 参考 ddl/agent.sql
@agentType({ description: 'demo 代理' })
export class DemoAgent extends CommonBaseNode<Record<string, any>> {
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
  const demo = new DemoAgent({ id: 1, name: 'test' })
  const res = await demo.search()
  console.log('res = ', res)
}

test()
