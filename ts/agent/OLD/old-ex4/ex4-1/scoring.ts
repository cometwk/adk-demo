import { DEFAULT_DIRECTION_MAPPING } from '../../ontology/scoring'
import type { ScoringProfile } from '../../ontology/scoring'

// ── Library borrow-request scoring profile ──
//
// Extends the generic risk-tier mapping with domain labels ALLOWED / DENIED.
//   ALLOWED → behaves like LOW risk (risk_down rules push it up)
//   DENIED  → behaves like HIGH risk (risk_up rules push it up)

export const LIBRARY_SCORING_PROFILE: ScoringProfile = {
  aggregation: 'weighted_sum',
  veto: 'any_hard',
  directionMapping: {
    ...DEFAULT_DIRECTION_MAPPING,
    ALLOWED: { risk_up: -0.5, risk_down: +1, neutral: 0 },
    DENIED: { risk_up: +1, risk_down: -0.5, neutral: 0 },
  },
}
