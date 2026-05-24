import type { Rule } from './rule'
import type { RuleResult } from './context'

// ── Evaluated Rule ──

export type EvaluatedRule = {
  rule: Rule
  entityId?: string
  result: RuleResult
}

// ── Candidate Scoring Input ──

import type { Candidate } from './verdict'

export type CandidateScoringInput = {
  candidates: Candidate[]
  evaluatedRules: EvaluatedRule[]
  vetoedLabels: Set<string>
  vetoedIds: Set<string>
}

// ── Direction Mapping ──
// Maps each candidate label to the score contribution of each rule direction

import type { RuleDirection } from './rule'

export type DirectionMapping = Record<string, Record<RuleDirection, number>>

// ── Default Direction Mapping ──
// V8 保留 V6 中最关键的设计：Direction-aware scoring

export const DEFAULT_DIRECTION_MAPPING: DirectionMapping = {
  HIGH: {
    risk_up: +1,
    risk_down: -0.5,
    neutral: 0,
  },
  MEDIUM: {
    risk_up: +0.3,
    risk_down: +0.3,
    neutral: 0,
  },
  LOW: {
    risk_up: -0.5,
    risk_down: +1,
    neutral: 0,
  },
  ALLOWED: {
    risk_up: -0.5,
    risk_down: +1,
    neutral: 0,
  },
  DENIED: {
    risk_up: +1,
    risk_down: -0.5,
    neutral: 0,
  },
  'HIGH RISK': {
    risk_up: +1,
    risk_down: -0.5,
    neutral: 0,
  },
  'MEDIUM RISK': {
    risk_up: +0.3,
    risk_down: +0.3,
    neutral: 0,
  },
  'LOW RISK': {
    risk_up: -0.5,
    risk_down: +1,
    neutral: 0,
  },
}