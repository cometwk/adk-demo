import type {
  Rule,
  RuleFilter,
  RuleMetadata,
} from '../types/rule'
import { INTENT_KEYWORDS } from '../types/rule'

// ── Rule Registry Interface ──

export interface RuleRegistry {
  register(rule: Rule): void
  get(ruleId: string): Rule | undefined
  resolve(ruleIds?: string[]): Rule[]
  list(filter?: RuleFilter): Rule[]
  clear(): void
}

// ── InMemory Rule Registry ──

export class InMemoryRuleRegistry implements RuleRegistry {
  private rules = new Map<string, Rule>()

  register(rule: Rule): void {
    if (this.rules.has(rule.id)) {
      throw new Error(`Rule '${rule.id}' already registered`)
    }
    this.rules.set(rule.id, rule)
  }

  get(ruleId: string): Rule | undefined {
    return this.rules.get(ruleId)
  }

  resolve(ruleIds?: string[]): Rule[] {
    if (!ruleIds || ruleIds.length === 0) {
      return Array.from(this.rules.values())
    }
    return ruleIds
      .map((id) => this.rules.get(id))
      .filter((r): r is Rule => r !== undefined)
  }

  list(filter?: RuleFilter): Rule[] {
    const all = Array.from(this.rules.values())
    if (!filter) return all

    return all.filter((rule) => {
      if (filter.entityType && !rule.appliesTo.includes(filter.entityType)) {
        return false
      }
      if (filter.kind && rule.kind !== filter.kind) {
        return false
      }
      if (filter.intent) {
        const keywords = INTENT_KEYWORDS[filter.intent] ?? []
        if (keywords.length > 0) {
          const text = `${rule.id} ${rule.description}`.toLowerCase()
          if (!keywords.some((k) => text.includes(k))) {
            return false
          }
        }
      }
      return true
    })
  }

  clear(): void {
    this.rules.clear()
  }
}

// ── Helper: Convert Rule to Metadata ──

export function toMetadata(rule: Rule): RuleMetadata {
  return {
    id: rule.id,
    version: rule.version,
    kind: rule.kind,
    appliesTo: rule.appliesTo,
    description: rule.description,
    direction: rule.direction,
    weight: rule.weight,
    requiredFacts: rule.requiredFacts,
  }
}