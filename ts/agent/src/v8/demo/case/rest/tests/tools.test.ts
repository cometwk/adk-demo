import { beforeAll, describe, it } from 'vitest'
import { PipelineContext, reasoningPlugin } from '../../../../pipeline'
import { newPipelineTestContext } from '../helper'
import { Tool, ToolSet } from 'ai'
import { trace } from '../../../../../lib/trace'

describe('just test tools', () => {
  let ctx: PipelineContext
  let tools: Record<string, Tool>
  let graph_query: any

  beforeAll(async () => {
    ctx = newPipelineTestContext()
    tools = ctx.debugBuildTools(reasoningPlugin)
    console.log('init success')
    graph_query = async function (q: any) {
      const r = await tools.graph_query.execute!(q, { toolCallId: 'graph_query', messages: [] })
      trace.log('graph_query result =================================', r)
    }
  })

  it('demo', async () => {
    console.log('just test')
    const fn = tools.search_nodes.execute
    if (!fn) throw new Error('search_nodes.execute is not defined')
    const r = await fn(
      {
        type: 'Agent',
        where: [{ property: 'name', op: 'eq', value: '康传兵' }],
        fields: ['id', 'agent_no', 'name', 'contact_name'],
      },
      { toolCallId: 'search_nodes', messages: [] }
    )
    console.log('search_nodes result =================================')
    console.log(JSON.stringify(r, null, 2))
  })

  it('graph', async () => {
    const fn = tools.graph_query.execute!
    const r = await fn(
      {
        match: {
          type: 'AgentRel',
          where: [
            { property: 'apply', op: 'eq', value: 1 },
            { property: 'agent_type', op: 'eq', value: 'MERCH' },
          ],
        },
        /*
          graph_query 的 traverse 默认链式执行：
            MATCH AgentRel (_start)
            → step1 for_agent  → alias: agent   (currentAlias 变成 agent)
            → step2 for_merch  → 从 agent 出发 ❌
            所有要加上 from: '_start' 
        */
        traverse: [
          { relation: 'for_agent', direction: 'out', alias: 'agent' },
          { from: '_start', relation: 'for_merch', direction: 'out', alias: 'merch' },
        ],
        return: { alias: '_start', fields: ['agent_no', 'obj_no', 'obj_name'], limit: 200 },
      },
      { toolCallId: 'graph_query', messages: [] }
    )

    trace.log('graph_query result =================================', r)
  })

  /*
  业务意图很清晰：找「5 月没有日交易」的商户对应的 AgentRel。

  MATCH AgentRel (alias: rel)
  step1: rel ──for_merch──▶ merch
  step2: merch ──has_order_daily──▶ OrderDaily (5月有交易的)
         require: 'none'  →  过滤 merch：保留「没有」匹配 OrderDaily 的
  RETURN rel

  但是: 业务目标是「5 月无交易的 AgentRel」，
  当前引擎单次 graph_query 做不到 rel ← merch 的反查过滤，可选：
方案	说明
A. 先查 merch 再二次过滤
step2 后 return: { alias: 'merch' }，应用层或第二轮 query 关联回 rel
B. 引擎增强
支持类似 filterUpstream: 'rel' 或通过 for_merch 的 inverse 过滤
C. 自定义 binding
AgentRel:no_trade_merch:out 一次 REST 下推

 */

  it('graph test', async () => {
    await graph_query({
      match: {
        type: 'AgentRel',
        where: [
          { property: 'apply', op: 'eq', value: 1 },
          { property: 'agent_type', op: 'eq', value: 'MERCH' },
        ],
        alias: 'rel',
      },
      traverse: [
        { from: 'rel', relation: 'for_merch', direction: 'out', alias: 'merch' },
        {
          from: 'merch',
          relation: 'has_order_daily',
          direction: 'out',
          targetType: 'OrderDaily',
          where: [
            { property: 'report_date', op: 'gte', value: '2026-05-01' },
            { property: 'report_date', op: 'lte', value: '2026-05-31' },
          ],
          alias: 'no_trade',
          require: 'none',
        },
      ],
      return: { alias: 'rel', fields: ['agent_no', 'obj_no', 'obj_name'], limit: 200 },
    })
  })
})
