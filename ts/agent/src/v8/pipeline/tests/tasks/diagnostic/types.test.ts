import { describe, it, expect } from 'vitest'
import {
  parseDiagnosticVerdict,
  type DiagnosticVerdict,
  type CandidateCause,
  type AttributionResult,
  type OutcomeEvent,
  type Evidence,
  type CausalPathRef,
} from '../../../tasks/diagnostic/types'

describe('Diagnostic Types', () => {
  describe('OutcomeEvent', () => {
    it('should define correct structure', () => {
      const outcome: OutcomeEvent = {
        entityId: 'Merch:M001',
        eventType: 'milestone_missed',
        occurredAt: '2024-01-15T10:00:00Z',
        details: { expected: '100', actual: '50' },
      }
      expect(outcome.entityId).toBe('Merch:M001')
      expect(outcome.eventType).toBe('milestone_missed')
    })
  })

  describe('CausalPathRef', () => {
    it('should define correct structure', () => {
      const pathRef: CausalPathRef = {
        edgeIds: ['edge_1', 'edge_2'],
        rootCauseMatcher: 'Staff:*',
        finalEffectMatcher: 'Merch:*',
      }
      expect(pathRef.edgeIds).toHaveLength(2)
      expect(pathRef.rootCauseMatcher).toBe('Staff:*')
    })
  })

  describe('CandidateCause', () => {
    it('should define correct structure', () => {
      const cause: CandidateCause = {
        id: 'cause_1',
        label: '人员离职',
        description: '关键人员离职导致业绩下降',
        causalPathRef: {
          edgeIds: ['edge_1'],
          rootCauseMatcher: 'Staff:*',
          finalEffectMatcher: 'Merch:*',
        },
        timelineEvidenceIds: ['ev_1', 'ev_2'],
        canCoexistWith: ['cause_2'],
      }
      expect(cause.id).toBe('cause_1')
      expect(cause.timelineEvidenceIds).toHaveLength(2)
    })
  })

  describe('AttributionResult', () => {
    it('should define correct structure', () => {
      const attr: AttributionResult = {
        causeId: 'cause_1',
        label: '人员离职',
        necessity: 0.8,
        sufficiency: 0.6,
        pathCompleteness: 0.9,
        temporalPlausibility: 0.95,
        attributionScore: 0.75,
        confidence: 0.85,
        rationale: '时间线吻合，证据充分',
      }
      expect(attr.necessity).toBe(0.8)
      expect(attr.attributionScore).toBe(0.75)
    })
  })

  describe('DiagnosticVerdict', () => {
    it('should define correct structure for system verdict', () => {
      const verdict: DiagnosticVerdict = {
        source: 'system',
        mode: 'diagnostic',
        rankedAttributions: [
          {
            causeId: 'cause_1',
            label: '人员离职',
            necessity: 0.8,
            sufficiency: 0.6,
            pathCompleteness: 0.9,
            temporalPlausibility: 0.95,
            attributionScore: 0.75,
            confidence: 0.85,
            rationale: '',
          },
        ],
        overdetermined: false,
        notes: ['归因分析完成'],
      }
      expect(verdict.source).toBe('system')
      expect(verdict.mode).toBe('diagnostic')
      expect(verdict.rankedAttributions).toHaveLength(1)
    })

    it('should define correct structure for model verdict', () => {
      const verdict: DiagnosticVerdict = {
        source: 'model',
        mode: 'diagnostic',
        rankedAttributions: [],
        overdetermined: false,
        notes: [],
        rationale: '模型推理结果',
        citedEvidenceIds: ['ev_1'],
      }
      expect(verdict.source).toBe('model')
      expect(verdict.rationale).toBe('模型推理结果')
    })
  })

  describe('Evidence', () => {
    it('should define correct structure', () => {
      const evidence: Evidence = {
        id: 'ev_1',
        sourceKind: 'event',
        entityIds: ['Staff:S001'],
        relatedRuleIds: ['rule_1'],
        content: '员工离职事件',
        confidence: 0.9,
        observedAt: '2024-01-01',
      }
      expect(evidence.sourceKind).toBe('event')
      expect(evidence.entityIds).toContain('Staff:S001')
    })
  })
})

describe('parseDiagnosticVerdict', () => {
  it('should parse valid JSON block', () => {
    const text = `
归因分析如下：

\`\`\`json
{
  "source": "model",
  "mode": "diagnostic",
  "rankedAttributions": [
    {
      "causeId": "cause_1",
      "label": "人员离职",
      "necessity": 0.8,
      "sufficiency": 0.6,
      "pathCompleteness": 0.9,
      "temporalPlausibility": 0.95,
      "attributionScore": 0.75,
      "confidence": 0.85,
      "rationale": "时间线吻合"
    }
  ],
  "overdetermined": false,
  "notes": []
}
\`\`\`
    `
    const verdict = parseDiagnosticVerdict(text)
    expect(verdict).not.toBeNull()
    expect(verdict?.mode).toBe('diagnostic')
    expect(verdict?.rankedAttributions).toHaveLength(1)
    expect(verdict?.rankedAttributions[0].necessity).toBe(0.8)
  })

  it('should return null for missing JSON block', () => {
    const text = '没有 JSON 块，只有普通文本'
    const verdict = parseDiagnosticVerdict(text)
    expect(verdict).toBeNull()
  })

  it('should return null for invalid JSON', () => {
    const text = `
\`\`\`json
{ invalid json }
\`\`\`
    `
    const verdict = parseDiagnosticVerdict(text)
    expect(verdict).toBeNull()
  })

  it('should return null for wrong mode', () => {
    const text = `
\`\`\`json
{
  "source": "system",
  "mode": "predictive",
  "rankedAttributions": []
}
\`\`\`
    `
    const verdict = parseDiagnosticVerdict(text)
    expect(verdict).toBeNull()
  })
})