// ─────────────────────────────────────────────────────────────────────────────────
// V5 本体 Schema: T (类型) 和 R (关系)
// ─────────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────────
// Type Schema: 类型定义
// ─────────────────────────────────────────────────────────────────────────────────

export type TypeSchema = {
	name: string;
	properties: PropertyDef[];
	relations: RelationDef[];
	methods: MethodDef[];
	description: string;
};

export type PropertyDef = {
	name: string;
	type: string;
	description: string;
	agentAccessible: boolean;
};

export type RelationDef = {
	name: string;
	targetType: string;
	direction: "out" | "in" | "both";
	description: string;
};

export type MethodDef = {
	name: string;
	params: ParamDef[];
	returns: string;
	description: string;
	requiredFacts: string[];
	relatedRuleIds: string[];
};

export type ParamDef = {
	name: string;
	type: string;
	required: boolean;
	description: string;
};

// ─────────────────────────────────────────────────────────────────────────────────
// Relation Schema: 关系定义
// ─────────────────────────────────────────────────────────────────────────────────

export type RelationSchemaDef = {
	name: string;
	sourceType: string;
	targetType: string;
	cardinality: "one" | "many";
	description: string;
};

// ─────────────────────────────────────────────────────────────────────────────────
// V5 预定义的 Type Schema
// ─────────────────────────────────────────────────────────────────────────────────

export const typeSchemas: Record<string, TypeSchema> = {
	Engineer: {
		name: "Engineer",
		description: "软件工程师，具有工作负载和资历等级",
		properties: [
			{
				name: "workload",
				type: "number",
				description: "每周工作小时数",
				agentAccessible: true,
			},
			{
				name: "seniority",
				type: "'junior' | 'mid' | 'senior'",
				description: "资历等级",
				agentAccessible: true,
			},
		],
		relations: [
			{
				name: "member_of",
				targetType: "Team",
				direction: "out",
				description: "所属团队",
			},
			{
				name: "assigned_to",
				targetType: "Project",
				direction: "out",
				description: "分配的项目",
			},
		],
		methods: [
			{
				name: "assessBurnoutRisk",
				params: [],
				returns: "{ risk: 'HIGH' | 'LOW'; threshold: number }",
				description:
					"根据资历阈值评估 burnout 风险 (senior: 80h, mid: 70h, junior: 55h)",
				requiredFacts: ["engineer workload", "engineer seniority"],
				relatedRuleIds: ["engineer_burnout_threshold"],
			},
		],
	},

	Team: {
		name: "Team",
		description: "团队，具有部门归属和容量限制",
		properties: [
			{
				name: "department",
				type: "string",
				description: "所属部门",
				agentAccessible: true,
			},
			{
				name: "capacity",
				type: "number",
				description: "可承载的最大并发项目数",
				agentAccessible: true,
			},
		],
		relations: [
			{
				name: "member_of",
				targetType: "Engineer",
				direction: "in",
				description: "团队成员",
			},
			{
				name: "owned_by",
				targetType: "Project",
				direction: "in",
				description: "负责的项目",
			},
		],
		methods: [
			{
				name: "checkOverload",
				params: [
					{
						name: "memberCount",
						type: "number",
						required: true,
						description: "当前活跃成员数",
					},
				],
				returns: "{ overloaded: boolean; surplus: number }",
				description: "检查团队是否超载",
				requiredFacts: ["team active member count"],
				relatedRuleIds: ["team_capacity_check"],
			},
		],
	},

	Project: {
		name: "Project",
		description: "项目，具有优先级和交付风险",
		properties: [
			{
				name: "priority",
				type: "'low' | 'medium' | 'high'",
				description: "业务优先级",
				agentAccessible: true,
			},
			{
				name: "deadlineRisk",
				type: "number",
				description: "内部截止日期压力系数",
				agentAccessible: false,
			},
		],
		relations: [
			{
				name: "assigned_to",
				targetType: "Engineer",
				direction: "in",
				description: "分配的工程师",
			},
			{
				name: "owned_by",
				targetType: "Team",
				direction: "out",
				description: "负责团队",
			},
			{
				name: "depends_on",
				targetType: "Project",
				direction: "out",
				description: "依赖项目",
			},
		],
		methods: [
			{
				name: "evaluateRisk",
				params: [
					{
						name: "teamLoad",
						type: "number",
						required: true,
						description: "团队总工作负载",
					},
					{
						name: "seniorCount",
						type: "number",
						required: true,
						description: "资深工程师数量",
					},
				],
				returns: "{ risk: 'HIGH' | 'MEDIUM' | 'LOW'; reasons: string[] }",
				description: "基于团队负载、资深工程师数量和截止日期压力评估交付风险",
				requiredFacts: [
					"assigned engineers workload",
					"assigned engineers seniority",
				],
				relatedRuleIds: [
					"project_team_load",
					"senior_coverage",
					"high_priority_pressure",
					"deadline_pressure",
				],
			},
		],
	},
};

// ─────────────────────────────────────────────────────────────────────────────────
// V5 预定义的 Relation Schema
// ─────────────────────────────────────────────────────────────────────────────────

export const relationSchemas: RelationSchemaDef[] = [
	{
		name: "member_of",
		sourceType: "Engineer",
		targetType: "Team",
		cardinality: "one",
		description: "工程师属于团队",
	},
	{
		name: "assigned_to",
		sourceType: "Engineer",
		targetType: "Project",
		cardinality: "many",
		description: "工程师分配到项目",
	},
	{
		name: "owned_by",
		sourceType: "Project",
		targetType: "Team",
		cardinality: "one",
		description: "项目归属团队",
	},
	{
		name: "depends_on",
		sourceType: "Project",
		targetType: "Project",
		cardinality: "many",
		description: "项目依赖关系",
	},
];

// ─────────────────────────────────────────────────────────────────────────────────
// Schema 查询函数
// ─────────────────────────────────────────────────────────────────────────────────

export function getTypeSchema(typeName: string): TypeSchema | undefined {
	return typeSchemas[typeName];
}

export function getAllTypeSchemas(): TypeSchema[] {
	return Object.values(typeSchemas);
}

export function getRelationSchema(
	relationName: string,
): RelationSchemaDef | undefined {
	return relationSchemas.find((r) => r.name === relationName);
}

export function getAllRelationSchemas(): RelationSchemaDef[] {
	return relationSchemas;
}

export function getRelationsForType(typeName: string): RelationDef[] {
	const typeSchema = typeSchemas[typeName];
	return typeSchema?.relations ?? [];
}
