import {
	registerConstraint,
	type EvaluableConstraint,
} from "../../ontology/constraints";

// ── project_portal 场景约束 ──

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