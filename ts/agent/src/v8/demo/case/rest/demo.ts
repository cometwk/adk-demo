import { trace } from '../../../../lib/trace'
import { ComputeQuery } from '../../../engine'
import { buildOntology } from '../../../ontology'
import { RestQueryComputeStore, RestQueryGraphStore } from '../../../provider/rest-query'
import { paymentAccessBindings } from './bindings'
import { typeRegistry } from './context'
import './ontology'

async function test() {
  const ontology = buildOntology({ version: 'restapi-1.0' })
  trace.log(
    'ontology types:',
    ontology.types.map((t) => t.name)
  )
  trace.log(
    'ontology relations:',
    ontology.relations.map((r) => `${r.fromType} --${r.type}--> ${r.toType}`)
  )

  const store = new RestQueryComputeStore(typeRegistry, ontology)

  const query: ComputeQuery = {
    source: 'OrderDaily',
    filters: [{ field: 'merch_no', op: 'eq', value: '105000059769492' }],
    metrics: [
      { field: 'total_count', fn: 'sum', as: 'total_count' },
      { field: 'total_amount', fn: 'sum', as: 'total_amount' },
    ],
    groupBy: ['report_date'],
    orderBy: [{ field: 'report_date', direction: 'desc' }],
    limit: 10,
    offset: 0,
  }

  const r = await store.aggregate(query)
  trace.log('aggregate:', r)
}

async function test2() {
  const ontology = buildOntology({ version: 'restapi-1.0' })
  trace.log(
    'ontology types:',
    ontology.types.map((t) => t.name)
  )
  trace.log(
    'ontology relations:',
    ontology.relations.map((r) => `${r.fromType} --${r.type}--> ${r.toType}`)
  )

  const provider = new RestQueryGraphStore(paymentAccessBindings, { typeRegistry })

  const agents = await provider.findNodes({ type: 'Agent', limit: 3 })
  trace.log(
    'findNodes Agent:',
    agents.items.map((n) => ({
      id: n.id,
      name: n.properties.name,
      agent_no: n.properties.agent_no,
    }))
  )

  const first = agents.items[0]
  if (!first) {
    trace.log('no agents found')
    return
  }

  const node = await provider.getNode(first.id)
  trace.log('getNode:', node?.id, node?.properties.name)

  const children = await provider.getNeighbors(first.id, {
    relation: 'children',
    direction: 'out',
    limit: 10,
  })
  trace.log(
    'children neighbors:',
    children.items.map((n) => n.nodeId)
  )

  const summary = await provider.getEdgeSummary(first.id)
  trace.log('edgeSummary:', summary)
}

test().catch(console.error)
