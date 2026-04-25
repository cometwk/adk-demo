import { agentRule, RuleRegistry } from "../runtime/decorator";
import type { RuleSchema } from "../runtime/types";

// ─────────────────────────────────────────────────────────────────────────────────
// Constraint Kind: 规则类型
// ─────────────────────────────────────────────────────────────────────────────────

export type ConstraintKind =
	| "hard_constraint"
	| "soft_criterion"
	| "inference_rule"
	| "conflict_policy"
	| "explanation_policy";

// ─────────────────────────────────────────────────────────────────────────────────
// Constraint: 规则/准则定义
// ─────────────────────────────────────────────────────────────────────────────────

export type Constraint = RuleSchema & {
	kind: ConstraintKind;
	explanationTemplate: string;
};

// ─────────────────────────────────────────────────────────────────────────────────
// V5 预定义的 Constraints (C)
// 用于 project_portal 交付风险评估场景
// ─────────────────────────────────────────────────────────────────────────────────

// ─── 硬约束 ───────────────────────────────────────────────────────────────────────

export const hardConstraints: Constraint[] = [
	{
		id: "engineer_burnout_threshold",
		kind: "hard_constraint",
		appliesTo: ["Engineer"],
		description:
			"工程师工作负载超出资历阈值时触发 burnout 风险 (senior: 80h, mid: 70h, junior: 55h)",
		requiredFacts: ["engineer workload", "engineer seniority"],
		weight: 1.0,
		priority: 1,
		explanationTemplate:
			"{engineer} 的 workload 为 {workload}h，超过 {seniority} 阈值 {threshold}h，触发 burnout 风险",
	},
];

// ─── 软准则 ───────────────────────────────────────────────────────────────────────

export const softCriteria: Constraint[] = [
	{
		id: "project_team_load",
		kind: "soft_criterion",
		appliesTo: ["Project"],
		description: "项目团队总工作负载 > 200h 时显著影响交付风险",
		requiredFacts: ["assigned engineers workload sum"],
		weight: 0.8,
		priority: 2,
		explanationTemplate:
			"项目 {project} 的团队总负载为 {teamLoad}h，{threshold}",
	},
	{
		id: "senior_coverage",
		kind: "soft_criterion",
		appliesTo: ["Project"],
		description: "项目分配的资深工程师数量为 0 时风险显著升高",
		requiredFacts: ["assigned engineers seniority count"],
		weight: 0.7,
		priority: 2,
		explanationTemplate:
			"项目 {project} 有 {seniorCount} 名资深工程师，{assessment}",
	},
	{
		id: "dependency_risk_propagation",
		kind: "soft_criterion",
		appliesTo: ["Project"],
		description: "依赖项目的风险会传导到当前项目",
		requiredFacts: ["depends_on project risk"],
		weight: 0.6,
		priority: 3,
		explanationTemplate:
			"项目 {project} 依赖 {dependency}，依赖项目风险为 {dependencyRisk}，传导风险",
	},
	{
		id: "high_priority_pressure",
		kind: "soft_criterion",
		appliesTo: ["Project"],
		description: "高优先级项目的风险容忍度较低",
		requiredFacts: ["project priority"],
		weight: 0.5,
		priority: 2,
		explanationTemplate: "项目 {project} 优先级为 {priority}，风险容忍度降低",
	},
	{
		id: "deadline_pressure",
		kind: "soft_criterion",
		appliesTo: ["Project"],
		description: "截止日期压力 > 0.75 时为 critical，> 0.5 时为 elevated",
		requiredFacts: ["project deadline pressure"],
		weight: 0.9,
		priority: 1,
		explanationTemplate:
			"项目 {project} 的截止日期压力系数为 {deadlineRisk}，{pressureLevel}",
	},
];

// ─── 推导规则 ───────────────────────────────────────────────────────────────────────

export const inferenceRules: Constraint[] = [
	{
		id: "team_capacity_check",
		kind: "inference_rule",
		appliesTo: ["Team"],
		description: "团队活跃成员数超过 capacity 时为超载状态",
		requiredFacts: ["team active member count", "team capacity"],
		weight: 0.5,
		priority: 3,
		explanationTemplate:
			"团队 {team} 容量为 {capacity}，当前活跃成员数为 {memberCount}，{overloadStatus}",
	},
	{
		id: "risk_aggregation",
		kind: "inference_rule",
		appliesTo: ["Project"],
		description:
			"综合风险由多个因素加权计算：teamLoad, seniorCount, deadlineRisk, dependencyRisk",
		requiredFacts: [
			"teamLoad",
			"seniorCount",
			"deadlineRisk",
			"dependencyRisk",
		],
		weight: 1.0,
		priority: 1,
		explanationTemplate:
			"项目 {project} 的综合风险评分由 {factors} 加权计算得出",
	},
];

// ─── 冲突处理规则 ───────────────────────────────────────────────────────────────────────

export const conflictPolicies: Constraint[] = [
	{
		id: "priority_vs_capacity",
		kind: "conflict_policy",
		appliesTo: ["Project"],
		description: "高优先级项目与团队容量冲突时，优先保障高优先级项目资源",
		requiredFacts: ["project priority", "team capacity"],
		weight: 0.4,
		priority: 4,
		explanationTemplate:
			"项目 {project} 高优先级与团队容量冲突，优先保障高优先级",
	},
];

// ─── 解释规则 ───────────────────────────────────────────────────────────────────────

export const explanationPolicies: Constraint[] = [
	{
		id: "cite_evidence_ids",
		kind: "explanation_policy",
		appliesTo: ["DecisionOutput"],
		description: "最终回答必须引用证据 ID，便于审计",
		requiredFacts: ["evidence records"],
		weight: 1.0,
		priority: 1,
		explanationTemplate: "建议引用证据: {evidenceIds}",
	},
	{
		id: "cite_rule_ids",
		kind: "explanation_policy",
		appliesTo: ["DecisionOutput"],
		description: "最终回答必须引用触发规则 ID",
		requiredFacts: ["triggered rules"],
		weight: 1.0,
		priority: 1,
		explanationTemplate: "触发规则: {ruleIds}",
	},
	{
		id: "missing_fact_uncertainty",
		kind: "explanation_policy",
		appliesTo: ["DecisionOutput"],
		description: "高影响事实缺失时必须显式说明，不能假装确定",
		requiredFacts: ["missing facts"],
		weight: 1.0,
		priority: 1,
		explanationTemplate: "缺失高影响事实: {missingFacts}，可能影响: {impact}",
	},
];

// ─────────────────────────────────────────────────────────────────────────────────
// 初始化：注册所有规则
// ─────────────────────────────────────────────────────────────────────────────────

export function initializeConstraints(): void {
	RuleRegistry.clear();

	for (const c of hardConstraints) {
		agentRule(c);
	}
	for (const c of softCriteria) {
		agentRule(c);
	}
	for (const c of inferenceRules) {
		agentRule(c);
	}
	for (const c of conflictPolicies) {
		agentRule(c);
	}
	for (const c of explanationPolicies) {
		agentRule(c);
	}
}

// ─────────────────────────────────────────────────────────────────────────────────
// 规则查询函数
// ─────────────────────────────────────────────────────────────────────────────────

export function getRuleById(id: string): Constraint | undefined {
	return RuleRegistry.get(id) as Constraint | undefined;
}

export function getAllRules(): Constraint[] {
	return RuleRegistry.getAll() as Constraint[];
}

export function filterRules(
	intent?: string,
	entityType?: string,
	kind?: ConstraintKind,
): Constraint[] {
	return RuleRegistry.filter((rule) => {
		// Intent 过滤 (目前只支持 risk_assessment)
		if (intent && intent === "risk_assessment") {
			const riskIds = [
				"engineer_burnout_threshold",
				"project_team_load",
				"senior_coverage",
				"dependency_risk_propagation",
				"high_priority_pressure",
				"deadline_pressure",
				"risk_aggregation",
				"missing_fact_uncertainty",
			];
			if (!riskIds.includes(rule.id)) return false;
		}

		// Entity type 过滤
		if (entityType && !rule.appliesTo.includes(entityType)) return false;

		// Kind 过滤
		if (kind && rule.kind !== kind) return false;

		return true;
	}) as Constraint[];
}

export function getRulesByKind(kind: ConstraintKind): Constraint[] {
	return filterRules(undefined, undefined, kind);
}

export function getRulesForEntity(entityType: string): Constraint[] {
	return filterRules(undefined, entityType);
}

export function getRiskAssessmentRules(entityType?: string): Constraint[] {
	return filterRules("risk_assessment", entityType);
}

// ─────────────────────────────────────────────────────────────────────────────────
// 规则元数据验证
// ─────────────────────────────────────────────────────────────────────────────────

export function validateRule(rule: Constraint): {
	valid: boolean;
	errors: string[];
} {
	const errors: string[] = [];

	if (!rule.id || rule.id.trim() === "") {
		errors.push("Rule must have non-empty id");
	}

	if (!rule.kind) {
		errors.push("Rule must have kind");
	}

	if (!rule.appliesTo || rule.appliesTo.length === 0) {
		errors.push("Rule must have at least one appliesTo type");
	}

	if (!rule.description || rule.description.trim() === "") {
		errors.push("Rule must have non-empty description");
	}

	if (!rule.requiredFacts || rule.requiredFacts.length === 0) {
		errors.push("Rule must have at least one requiredFact");
	}

	return { valid: errors.length === 0, errors };
}

export function validateAllRules(): {
	valid: boolean;
	errors: Map<string, string[]>;
} {
	const errors = new Map<string, string[]>();
	const rules = getAllRules();

	for (const rule of rules) {
		const result = validateRule(rule);
		if (!result.valid) {
			errors.set(rule.id, result.errors);
		}
	}

	return { valid: errors.size === 0, errors };
}
