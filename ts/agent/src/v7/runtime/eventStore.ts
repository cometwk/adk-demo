import type { FactBinding } from './types'

// ── Event ──
//
// An Event represents something that happened at a point in time.
// It may derive fact bindings (property changes that result from the event).

export type Event = {
  id: string
  type: string // e.g. "workload_changed" / "scope_added" / "milestone_missed"
  occurredAt: string // ISO 8601
  actorId?: string // who/what triggered the event
  affectedEntities: string[] // entity IDs touched by this event
  payload: Record<string, unknown> // event-specific data
  derivedBindings?: FactBinding[] // fact changes resulting from this event
}

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

// ── EventStore ──
//
// The single source of truth for all facts.
// Predictive mode uses `forSnapshot(now)`.
// Diagnostic mode uses `timelineFor(entityId, from, to)` and `eraseEvent`.

export class EventStore {
  private events: Event[] = []

  addEvent(event: Event): void {
    this.events.push(event)
    // Keep events sorted chronologically
    this.events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  }

  /** Return all events affecting an entity within an optional time window. */
  timelineFor(entityId: string, from?: string, to?: string): Event[] {
    return this.events.filter((e) => {
      if (!e.affectedEntities.includes(entityId)) return false
      if (from && e.occurredAt < from) return false
      if (to && e.occurredAt > to) return false
      return true
    })
  }

  /** Return all events within an optional time window (any entity). */
  allInWindow(from?: string, to?: string): Event[] {
    return this.events.filter((e) => {
      if (from && e.occurredAt < from) return false
      if (to && e.occurredAt > to) return false
      return true
    })
  }

  /** Return a FactStore representing entity properties as of timestamp t.
   *  For predictive (snapshot) usage, pass t = new Date().toISOString().
   *  The latest valid binding for each (entityId, property) pair is chosen.
   */
  factsAt(t: string): FactStore {
    const candidates: FactBinding[] = []
    for (const event of this.events) {
      if (event.occurredAt > t) break // events are sorted
      if (event.derivedBindings) {
        for (const b of event.derivedBindings) {
          // Only include bindings valid at time t
          if (b.validFrom <= t && (!b.validUntil || b.validUntil > t)) {
            candidates.push(b)
          }
        }
      }
    }
    // FactStore constructor handles deduplication (higher confidence wins)
    return new FactStore(candidates)
  }

  /** Return a new EventStore with the specified event removed.
   *  Used for but-for counterfactual analysis.
   */
  eraseEvent(eventId: string): EventStore {
    const clone = new EventStore()
    for (const e of this.events) {
      if (e.id !== eventId) clone.addEvent(e)
    }
    return clone
  }

  snapshot(): readonly Event[] {
    return this.events
  }

  getEvent(id: string): Event | undefined {
    return this.events.find((e) => e.id === id)
  }

  /** Build a FactStore from explicit bindings (not events).
   *  Convenience for predictive sessions that populate facts directly via bind_fact tool.
   */
  static fromBindings(bindings: FactBinding[]): FactStore {
    return new FactStore(bindings)
  }
}
