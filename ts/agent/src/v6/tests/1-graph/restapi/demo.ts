import { setInitToken } from './axios'
import { buildOntology } from '../../../runtime/ontology-builder'
import { RestCrudGraphStore } from './RestCrudGraph'
import { parseGlobalId, toGlobalId } from './search-helpers'
import './ontology'

async function test() {
  await setInitToken()
  console.log('jusetInitToken success')

  const ontology = buildOntology({ version: 'restapi-1.0' })
  console.log(
    'ontology types:',
    ontology.types.map((t) => t.name),
  )
  console.log(
    'ontology relations:',
    ontology.relations.map((r) => `${r.fromType} --${r.type}--> ${r.toType}`),
  )

  const store = new RestCrudGraphStore({ relations: ontology.relations })
  const x = await store.findNodes({ type: 'AgentRel', limit: 3 })
  console.log("x=", x)
  process.exit(0)

  const agents = await store.findNodes({ type: 'Agent', limit: 3 })
  console.log(
    'findNodes Agent:',
    agents.items.map((n) => ({ id: n.id, name: n.properties.name, agent_no: n.properties.agent_no })),
  )

  const first = agents.items[0]
  if (!first) {
    console.log('no agents found')
    return
  }

  const node = await store.getNode(first.id)
  console.log('getNode:', node?.id, node?.properties.name)

  const children = await store.getNeighbors(first.id, { relation: 'child_of', direction: 'out', limit: 10 })
  console.log(
    'child_of neighbors:',
    children.items.map((n) => n.nodeId),
  )

  const summary = await store.getEdgeSummary(first.id)
  console.log('edgeSummary:', summary)

  // 全局 id 示例
  console.log('global id:', toGlobalId('Agent', parseGlobalId(first.id).rawId))
}

test().catch(console.error)
