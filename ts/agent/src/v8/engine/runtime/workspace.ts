import { FactStore } from '../stores/fact-store'
import type { FactBinding } from '../runtime/types'

// ── Workspace ──
// Holds mutable runtime state during Agent reasoning cycle
// bindings: array of FactBindings (mutable, appended by Runtime and Agent)
// candidates: list of entity IDs for dynamic reference resolution

export class Workspace {
  readonly bindings: FactBinding[] = []
  candidates: string[] = []

  /** Return a FactStore view of current bindings (immutable snapshot) */
  getFacts(): FactStore {
    return new FactStore(this.bindings)
  }

  /** Set candidates from graph query result */
  setCandidates(ids: string[]): void {
    this.candidates = ids
  }

  /** Append a binding */
  addBinding(binding: FactBinding): void {
    this.bindings.push(binding)
  }

  /** Append multiple bindings */
  addBindings(bindings: FactBinding[]): void {
    this.bindings.push(...bindings)
  }

  /** Get all bindings */
  allBindings(): FactBinding[] {
    return [...this.bindings]
  }

  /** Debug log */
  debugLog(): string {
    return JSON.stringify({
      bindings: this.bindings,
      candidates: this.candidates,
    }, null, 2)
  }

  /** Get session clock (current timestamp for rule evaluation) */
  getSessionClock(): Date {
    return new Date()
  }
}