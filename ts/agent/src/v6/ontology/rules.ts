import type { FactStore } from "../runtime/eventStore";
import type { FactBinding } from "../runtime/types";
import type { Graph } from "../runtime/graph";

// ── Rule kinds ──

export type RuleKind =
	| "hard_constraint"    // veto: direct elimination of candidate(s)
	| "inference_rule"     // produces derived FactBindings before scoring
	| "soft_criterion"     // weighted contribution to MCDA score
	| "conflict_policy"    // describes how to handle conflicting signals
	| "explanation_policy"; // output formatting / uncertainty policy

// ── Rule direction (for MCDA scoring) ──
// Tells the scorer which candidates this rule pushes toward.
// "risk_up"   → favors HIGH-risk candidates
// "risk_down" → favors LOW-risk candidates
// "neutral"   → no directional effect (used by explanation_policy)

export type RuleDirection = "risk_up" | "risk_down" | "neutral";

// ── Required fact descriptor ──

export type RequiredFact = {
	property: string;
	scope: "entity" | "type" | "global";
};

// ── Veto config (hard_constraint only) ──

export type VetoConfig = {
	candidatesByLabel: string[];  // e.g. ["LOW"] — eliminated when constraint triggers
};

// ── Evaluation context ──

export type RuleContext = {
	entityId?: string;    // set when rule is evaluated per-entity
	facts: FactStore;
	graph: Graph;
};

// ── Evaluation result ──

export type RuleResult = {
	triggered: boolean;
	severity?: "low" | "medium" | "high";
	explanation?: string;
	derivedFacts?: FactBinding[];  // produced by inference_rule
	missingFacts?: Array<{ entityId?: string; property: string }>;
};

// ── Rule ──

export type Rule = {
	id: string;
	version: string;
	kind: RuleKind;
	appliesTo: string[];         // entity type names
	description: string;
	requiredFacts: RequiredFact[];
	direction: RuleDirection;
	weight?: number;             // 0..1; used for soft_criterion
	severityFn?: (ctx: RuleContext, triggered: boolean) => "low" | "medium" | "high";
	veto?: VetoConfig;           // only meaningful for hard_constraint
	dependsOn?: string[];        // rule IDs whose results this rule depends on (DAG edges)
	subsumedBy?: string[];       // rule IDs that already capture this rule's signal
	evaluator: (ctx: RuleContext) => RuleResult;
	explanation: (result: RuleResult, ctx: RuleContext) => string;
};

// ── Rule registry ──

const rules: Rule[] = [];

export function registerRule(rule: Rule): void {
	rules.push(rule);
}

export function getRules(): Rule[] {
	return [...rules];
}

export function getRuleById(id: string): Rule | undefined {
	return rules.find((r) => r.id === id);
}

export function queryRules(opts: {
	intent?: string;
	entityType?: string;
	kind?: RuleKind;
}): Rule[] {
	const intentKeywords: Record<string, string[]> = {
		risk_assessment: ["risk", "burnout", "overload", "pressure", "dependency", "coverage"],
		prioritization: ["priority", "pressure"],
		diagnosis: ["cause", "blame", "attribution"],
	};

	return rules.filter((r) => {
		if (opts.entityType && !r.appliesTo.includes(opts.entityType)) return false;
		if (opts.kind && r.kind !== opts.kind) return false;
		if (opts.intent) {
			const keywords = intentKeywords[opts.intent] ?? [];
			if (keywords.length > 0) {
				const idAndDesc = `${r.id} ${r.description}`.toLowerCase();
				if (!keywords.some((k) => idAndDesc.includes(k))) return false;
			}
		}
		return true;
	});
}

export function clearRules(): void {
	rules.length = 0;
}

// ── Project-portal scenario rules ──
// Upgraded from V5 constraints: each rule has direction, weight, dependsOn, and per-entity evaluation.

export function registerProjectPortalRules(): void {
	// ── inference_rule: engineer burnout threshold ──
	// Evaluated per Engineer entity (entityId is set by ruleDag.evaluateForType).
	registerRule({
		id: "engineer_burnout_threshold",
		version: "1.0.0",
		kind: "inference_rule",
		appliesTo: ["Engineer"],
		description: "工程师倦怠风险：senior > 80h, mid > 70h, junior > 55h",
		requiredFacts: [
			{ property: "workload", scope: "entity" },
			{ property: "seniority", scope: "entity" },
		],
		direction: "risk_up",
		weight: 0.75,
		evaluator(ctx) {
			const entityId = ctx.entityId;
			if (!entityId) return { triggered: false, missingFacts: [] };
			const workload = ctx.facts.getValue(entityId, "workload") as number | undefined;
			const seniority = ctx.facts.getValue(entityId, "seniority") as string | undefined;
			const missing: Array<{ entityId: string; property: string }> = [];
			if (workload === undefined) missing.push({ entityId, property: "workload" });
			if (seniority === undefined) missing.push({ entityId, property: "seniority" });
			if (missing.length > 0) return { triggered: false, missingFacts: missing };
			const thresholds: Record<string, number> = { senior: 80, mid: 70, junior: 55 };
			const threshold = thresholds[seniority!] ?? 70;
			const triggered = (workload as number) > threshold;
			return {
				triggered,
				severity: triggered ? "high" : "low",
				explanation: triggered
					? `${entityId} 工作负载 ${workload}h 超过 ${seniority} 阈值 ${threshold}h`
					: `${entityId} 工作负载 ${workload}h 在阈值 ${threshold}h 以内`,
				missingFacts: [],
			};
		},
		explanation(result) {
			return result.explanation ?? "";
		},
	});

	// ── hard_constraint: team capacity overload ──
	registerRule({
		id: "team_capacity_overload",
		version: "1.0.0",
		kind: "hard_constraint",
		appliesTo: ["Team"],
		description: "团队成员数超过容量即为超载",
		requiredFacts: [
			{ property: "memberCount", scope: "entity" },
			{ property: "capacity", scope: "entity" },
		],
		direction: "risk_up",
		weight: 1.0,
		veto: { candidatesByLabel: ["LOW"] },
		evaluator(ctx) {
			const entityId = ctx.entityId;
			if (!entityId) return { triggered: false, missingFacts: [] };
			const memberCount = ctx.facts.getValue(entityId, "memberCount") as number | undefined;
			const capacity = ctx.facts.getValue(entityId, "capacity") as number | undefined;
			const missing: Array<{ entityId: string; property: string }> = [];
			if (memberCount === undefined) missing.push({ entityId, property: "memberCount" });
			if (capacity === undefined) missing.push({ entityId, property: "capacity" });
			if (missing.length > 0) return { triggered: false, missingFacts: missing };
			const triggered = (memberCount as number) > (capacity as number);
			return {
				triggered,
				severity: triggered ? "high" : "low",
				explanation: triggered
					? `团队超载：${memberCount} 人超过容量 ${capacity}`
					: `团队未超载：${memberCount} 人，容量 ${capacity}`,
				missingFacts: [],
			};
		},
		explanation(result) {
			return result.explanation ?? "";
		},
	});

	// ── inference_rule: project team load ──
	registerRule({
		id: "project_team_load",
		version: "1.0.0",
		kind: "inference_rule",
		appliesTo: ["Project"],
		description: "项目关联工程师的总工作负载超过 200h 表示团队超载",
		requiredFacts: [{ property: "teamLoad", scope: "entity" }],
		direction: "risk_up",
		weight: 0.6,
		subsumedBy: ["engineer_burnout_threshold"],  // partial overlap — don't double-count
		evaluator(ctx) {
			const entityId = ctx.entityId;
			if (!entityId) return { triggered: false, missingFacts: [] };
			const teamLoad = ctx.facts.getValue(entityId, "teamLoad") as number | undefined;
			if (teamLoad === undefined) return { triggered: false, missingFacts: [{ entityId, property: "teamLoad" }] };
			const triggered = (teamLoad as number) > 200;
			return {
				triggered,
				severity: triggered ? "high" : "medium",
				explanation: triggered
					? `团队总负载 ${teamLoad}h 超过 200h 阈值`
					: `团队总负载 ${teamLoad}h 在 200h 以内`,
				missingFacts: [],
			};
		},
		explanation(result) {
			return result.explanation ?? "";
		},
	});

	// ── soft_criterion: senior coverage (risk-down direction) ──
	registerRule({
		id: "senior_coverage",
		version: "1.0.0",
		kind: "soft_criterion",
		appliesTo: ["Project"],
		description: "项目至少需要一名高级工程师以降低交付风险",
		requiredFacts: [{ property: "seniorCount", scope: "entity" }],
		direction: "risk_down",  // having a senior reduces risk
		weight: 0.8,
		evaluator(ctx) {
			const entityId = ctx.entityId;
			if (!entityId) return { triggered: false, missingFacts: [] };
			const seniorCount = ctx.facts.getValue(entityId, "seniorCount") as number | undefined;
			if (seniorCount === undefined) return { triggered: false, missingFacts: [{ entityId, property: "seniorCount" }] };
			// "triggered" here means the positive criterion is MET (seniorCount >= 1)
			const triggered = (seniorCount as number) >= 1;
			return {
				triggered,
				severity: triggered ? "low" : "high",
				explanation: triggered
					? `项目有 ${seniorCount} 名高级工程师，降低交付风险`
					: "项目没有高级工程师，缺乏技术把关",
				missingFacts: [],
			};
		},
		explanation(result) {
			return result.explanation ?? "";
		},
	});

	// ── soft_criterion: dependency risk propagation ──
	registerRule({
		id: "dependency_risk_propagation",
		version: "1.0.0",
		kind: "soft_criterion",
		appliesTo: ["Project"],
		description: "依赖项目的风险会传导到被依赖项目",
		requiredFacts: [{ property: "dependencyRisk", scope: "entity" }],
		direction: "risk_up",
		weight: 0.7,
		evaluator(ctx) {
			const entityId = ctx.entityId;
			if (!entityId) return { triggered: false, missingFacts: [] };
			const depRisk = ctx.facts.getValue(entityId, "dependencyRisk") as string | undefined;
			if (depRisk === undefined) return { triggered: false, missingFacts: [{ entityId, property: "dependencyRisk" }] };
			const triggered = depRisk === "HIGH" || depRisk === "MEDIUM";
			return {
				triggered,
				severity: depRisk === "HIGH" ? "high" : "medium",
				explanation: triggered
					? `依赖项目风险为 ${depRisk}，传导交付风险`
					: "依赖项目风险为 LOW，不影响交付",
				missingFacts: [],
			};
		},
		explanation(result) {
			return result.explanation ?? "";
		},
	});

	// ── soft_criterion: high priority pressure ──
	registerRule({
		id: "high_priority_pressure",
		version: "1.0.0",
		kind: "soft_criterion",
		appliesTo: ["Project"],
		description: "高优先级项目对交付不确定性的容忍度更低",
		requiredFacts: [{ property: "priority", scope: "entity" }],
		direction: "risk_up",
		weight: 0.6,
		evaluator(ctx) {
			const entityId = ctx.entityId;
			if (!entityId) return { triggered: false, missingFacts: [] };
			const priority = ctx.facts.getValue(entityId, "priority") as string | undefined;
			if (priority === undefined) return { triggered: false, missingFacts: [{ entityId, property: "priority" }] };
			const triggered = priority === "high";
			return {
				triggered,
				severity: triggered ? "medium" : "low",
				explanation: triggered
					? "高优先级项目对交付延迟敏感"
					: `项目优先级为 ${priority}，容忍度较高`,
				missingFacts: [],
			};
		},
		explanation(result) {
			return result.explanation ?? "";
		},
	});

	// ── explanation_policy: missing high-impact fact ──
	registerRule({
		id: "missing_high_impact_fact",
		version: "1.0.0",
		kind: "explanation_policy",
		appliesTo: ["Project", "Engineer", "Team"],
		description: "当关键事实缺失时，应标注不确定性而非给出虚假结论",
		requiredFacts: [],
		direction: "neutral",
		evaluator() {
			return { triggered: false };
		},
		explanation() {
			return "关键事实缺失，该结论的可信度降低";
		},
	});
}
