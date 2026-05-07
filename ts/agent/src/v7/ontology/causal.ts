// ── Causal Graph (V6.5) ──
//
// IMPORTANT: This is SEPARATE from Ontology.relations.
//   - Ontology.relations describes structural facts  (Engineer --member_of--> Team)
//   - CausalGraph describes mechanism-level causation (workload_spike --leads_to--> productivity_drop)
//
// CausalEdge endpoints are patterns (event types or property state conditions),
// not entity IDs.  The same edge applies to any entity that matches the pattern.

export type CausalEdgePatternKind = 'event_type' | 'fact_condition' | 'state'

export type CausalEdgePattern = {
  kind: CausalEdgePatternKind
  // For event_type: the event.type string  (e.g. "milestone_missed")
  // For fact_condition: "entityType.property op value"  (e.g. "Engineer.workload > 80")
  // For state: free-form description
  matcher: string
}

export type CausalStrength = 'weak' | 'moderate' | 'strong'

export type CausalEdge = {
  id: string
  cause: CausalEdgePattern
  effect: CausalEdgePattern
  mechanism: string // natural language explanation of the causal mechanism
  typicalLag: string // "0 days" / "1-3 weeks" / "weeks" / "immediate"
  strength: CausalStrength
  counterEvidence?: string[] // conditions under which this edge does NOT hold
  relatedRuleIds: string[] // links back to V6 Rule IDs
}

export type CausalPath = {
  edges: CausalEdge[]
  rootCause: CausalEdgePattern
  finalEffect: CausalEdgePattern
}

// ── CausalGraph ──

export class CausalGraph {
  readonly edges: CausalEdge[]

  constructor(edges: CausalEdge[] = []) {
    this.edges = edges
  }

  /** Return edges whose EFFECT matches the given pattern (for backward chaining). */
  edgesLeadingTo(effectMatcher: string): CausalEdge[] {
    return this.edges.filter((e) => patternMatches(e.effect, effectMatcher))
  }

  /** Return edges whose CAUSE matches the given pattern (for forward chaining). */
  edgesFrom(causeMatcher: string): CausalEdge[] {
    return this.edges.filter((e) => patternMatches(e.cause, causeMatcher))
  }

  /** List all immediate potential causes of an outcome pattern. */
  potentialCauses(outcomeMatcher: string): CausalEdge[] {
    return this.edgesLeadingTo(outcomeMatcher)
  }

  /** Backward chain from outcome: collect all CausalPaths up to maxDepth. */
  backwardChain(outcomeMatcher: string, maxDepth: number): CausalPath[] {
    const paths: CausalPath[] = []
    const recurse = (currentMatcher: string, currentPath: CausalEdge[], depth: number) => {
      if (depth === 0) return
      const incoming = this.edgesLeadingTo(currentMatcher)
      if (incoming.length === 0 && currentPath.length > 0) {
        // Reached a root cause
        paths.push({
          edges: [...currentPath].reverse(),
          rootCause: currentPath[currentPath.length - 1].cause,
          finalEffect: { kind: 'event_type', matcher: outcomeMatcher },
        })
        return
      }
      for (const edge of incoming) {
        if (currentPath.some((e) => e.id === edge.id)) continue // cycle guard
        recurse(edge.cause.matcher, [...currentPath, edge], depth - 1)
      }
      if (incoming.length > 0 && depth === 1) {
        // Depth limit reached — emit partial path
        for (const edge of incoming) {
          paths.push({
            edges: [...currentPath, edge].reverse(),
            rootCause: edge.cause,
            finalEffect: { kind: 'event_type', matcher: outcomeMatcher },
          })
        }
      }
    }
    recurse(outcomeMatcher, [], maxDepth)
    return paths
  }

  /** Forward chain from cause: collect all CausalPaths up to maxDepth. */
  forwardChain(causeMatcher: string, maxDepth: number): CausalPath[] {
    const paths: CausalPath[] = []
    const recurse = (currentMatcher: string, currentPath: CausalEdge[], depth: number) => {
      if (depth === 0) return
      const outgoing = this.edgesFrom(currentMatcher)
      if (outgoing.length === 0 && currentPath.length > 0) {
        paths.push({
          edges: [...currentPath],
          rootCause: { kind: 'event_type', matcher: causeMatcher },
          finalEffect: currentPath[currentPath.length - 1].effect,
        })
        return
      }
      for (const edge of outgoing) {
        if (currentPath.some((e) => e.id === edge.id)) continue
        recurse(edge.effect.matcher, [...currentPath, edge], depth - 1)
      }
      if (outgoing.length > 0 && depth === 1) {
        for (const edge of outgoing) {
          paths.push({
            edges: [...currentPath, edge],
            rootCause: { kind: 'event_type', matcher: causeMatcher },
            finalEffect: edge.effect,
          })
        }
      }
    }
    recurse(causeMatcher, [], maxDepth)
    return paths
  }
}

function patternMatches(pattern: CausalEdgePattern, matcher: string): boolean {
  // Simple substring / exact match.
  // A more sophisticated engine would do regex or semantic matching.
  return pattern.matcher === matcher || pattern.matcher.includes(matcher) || matcher.includes(pattern.matcher)
}
