import { buildOntology, type Ontology } from '../../../ontology'
import { newPipelineContext, PipelineContext } from '../../../pipeline'
import { InMemoryComputeStore, InMemoryVectorStore } from '../../../provider/in-memory/index'
import { RestQueryComputeStore, RestQueryGraphStore } from '../../../provider/rest-query'
import { RuleRegistry } from '../../../rule'
import { paymentAccessBindings } from './bindings'
import { paymentAccessContext, typeRegistry } from './context'

// ── Build Test Ontology (Payment Domain) ──

export function buildTestOntology(): Ontology {
  return buildOntology({ version: 'payment-1.0.0' })
}

// ── Build Test Rules ──

export function buildTestRules(): RuleRegistry {
  return {
    register: () => {},
    get: () => undefined,
    resolve: () => [],
    list: () => [],
    clear: () => {},
  } as any
}

// ── Create Test Context ──

export function newPipelineTestContext(): PipelineContext {
  const ontology = buildTestOntology()
  const ruleRegistry = buildTestRules()

  const graphStore = new RestQueryGraphStore(paymentAccessBindings, paymentAccessContext)
  const computeStore = new RestQueryComputeStore(typeRegistry, ontology)
  const vectorStore = new InMemoryVectorStore()

  return newPipelineContext({
    graphStore: graphStore as any,
    computeStore: computeStore as any,
    vectorStore: vectorStore as any,
    ontology,
    ruleRegistry,
  })
}
