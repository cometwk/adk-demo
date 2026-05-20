import type { FactStore } from '../runtime/eventStore'
import type { Graph } from '../provider/in-memory'
import type { RuleResult } from './rules'
import { getRules } from './rules'

// ── Rule evaluation (linear scan) ──
//
// Rules are evaluated in registration order — no DAG topological sort needed
// for the current rule count.  Hard constraints contribute to vetoedLabels;
// soft criteria are passed to scoreCandidates unchanged.
//
// isSubsumed is always false (subsumedBy logic deferred until rule count > 50).

export type EvaluatedRule = {
  ruleId: string
  entityId?: string
  result: RuleResult
  isSubsumed: false // always false; field kept for API compatibility
}

export type DagEvaluationOutput = {
  results: EvaluatedRule[]
  facts: FactStore
  vetoedLabels: Set<string>
}

/**
 * Evaluate all relevant rules against the given FactStore.
 *
 * @param initialFacts  - Starting FactStore (from EventStore or bind_fact calls)
 * @param graph         - Graph for entity type resolution
 * @param entityIds     - Entity IDs relevant to the current task (rule filter)
 * @param ruleIds       - Optional subset of rule IDs to evaluate (planner hint)
 */
export function evaluateRuleDag(
  initialFacts: FactStore,
  graph: Graph,
  entityIds: string[],
  ruleIds?: string[]
): DagEvaluationOutput {
  const allRules = getRules()
  const applicableRules = ruleIds ? allRules.filter((r) => ruleIds.includes(r.id)) : allRules

  const evaluatedResults: EvaluatedRule[] = []
  const vetoedLabels = new Set<string>()

  for (const rule of applicableRules) {
    const matchingEntities = entityIds.filter((eid) => {
      const node = graph.getBaseNode(eid)
      if (!node) return false
      return rule.appliesTo.includes(node.constructor.name)
    })

    if (matchingEntities.length === 0) {
      const result = rule.evaluator({ facts: initialFacts, graph })
      evaluatedResults.push({ ruleId: rule.id, result, isSubsumed: false })
      if (result.triggered && rule.veto) {
        for (const label of rule.veto.candidatesByLabel) vetoedLabels.add(label)
      }
    } else {
      for (const entityId of matchingEntities) {
        const result = rule.evaluator({ entityId, facts: initialFacts, graph })
        evaluatedResults.push({ ruleId: rule.id, entityId, result, isSubsumed: false })
        if (result.triggered && rule.veto) {
          for (const label of rule.veto.candidatesByLabel) vetoedLabels.add(label)
        }
      }
    }
  }

  return { results: evaluatedResults, facts: initialFacts, vetoedLabels }
}

// ── Convenience: evaluate a single rule ──

export function evaluateSingleRule(
  ruleId: string,
  facts: FactStore,
  graph: Graph,
  entityId?: string
): EvaluatedRule | null {
  const allRules = getRules()
  const rule = allRules.find((r) => r.id === ruleId)
  if (!rule) return null
  const result = rule.evaluator({ entityId, facts, graph })
  return { ruleId, entityId, result, isSubsumed: false }
}
