import type { DecisionTask, SystemVerdict_Predictive, DiagnosticVerdict, CandidateCause } from '../ontology/decision'
import type { FactStore } from '../runtime/eventStore'
import type { EventStore } from '../runtime/eventStore'
import type { Graph } from '../provider/in-memory'
import type { Ontology } from '../ontology/schema'
import type { CausalGraph } from '../ontology/causal'
import type { ScoringProfile } from '../ontology/scoring'
import type { CandidateAnswer } from '../ontology/decision'
import { runPredictiveCritic } from './criticPredictive'
import { runDiagnosticCritic } from './criticDiagnostic'

// ── Mode router ──
//
// Single entry point for the critic layer.
// Dispatches to the appropriate critic based on task.mode.

export type CriticInput = {
  task: DecisionTask
  graph: Graph
  ontology: Ontology
  // Predictive
  facts?: FactStore
  candidates?: CandidateAnswer[]
  scoringProfile?: ScoringProfile
  ruleIds?: string[]
  // Diagnostic
  eventStore?: EventStore
  causalGraph?: CausalGraph
  candidateCauses?: CandidateCause[]
}

export type CriticOutput =
  | { mode: 'predictive'; verdict: SystemVerdict_Predictive }
  | { mode: 'diagnostic'; verdict: DiagnosticVerdict }

export function runCritic(input: CriticInput): CriticOutput {
  if (input.task.mode === 'diagnostic') {
    if (!input.eventStore || !input.causalGraph) {
      return {
        mode: 'diagnostic',
        verdict: {
          source: 'system',
          mode: 'diagnostic',
          rankedAttributions: [],
          overdetermined: false,
          notes: ['Diagnostic mode requires eventStore and causalGraph.'],
        },
      }
    }
    const verdict = runDiagnosticCritic({
      task: input.task,
      candidateCauses: input.candidateCauses ?? [],
      eventStore: input.eventStore,
      causalGraph: input.causalGraph,
    })
    return { mode: 'diagnostic', verdict }
  }

  // Default: predictive
  if (!input.facts) {
    return {
      mode: 'predictive',
      verdict: {
        source: 'system',
        mode: 'predictive',
        ruleSetVersion: input.ontology.version,
        ranking: [],
        recommendedCandidateId: '',
        confidence: 0,
        vetoedLabels: [],
        notes: ['Predictive mode requires a FactStore.'],
      },
    }
  }

  const verdict = runPredictiveCritic({
    task: input.task,
    facts: input.facts,
    candidates: input.candidates ?? [],
    graph: input.graph,
    ontology: input.ontology,
    scoringProfile: input.scoringProfile,
    ruleIds: input.ruleIds,
  })
  return { mode: 'predictive', verdict }
}
