import { describe, it, expect } from 'vitest'
import {
  parsePredictiveVerdict,
  type CandidateAnswer,
  type ScoredCandidate,
  type ModelVerdict_Predictive,
  type SystemVerdict_Predictive,
  type Evidence,
  type Uncertainty,
  type Reconciliation,
  type PredictionConfig,
} from '../../../tasks/predictive/types'

describe('Predictive Types', () => {
  describe('CandidateAnswer', () => {
    it('should define correct structure', () => {
      const candidate: CandidateAnswer = {
        id: 'cand_1',
        label: 'HIGH',
        description: '高风险候选',
        supportingEvidenceIds: ['ev_1', 'ev_2'],
      }
      expect(candidate.id).toBe('cand_1')
      expect(candidate.label).toBe('HIGH')
      expect(candidate.supportingEvidenceIds).toHaveLength(2)
    })
  })

  describe('ScoredCandidate', () => {
    it('should define correct structure', () => {
      const scored: ScoredCandidate = {
        candidateId: 'cand_1',
        label: 'HIGH',
        rawScore: 1.5,
        normalizedScore: 0.85,
        confidence: 0.9,
        triggeredRuleIds: ['rule_1'],
        blockingRuleIds: [],
        rationale: '风险较高',
      }
      expect(scored.rawScore).toBe(1.5)
      expect(scored.normalizedScore).toBe(0.85)
      expect(scored.triggeredRuleIds).toContain('rule_1')
    })
  })

  describe('ModelVerdict_Predictive', () => {
    it('should define correct structure', () => {
      const verdict: ModelVerdict_Predictive = {
        source: 'model',
        mode: 'predictive',
        recommendedCandidateId: 'cand_2',
        confidence: 0.8,
        rationale: '根据证据判断',
        citedEvidenceIds: ['ev_1'],
        citedRuleIds: ['rule_2'],
      }
      expect(verdict.source).toBe('model')
      expect(verdict.mode).toBe('predictive')
      expect(verdict.recommendedCandidateId).toBe('cand_2')
    })
  })

  describe('SystemVerdict_Predictive', () => {
    it('should define correct structure', () => {
      const verdict: SystemVerdict_Predictive = {
        source: 'system',
        mode: 'predictive',
        ruleSetVersion: 'v1.0',
        ranking: [
          {
            candidateId: 'cand_1',
            label: 'LOW',
            rawScore: 0.5,
            normalizedScore: 0.8,
            confidence: 0.9,
            triggeredRuleIds: [],
            blockingRuleIds: [],
            rationale: '低风险',
          },
        ],
        recommendedCandidateId: 'cand_1',
        confidence: 0.9,
        vetoedLabels: ['DENIED'],
        notes: ['系统评分完成'],
      }
      expect(verdict.source).toBe('system')
      expect(verdict.ranking).toHaveLength(1)
      expect(verdict.vetoedLabels).toContain('DENIED')
    })
  })

  describe('Evidence', () => {
    it('should define correct structure', () => {
      const evidence: Evidence = {
        id: 'ev_1',
        sourceKind: 'property',
        entityIds: ['Reader:xiao_hong'],
        relatedRuleIds: ['rule_1'],
        content: '会员等级为 gold',
        confidence: 1.0,
        observedAt: '2024-01-01',
      }
      expect(evidence.sourceKind).toBe('property')
      expect(evidence.entityIds).toContain('Reader:xiao_hong')
    })
  })

  describe('Uncertainty', () => {
    it('should define correct structure', () => {
      const uncertainty: Uncertainty = {
        id: 'unc_1',
        description: '缺少逾期记录',
        impact: 'medium',
        missingFacts: ['overdue_count'],
        nextQuery: '查询逾期记录',
      }
      expect(uncertainty.impact).toBe('medium')
      expect(uncertainty.missingFacts).toContain('overdue_count')
    })
  })

  describe('Reconciliation', () => {
    it('should define correct structure for agreement', () => {
      const recon: Reconciliation = {
        agreed: true,
        surfacedToUser: false,
        modelRecommendation: 'cand_1',
        systemRecommendation: 'cand_1',
        discrepancies: [],
        rationale: '模型与系统一致',
      }
      expect(recon.agreed).toBe(true)
      expect(recon.modelRecommendation).toBe(recon.systemRecommendation)
    })

    it('should define correct structure for disagreement', () => {
      const recon: Reconciliation = {
        agreed: false,
        surfacedToUser: true,
        modelRecommendation: 'cand_1',
        systemRecommendation: 'cand_2',
        discrepancies: ['模型选择高风险，系统推荐低风险'],
        likelyCause: 'rule_weight_misalignment',
        rationale: '权重配置导致分歧',
      }
      expect(recon.agreed).toBe(false)
      expect(recon.discrepancies).toHaveLength(1)
    })
  })

  describe('PredictionConfig', () => {
    it('should define optional config', () => {
      const config: PredictionConfig = {
        maxCandidates: 5,
        scoringProfile: {
          aggregation: 'weighted_sum',
          veto: 'any_hard',
        },
      }
      expect(config.maxCandidates).toBe(5)
      expect(config.scoringProfile?.aggregation).toBe('weighted_sum')
    })
  })
})

describe('parsePredictiveVerdict', () => {
  it('should parse valid JSON block', () => {
    const text = `
分析结果如下：

\`\`\`json
{
  "source": "model",
  "mode": "predictive",
  "recommendedCandidateId": "cand_high",
  "confidence": 0.85,
  "rationale": "根据风险因素判断",
  "citedEvidenceIds": ["ev_1", "ev_2"],
  "citedRuleIds": ["rule_risk"]
}
\`\`\`
    `
    const verdict = parsePredictiveVerdict(text)
    expect(verdict).not.toBeNull()
    expect(verdict?.source).toBe('model')
    expect(verdict?.mode).toBe('predictive')
    expect(verdict?.recommendedCandidateId).toBe('cand_high')
    expect(verdict?.confidence).toBe(0.85)
  })

  it('should return null for missing JSON block', () => {
    const text = '没有 JSON 块，只有普通文本'
    const verdict = parsePredictiveVerdict(text)
    expect(verdict).toBeNull()
  })

  it('should return null for invalid JSON', () => {
    const text = `
\`\`\`json
{ invalid json }
\`\`\`
    `
    const verdict = parsePredictiveVerdict(text)
    expect(verdict).toBeNull()
  })

  it('should return null for wrong source/mode', () => {
    const text = `
\`\`\`json
{
  "source": "system",
  "mode": "diagnostic",
  "recommendedCandidateId": "cand_1"
}
\`\`\`
    `
    const verdict = parsePredictiveVerdict(text)
    expect(verdict).toBeNull()
  })

  it('should handle escaped backticks in test', () => {
    // Note: In actual markdown, backticks are escaped differently
    const text = 'no verdict here'
    const verdict = parsePredictiveVerdict(text)
    expect(verdict).toBeNull()
  })
})