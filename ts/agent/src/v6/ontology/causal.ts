// ── Causal Graph (V6.5) ──
//
// IMPORTANT: This is SEPARATE from Ontology.relations.
//   - Ontology.relations describes structural facts  (Engineer --member_of--> Team)
//   - CausalGraph describes mechanism-level causation (workload_spike --leads_to--> productivity_drop)
//
// CausalEdge endpoints are patterns (event types or property state conditions),
// not entity IDs.  The same edge applies to any entity that matches the pattern.

export type CausalEdgePatternKind = "event_type" | "fact_condition" | "state";

export type CausalEdgePattern = {
	kind: CausalEdgePatternKind;
	// For event_type: the event.type string  (e.g. "milestone_missed")
	// For fact_condition: "entityType.property op value"  (e.g. "Engineer.workload > 80")
	// For state: free-form description
	matcher: string;
};

export type CausalStrength = "weak" | "moderate" | "strong";

export type CausalEdge = {
	id: string;
	cause: CausalEdgePattern;
	effect: CausalEdgePattern;
	mechanism: string;           // natural language explanation of the causal mechanism
	typicalLag: string;          // "0 days" / "1-3 weeks" / "weeks" / "immediate"
	strength: CausalStrength;
	counterEvidence?: string[];  // conditions under which this edge does NOT hold
	relatedRuleIds: string[];    // links back to V6 Rule IDs
};

export type CausalPath = {
	edges: CausalEdge[];
	rootCause: CausalEdgePattern;
	finalEffect: CausalEdgePattern;
};

// ── CausalGraph ──

export class CausalGraph {
	readonly edges: CausalEdge[];

	constructor(edges: CausalEdge[] = []) {
		this.edges = edges;
	}

	/** Return edges whose EFFECT matches the given pattern (for backward chaining). */
	edgesLeadingTo(effectMatcher: string): CausalEdge[] {
		return this.edges.filter((e) => patternMatches(e.effect, effectMatcher));
	}

	/** Return edges whose CAUSE matches the given pattern (for forward chaining). */
	edgesFrom(causeMatcher: string): CausalEdge[] {
		return this.edges.filter((e) => patternMatches(e.cause, causeMatcher));
	}

	/** List all immediate potential causes of an outcome pattern. */
	potentialCauses(outcomeMatcher: string): CausalEdge[] {
		return this.edgesLeadingTo(outcomeMatcher);
	}

	/** Backward chain from outcome: collect all CausalPaths up to maxDepth. */
	backwardChain(outcomeMatcher: string, maxDepth: number): CausalPath[] {
		const paths: CausalPath[] = [];
		const recurse = (currentMatcher: string, currentPath: CausalEdge[], depth: number) => {
			if (depth === 0) return;
			const incoming = this.edgesLeadingTo(currentMatcher);
			if (incoming.length === 0 && currentPath.length > 0) {
				// Reached a root cause
				paths.push({
					edges: [...currentPath].reverse(),
					rootCause: currentPath[currentPath.length - 1].cause,
					finalEffect: { kind: "event_type", matcher: outcomeMatcher },
				});
				return;
			}
			for (const edge of incoming) {
				if (currentPath.some((e) => e.id === edge.id)) continue; // cycle guard
				recurse(edge.cause.matcher, [...currentPath, edge], depth - 1);
			}
			if (incoming.length > 0 && depth === 1) {
				// Depth limit reached — emit partial path
				for (const edge of incoming) {
					paths.push({
						edges: [...currentPath, edge].reverse(),
						rootCause: edge.cause,
						finalEffect: { kind: "event_type", matcher: outcomeMatcher },
					});
				}
			}
		};
		recurse(outcomeMatcher, [], maxDepth);
		return paths;
	}

	/** Forward chain from cause: collect all CausalPaths up to maxDepth. */
	forwardChain(causeMatcher: string, maxDepth: number): CausalPath[] {
		const paths: CausalPath[] = [];
		const recurse = (currentMatcher: string, currentPath: CausalEdge[], depth: number) => {
			if (depth === 0) return;
			const outgoing = this.edgesFrom(currentMatcher);
			if (outgoing.length === 0 && currentPath.length > 0) {
				paths.push({
					edges: [...currentPath],
					rootCause: { kind: "event_type", matcher: causeMatcher },
					finalEffect: currentPath[currentPath.length - 1].effect,
				});
				return;
			}
			for (const edge of outgoing) {
				if (currentPath.some((e) => e.id === edge.id)) continue;
				recurse(edge.effect.matcher, [...currentPath, edge], depth - 1);
			}
			if (outgoing.length > 0 && depth === 1) {
				for (const edge of outgoing) {
					paths.push({
						edges: [...currentPath, edge],
						rootCause: { kind: "event_type", matcher: causeMatcher },
						finalEffect: edge.effect,
					});
				}
			}
		};
		recurse(causeMatcher, [], maxDepth);
		return paths;
	}
}

function patternMatches(pattern: CausalEdgePattern, matcher: string): boolean {
	// Simple substring / exact match.
	// A more sophisticated engine would do regex or semantic matching.
	return pattern.matcher === matcher || pattern.matcher.includes(matcher) || matcher.includes(pattern.matcher);
}

// ── Project-portal scenario causal graph ──
// 5-10 edges covering the main causal mechanisms in the demo scenario.

export function buildProjectPortalCausalGraph(): CausalGraph {
	const edges: CausalEdge[] = [
		{
			id: "ce_workload_burnout",
			cause: { kind: "fact_condition", matcher: "Engineer.workload > threshold" },
			effect: { kind: "state", matcher: "productivity_drop" },
			mechanism: "持续超阈值工时导致疲劳累积，单位时间产出下降",
			typicalLag: "1-3 weeks",
			strength: "moderate",
			relatedRuleIds: ["engineer_burnout_threshold"],
		},
		{
			id: "ce_productivity_drop_milestone_miss",
			cause: { kind: "state", matcher: "productivity_drop" },
			effect: { kind: "event_type", matcher: "milestone_missed" },
			mechanism: "产出下降导致里程碑延期",
			typicalLag: "weeks",
			strength: "moderate",
			relatedRuleIds: ["project_team_load"],
		},
		{
			id: "ce_dep_slip_portal_blocked",
			cause: { kind: "event_type", matcher: "delivery_slip" },
			effect: { kind: "state", matcher: "downstream_blocked" },
			mechanism: "依赖项目未按时交付，阻塞下游开发",
			typicalLag: "0 days",
			strength: "strong",
			relatedRuleIds: ["dependency_risk_propagation"],
		},
		{
			id: "ce_blocked_milestone_miss",
			cause: { kind: "state", matcher: "downstream_blocked" },
			effect: { kind: "event_type", matcher: "milestone_missed" },
			mechanism: "阻塞状态直接导致里程碑无法完成",
			typicalLag: "immediate",
			strength: "strong",
			relatedRuleIds: ["dependency_risk_propagation"],
		},
		{
			id: "ce_scope_added_pressure",
			cause: { kind: "event_type", matcher: "scope_added" },
			effect: { kind: "state", matcher: "deadline_pressure_increase" },
			mechanism: "范围扩张但人力不变，截止日期压力升高",
			typicalLag: "0-7 days",
			strength: "strong",
			relatedRuleIds: ["high_priority_pressure"],
		},
		{
			id: "ce_deadline_pressure_milestone_miss",
			cause: { kind: "state", matcher: "deadline_pressure_increase" },
			effect: { kind: "event_type", matcher: "milestone_missed" },
			mechanism: "截止日期压力升高且资源不足时里程碑延期",
			typicalLag: "1-3 weeks",
			strength: "moderate",
			relatedRuleIds: ["high_priority_pressure"],
		},
		{
			id: "ce_team_overload_milestone_miss",
			cause: { kind: "state", matcher: "team_overloaded" },
			effect: { kind: "event_type", matcher: "milestone_missed" },
			mechanism: "团队超载直接降低整体交付能力",
			typicalLag: "1-2 weeks",
			strength: "strong",
			relatedRuleIds: ["team_capacity_overload", "project_team_load"],
		},
	];
	return new CausalGraph(edges);
}
