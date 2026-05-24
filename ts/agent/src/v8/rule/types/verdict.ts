// ── Candidate ──
// 输入侧的候选类型

export type Candidate = {
  candidateId: string
  label: string
}

// ── Scored Candidate ──

export type ScoredCandidate = {
  candidateId: string
  label: string
  rawScore: number
  normalizedScore: number
  confidence: number
  triggeredRuleIds: string[]
  blockingRuleIds?: string[]
  rationale?: string
}

// ── System Verdict ──
// Rule Runtime 的最终输出

export type SystemVerdict = {
  candidates: ScoredCandidate[]
  recommendedCandidateId?: string
  vetoedLabels: string[]
  vetoedIds: string[]
  generatedAt: number
}