import { FactStore } from '../../runtime/eventStore'
import { Graph } from '../../runtime/graph'
import type { FactBinding } from '../../runtime/types'

// ── Rule fixtures for unit tests ──
// Pre-built FactStores for testing individual engineering org rules.

function fb(entityId: string, property: string, value: unknown): FactBinding {
  const now = '2026-04-27T00:00:00.000Z'
  return {
    entityId,
    property,
    value,
    source: { kind: 'graph_property' },
    confidence: 1.0,
    validFrom: now,
    observedAt: now,
  }
}

// ── engineer_burnout_threshold ──
export const burnoutFixtures = {
  alice_senior_burnout: new FactStore([fb('alice', 'workload', 85), fb('alice', 'seniority', 'senior')]),
  bob_mid_safe: new FactStore([fb('bob', 'workload', 65), fb('bob', 'seniority', 'mid')]),
  eve_junior_burnout: new FactStore([fb('eve', 'workload', 60), fb('eve', 'seniority', 'junior')]),
}

// ── team_capacity_overload ──
export const capacityFixtures = {
  frontend_normal: new FactStore([fb('team_frontend', 'memberCount', 2), fb('team_frontend', 'capacity', 2)]),
  overloaded_team: new FactStore([fb('team_x', 'memberCount', 5), fb('team_x', 'capacity', 3)]),
}

// ── project_team_load ──
export const teamLoadFixtures = {
  portal_safe: new FactStore([fb('project_portal', 'teamLoad', 150)]),
  api_safe: new FactStore([fb('project_api', 'teamLoad', 182)]),
  overloaded: new FactStore([fb('project_portal', 'teamLoad', 220)]),
}

// ── senior_coverage ──
export const seniorFixtures = {
  no_senior: new FactStore([fb('project_portal', 'seniorCount', 0)]),
  has_senior: new FactStore([fb('project_portal', 'seniorCount', 1)]),
}

// ── Precondition violation fixture ──
export const preconditionFixtures = {
  blind_zero_teamLoad: new FactStore([fb('project_portal', 'teamLoad', 150)]),
}

// ── Utility: empty graph ──
export function emptyGraph(): Graph {
  return new Graph()
}
