import type { FactBinding } from './types'

// ── FactStore ──
//
// A read-only snapshot view of facts at a given moment.
// For predictive mode this is EventStore.forSnapshot(now).
// Rules evaluate against a FactStore, not an EventStore.

export class FactStore {
  private bindings = new Map<string, FactBinding>() // key = `${entityId}.${property}`

  constructor(bindings: FactBinding[] = []) {
    for (const b of bindings) {
      const key = `${b.entityId}.${b.property}`
      const existing = this.bindings.get(key)
      // Higher-confidence binding wins on collision
      if (!existing || b.confidence >= existing.confidence) {
        this.bindings.set(key, b)
      }
    }
  }

  get(entityId: string, property: string): FactBinding | undefined {
    return this.bindings.get(`${entityId}.${property}`)
  }

  getValue(entityId: string, property: string): unknown {
    return this.get(entityId, property)?.value
  }

  forEntity(entityId: string): FactBinding[] {
    return [...this.bindings.values()].filter((b) => b.entityId === entityId)
  }

  forProperty(property: string): FactBinding[] {
    return [...this.bindings.values()].filter((b) => b.property === property)
  }

  all(): FactBinding[] {
    return [...this.bindings.values()]
  }

  has(entityId: string, property: string): boolean {
    return this.bindings.has(`${entityId}.${property}`)
  }

  /** Return a new FactStore that merges additional bindings (used by inference_rule results). */
  withDerived(additional: FactBinding[]): FactStore {
    return new FactStore([...this.all(), ...additional])
  }

  snapshot(): ReadonlyMap<string, FactBinding> {
    return this.bindings
  }
}
