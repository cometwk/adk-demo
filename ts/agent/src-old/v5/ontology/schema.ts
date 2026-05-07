// ── Type schema (T) ──

export type TypeProperty = {
	name: string;
	type: string;
	description: string;
	agentVisible: boolean;
};

export type TypeMethod = {
	name: string;
	description: string;
};

export type TypeSchema = {
	name: string;
	description: string;
	properties: TypeProperty[];
	methods: TypeMethod[];
};

// ── Relation schema (R) ──

export type RelationSchema = {
	type: string;
	from: string;
	to: string;
	description: string;
};

// ── Ontology ──

export type Ontology = {
	types: TypeSchema[];
	relations: RelationSchema[];
};

export function getTypeSchema(
	ontology: Ontology,
	typeName: string,
): TypeSchema | undefined {
	return ontology.types.find((t) => t.name === typeName);
}

export function getRelationsFor(
	ontology: Ontology,
	typeName: string,
): RelationSchema[] {
	return ontology.relations.filter(
		(r) => r.from === typeName || r.to === typeName,
	);
}

// ── project_portal scenario ontology ──

export const projectOntology: Ontology = {
	types: [
		{
			name: "Engineer",
			description: "工程师，拥有工作负载和资历等级",
			properties: [
				{
					name: "workload",
					type: "number",
					description: "每周工作小时数",
					agentVisible: true,
				},
				{
					name: "seniority",
					type: "'junior' | 'mid' | 'senior'",
					description: "资历等级",
					agentVisible: true,
				},
			],
			methods: [
				{ name: "assessBurnoutRisk", description: "基于资历阈值评估倦怠风险" },
			],
		},
		{
			name: "Team",
			description: "团队，拥有部门和容量",
			properties: [
				{
					name: "department",
					type: "string",
					description: "所属部门",
					agentVisible: true,
				},
				{
					name: "capacity",
					type: "number",
					description: "最大并行项目数",
					agentVisible: true,
				},
			],
			methods: [{ name: "checkOverload", description: "检查团队是否超载" }],
		},
		{
			name: "Project",
			description: "项目，拥有优先级和内部截止日期压力",
			properties: [
				{
					name: "priority",
					type: "'low' | 'medium' | 'high'",
					description: "业务优先级",
					agentVisible: true,
				},
			],
			methods: [
				{
					name: "evaluateRisk",
					description: "基于团队负载、高级工程师数量和截止日期压力评估交付风险",
				},
			],
		},
	],
	relations: [
		{
			type: "member_of",
			from: "Engineer",
			to: "Team",
			description: "工程师是团队成员",
		},
		{
			type: "assigned_to",
			from: "Engineer",
			to: "Project",
			description: "工程师被分配到项目",
		},
		{
			type: "owned_by",
			from: "Project",
			to: "Team",
			description: "项目归属于团队",
		},
		{
			type: "depends_on",
			from: "Project",
			to: "Project",
			description: "项目依赖另一个项目",
		},
	],
};
