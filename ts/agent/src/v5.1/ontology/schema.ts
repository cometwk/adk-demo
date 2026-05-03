// ── 类型 Schema (T) ──

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

// ── 关系 Schema (R) ──

export type RelationSchema = {
	type: string;
	from: string;
	to: string;
	description: string;
};

// ── 本体 ──

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

