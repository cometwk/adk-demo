import type { FactStore } from '../runtime/eventStore'
import type { DecisionTask, SystemVerdict_Predictive } from '../ontology/decision'
import type { Ontology } from '../ontology/schema'
import type { ScoringProfile } from '../ontology/scoring'
import { scoreCandidates } from '../ontology/scoring'
import { evaluateRuleDag } from '../ontology/ruleDag'
import { getRules } from '../ontology/rules'
import type { Graph } from '../provider/in-memory'
import type { CandidateAnswer } from '../ontology/decision'

// ── Predictive Critic ──
//
// Deterministic: no LLM calls.
// Steps:
//   1. Run rule DAG → get triggered rules + derived facts + vetoed labels
//   2. Run MCDA scoring → ranked ScoredCandidates
//   3. Pick top non-vetoed candidate as recommendation
//   4. Return SystemVerdict_Predictive

export type CriticPredictiveInput = {
  task: DecisionTask
  facts: FactStore
  candidates: CandidateAnswer[]
  graph: Graph
  ontology: Ontology
  scoringProfile?: ScoringProfile
  ruleIds?: string[] // planner hint — subset to evaluate
}

export function runPredictiveCritic(input: CriticPredictiveInput): SystemVerdict_Predictive {
  const { task, facts, candidates, graph, ontology, scoringProfile, ruleIds } = input

  // Step 1: evaluate rule DAG
  const entityIds = task.entryEntities ?? []
  const dagOutput = evaluateRuleDag(facts, graph, entityIds, ruleIds)

  // Step 2: score candidates
  const allRules = getRules()
  const scored = scoreCandidates({
    candidates,
    evaluatedRules: dagOutput.results,
    allRules,
    vetoedLabels: dagOutput.vetoedLabels,
    profile: scoringProfile,
  })

  // Step 3: pick top non-vetoed
  const top = scored.find((s) => s.rawScore > -Infinity)

  const notes: string[] = []
  if (dagOutput.vetoedLabels.size > 0) {
    notes.push(`Hard constraint veto eliminated: ${[...dagOutput.vetoedLabels].join(', ')}`)
  }
  const missingFacts = dagOutput.results
    .flatMap((r) => r.result.missingFacts ?? [])
    .map((m) => (m.entityId ? `${m.entityId}.${m.property}` : m.property))
  if (missingFacts.length > 0) {
    const unique = [...new Set(missingFacts)]
    notes.push(`Missing facts during evaluation: ${unique.join(', ')}`)
  }

  return {
    source: 'system',
    mode: 'predictive',
    ruleSetVersion: ontology.version,
    ranking: scored,
    recommendedCandidateId: top?.candidateId ?? '',
    confidence: top?.confidence ?? 0,
    vetoedLabels: [...dagOutput.vetoedLabels],
    notes,
  }
}
