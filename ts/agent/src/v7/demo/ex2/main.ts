/**
 * Demo ex2: dbt Data Pipeline Data Quality
 *
 * Run:
 *   npx tsx src/v6/demo/ex2/main.ts
 *
 * Runs two rounds:
 *   1. Predictive  — "评估 orders_daily 模型的数据质量风险"
 *   2. Diagnostic  — "CFO Dashboard 数据为什么错误"
 */

import { runDecisionAssistant } from '../../index'
import type { DiagnosticVerdict, SystemVerdict_Predictive } from '../../ontology/decision'
import { dbtOntology } from './ontology'
import { setupDbtScenario } from './seed'

async function main() {
  console.log('════════════════════════════════════════════')
  console.log(' Ex2 — dbt Data Pipeline Data Quality Demo ')
  console.log('════════════════════════════════════════════\n')

  // ── Round 1: Predictive ──
  console.log('【Round 1】Predictive: 评估 orders_daily 模型的数据质量风险\n')

  const { graph, factStore } = setupDbtScenario()

  const predictiveResult = await runDecisionAssistant({
    userQuery: '评估 orders_daily 模型的数据质量风险',
    graph,
    ontology: dbtOntology,
    factStore,
    entryEntities: ['orders_daily', 'revenue_summary', 'src_orders_api'],
    verbose: true,
  })

  if (predictiveResult.systemVerdict?.mode === 'predictive') {
    const sv = predictiveResult.systemVerdict as SystemVerdict_Predictive
    console.log('\n── System Verdict ──')
    console.log(`  Recommended: ${sv.recommendedCandidateId}`)
    console.log(`  Confidence:  ${sv.confidence}`)
    console.log(`  Ranking:     ${sv.ranking.map((r) => r.label).join(' > ')}`)
  }

  if (predictiveResult.modelVerdict?.mode === 'predictive') {
    const mv = predictiveResult.modelVerdict
    console.log('\n── Model Verdict ──')
    console.log(`  Recommended: ${mv.recommendedCandidateId}`)
    console.log(`  Rationale:   ${mv.rationale}`)
  }

  console.log('\n── Reconciliation ──')
  console.log(`  Agree: ${predictiveResult.reconciliation.agree}`)
  if (!predictiveResult.reconciliation.agree) {
    console.log(`  Likely cause: ${predictiveResult.reconciliation.diff?.likelyCause}`)
  }

  console.log('\n── Evidence ──')
  for (const ev of predictiveResult.evidence.slice(0, 6)) {
    console.log(`  [${ev.sourceKind}] entities=${ev.entityIds.join(',')} — ${ev.content.slice(0, 80)}`)
  }

  // ── Round 2: Diagnostic ──
  console.log('\n\n【Round 2】Diagnostic: CFO Dashboard 数据为什么错误\n')

  const { graph: g2, factStore: fs2, eventStore: es2, causalGraph: cg2 } = setupDbtScenario()

  const diagnosticResult = await runDecisionAssistant({
    userQuery: 'CFO Dashboard 数据为什么错误',
    graph: g2,
    ontology: dbtOntology,
    factStore: fs2,
    eventStore: es2,
    causalGraph: cg2,
    outcome: {
      entityId: 'cfo_dashboard',
      eventType: 'dashboard_incorrect',
      occurredAt: '2026-04-27T09:00:00.000Z',
    },
    verbose: true,
  })

  if (diagnosticResult.systemVerdict?.mode === 'diagnostic') {
    const sv = diagnosticResult.systemVerdict as DiagnosticVerdict
    console.log('\n── System Verdict (Diagnostic) ──')
    for (const a of sv.rankedAttributions) {
      console.log(`  Cause: ${a.causeId}  attributionScore=${a.attributionScore.toFixed(3)}`)
    }
  }

  if (diagnosticResult.modelVerdict?.mode === 'diagnostic') {
    const mv = diagnosticResult.modelVerdict as DiagnosticVerdict
    console.log('\n── Model Verdict (Diagnostic) ──')
    for (const a of mv.rankedAttributions) {
      console.log(`  Cause: ${a.causeId}`)
    }
  }

  console.log('\n── Reconciliation ──')
  console.log(`  Agree: ${diagnosticResult.reconciliation.agree}`)

  if (diagnosticResult.counterfactuals.length > 0) {
    console.log('\n── Counterfactuals ──')
    for (const cf of diagnosticResult.counterfactuals) {
      console.log(`  [${cf.mode}] ${cf.description}`)
    }
  }

  console.log('\n\nDemo ex2 completed.')
}

main().catch((err) => {
  console.error('Demo ex2 failed:', err)
  process.exit(1)
})
