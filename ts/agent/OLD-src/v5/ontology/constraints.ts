// ── Constraint types (C) ──

export type ConstraintKind =
	| "hard_constraint"
	| "soft_criterion"
	| "inference_rule"
	| "conflict_policy"
	| "explanation_policy";

export type Constraint = {
	id: string;
	kind: ConstraintKind;
	appliesTo: string[];
	description: string;
	requiredFacts: string[];
	weight?: number;
	priority?: number;
	explanationTemplate: string;
};

export type EvaluableConstraint = Constraint & {
	evaluate: (facts: Record<string, unknown>) => ConstraintResult;
};

export type ConstraintResult = {
	triggered: boolean;
	severity: "high" | "medium" | "low";
	evidence: string;
	explanation: string;
	missingFacts: string[];
};

function isEvaluable(c: Constraint): c is EvaluableConstraint {
	return "evaluate" in c;
}

// ── Constraint registry ──

const constraints: Constraint[] = [];

export function registerConstraint(c: Constraint): void {
	constraints.push(c);
}

export function getConstraints(): Constraint[] {
	return [...constraints];
}

export function getConstraintById(id: string): Constraint | undefined {
	return constraints.find((c) => c.id === id);
}

export function queryConstraints(opts: {
	intent?: string;
	entityType?: string;
	kind?: ConstraintKind;
}): Constraint[] {
	return constraints.filter((c) => {
		if (opts.entityType && !c.appliesTo.includes(opts.entityType)) return false;
		if (opts.kind && c.kind !== opts.kind) return false;
		if (opts.intent) {
			const intentKeywords: Record<string, string[]> = {
				risk_assessment: [
					"risk",
					"burnout",
					"overload",
					"pressure",
					"dependency",
					"coverage",
				],
				prioritization: ["priority", "pressure"],
			};
			const keywords = intentKeywords[opts.intent] ?? [];
			if (keywords.length > 0) {
				const idAndDesc = `${c.id} ${c.description}`.toLowerCase();
				if (!keywords.some((k) => idAndDesc.includes(k))) return false;
			}
		}
		return true;
	});
}

export function evaluateConstraint(
	id: string,
	facts: Record<string, unknown>,
): ConstraintResult | { error: string } {
	const c = constraints.find((c) => c.id === id);
	if (!c) return { error: `Constraint '${id}' not found` };
	if (!isEvaluable(c))
		return { error: `Constraint '${id}' is metadata-only; not evaluable` };

	const missing = c.requiredFacts.filter((f) => !(f in facts));
	if (missing.length > 0) {
		return {
			triggered: false,
			severity: "low",
			evidence: "",
			explanation: "",
			missingFacts: missing,
		};
	}

	return c.evaluate(facts);
}

export function clearConstraints(): void {
	constraints.length = 0;
}

// ── project_portal scenario constraints ──

export function registerProjectPortalConstraints(): void {
	registerConstraint({
		id: "engineer_burnout_threshold",
		kind: "inference_rule",
		appliesTo: ["Engineer"],
		description: "工程师倦怠风险：senior > 80h, mid > 70h, junior > 55h",
		requiredFacts: ["workload", "seniority"],
		explanationTemplate:
			"{id} 的工作负载 {workload}h 超过了 {seniority} 级别的阈值 {threshold}h，存在倦怠风险",
		evaluate(facts) {
			const workload = facts.workload as number;
			const seniority = facts.seniority as string;
			const thresholds: Record<string, number> = {
				senior: 80,
				mid: 70,
				junior: 55,
			};
			const threshold = thresholds[seniority] ?? 70;
			const triggered = workload > threshold;
			return {
				triggered,
				severity: triggered ? "high" : "low",
				evidence: `workload=${workload}, seniority=${seniority}, threshold=${threshold}`,
				explanation: triggered
					? `工作负载 ${workload}h 超过 ${seniority} 阈值 ${threshold}h`
					: `工作负载 ${workload}h 在 ${seniority} 阈值 ${threshold}h 以内`,
				missingFacts: [],
			};
		},
	} as EvaluableConstraint);

	registerConstraint({
		id: "team_capacity_overload",
		kind: "hard_constraint",
		appliesTo: ["Team"],
		description: "团队成员数超过容量即为超载",
		requiredFacts: ["memberCount", "capacity"],
		explanationTemplate:
			"团队有 {memberCount} 名成员，容量为 {capacity}，{status}",
		evaluate(facts) {
			const memberCount = facts.memberCount as number;
			const capacity = facts.capacity as number;
			const triggered = memberCount > capacity;
			return {
				triggered,
				severity: triggered ? "high" : "low",
				evidence: `memberCount=${memberCount}, capacity=${capacity}`,
				explanation: triggered
					? `团队超载：${memberCount} 人超过容量 ${capacity}`
					: `团队未超载：${memberCount} 人，容量 ${capacity}`,
				missingFacts: [],
			};
		},
	} as EvaluableConstraint);

	registerConstraint({
		id: "project_team_load",
		kind: "inference_rule",
		appliesTo: ["Project"],
		description: "项目关联工程师的总工作负载超过 200h 表示团队超载",
		requiredFacts: ["teamLoad"],
		explanationTemplate: "项目团队总负载 {teamLoad}h，{status}",
		evaluate(facts) {
			const teamLoad = facts.teamLoad as number;
			const triggered = teamLoad > 200;
			return {
				triggered,
				severity: triggered ? "high" : "medium",
				evidence: `teamLoad=${teamLoad}`,
				explanation: triggered
					? `团队总负载 ${teamLoad}h 超过 200h 阈值`
					: `团队总负载 ${teamLoad}h 在 200h 以内`,
				missingFacts: [],
			};
		},
	} as EvaluableConstraint);

	registerConstraint({
		id: "senior_coverage",
		kind: "soft_criterion",
		appliesTo: ["Project"],
		description: "项目至少需要一名高级工程师以降低交付风险",
		requiredFacts: ["seniorCount"],
		weight: 0.8,
		explanationTemplate: "项目有 {seniorCount} 名高级工程师，{status}",
		evaluate(facts) {
			const seniorCount = facts.seniorCount as number;
			const triggered = seniorCount === 0;
			return {
				triggered,
				severity: triggered ? "high" : "low",
				evidence: `seniorCount=${seniorCount}`,
				explanation: triggered
					? "项目没有高级工程师，缺乏技术把关"
					: `项目有 ${seniorCount} 名高级工程师`,
				missingFacts: [],
			};
		},
	} as EvaluableConstraint);

	registerConstraint({
		id: "dependency_risk_propagation",
		kind: "soft_criterion",
		appliesTo: ["Project"],
		description: "依赖项目的风险会传导到被依赖项目",
		requiredFacts: ["dependencyRisk"],
		weight: 0.7,
		explanationTemplate: "依赖项目的风险等级为 {dependencyRisk}，{status}",
		evaluate(facts) {
			const depRisk = facts.dependencyRisk as string;
			const triggered = depRisk === "HIGH" || depRisk === "MEDIUM";
			return {
				triggered,
				severity: depRisk === "HIGH" ? "high" : "medium",
				evidence: `dependencyRisk=${depRisk}`,
				explanation: triggered
					? `依赖项目风险为 ${depRisk}，传导交付风险`
					: "依赖项目风险为 LOW，不影响交付",
				missingFacts: [],
			};
		},
	} as EvaluableConstraint);

	registerConstraint({
		id: "high_priority_pressure",
		kind: "soft_criterion",
		appliesTo: ["Project"],
		description: "高优先级项目对交付不确定性的容忍度更低",
		requiredFacts: ["priority"],
		weight: 0.6,
		explanationTemplate: "项目优先级为 {priority}，{status}",
		evaluate(facts) {
			const priority = facts.priority as string;
			const triggered = priority === "high";
			return {
				triggered,
				severity: triggered ? "medium" : "low",
				evidence: `priority=${priority}`,
				explanation: triggered
					? "高优先级项目对交付延迟敏感"
					: `项目优先级为 ${priority}，容忍度较高`,
				missingFacts: [],
			};
		},
	} as EvaluableConstraint);

	registerConstraint({
		id: "missing_high_impact_fact",
		kind: "explanation_policy",
		appliesTo: ["Project", "Engineer", "Team"],
		description: "当关键事实缺失时，应标注不确定性而非给出虚假结论",
		requiredFacts: [],
		explanationTemplate: "缺失事实 {missingFacts}，该结论的可信度降低",
	});
}
