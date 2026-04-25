import type {
	MethodSchema,
	MethodSchemaConfig,
	PropertySchema,
	PropertySchemaConfig,
	RuleSchema,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────────
// AgentMethodRegistry: 注册 agent 可调用的方法
// ─────────────────────────────────────────────────────────────────────────────────

export class AgentMethodRegistry {
	private static methods: Map<string, MethodSchema> = new Map();

	static register(
		className: string,
		methodName: string,
		schema: MethodSchema,
	): void {
		const key = `${className}:${methodName}`;
		AgentMethodRegistry.methods.set(key, schema);
	}

	static get(className: string, methodName: string): MethodSchema | undefined {
		return AgentMethodRegistry.methods.get(`${className}:${methodName}`);
	}

	static getMethodsForClass(className: string): MethodSchema[] {
		const methods: MethodSchema[] = [];
		for (const [key, schema] of AgentMethodRegistry.methods) {
			if (key.startsWith(`${className}:`)) {
				methods.push(schema);
			}
		}
		return methods;
	}

	static has(className: string, methodName: string): boolean {
		return AgentMethodRegistry.methods.has(`${className}:${methodName}`);
	}

	static clear(): void {
		AgentMethodRegistry.methods.clear();
	}
}

// ─────────────────────────────────────────────────────────────────────────────────
// AgentPropertyRegistry: 注册 agent 可读取的属性
// ─────────────────────────────────────────────────────────────────────────────────

export class AgentPropertyRegistry {
	private static properties: Map<string, PropertySchema> = new Map();

	static register(
		className: string,
		propertyName: string,
		schema: PropertySchema,
	): void {
		const key = `${className}:${propertyName}`;
		AgentPropertyRegistry.properties.set(key, schema);
	}

	static get(
		className: string,
		propertyName: string,
	): PropertySchema | undefined {
		return AgentPropertyRegistry.properties.get(`${className}:${propertyName}`);
	}

	static getPropertiesForClass(className: string): PropertySchema[] {
		const props: PropertySchema[] = [];
		for (const [key, schema] of AgentPropertyRegistry.properties) {
			if (key.startsWith(`${className}:`)) {
				props.push(schema);
			}
		}
		return props;
	}

	static has(className: string, propertyName: string): boolean {
		return AgentPropertyRegistry.properties.has(`${className}:${propertyName}`);
	}

	static clear(): void {
		AgentPropertyRegistry.properties.clear();
	}
}

// ─────────────────────────────────────────────────────────────────────────────────
// RuleRegistry: 注册可查询的规则/准则 (V5 新增)
// ─────────────────────────────────────────────────────────────────────────────────

export class RuleRegistry {
	private static rules: Map<string, RuleSchema> = new Map();

	static register(schema: RuleSchema): void {
		RuleRegistry.rules.set(schema.id, schema);
	}

	static get(id: string): RuleSchema | undefined {
		return RuleRegistry.rules.get(id);
	}

	static getAll(): RuleSchema[] {
		return Array.from(RuleRegistry.rules.values());
	}

	static filter(predicate: (rule: RuleSchema) => boolean): RuleSchema[] {
		return RuleRegistry.getAll().filter(predicate);
	}

	static clear(): void {
		RuleRegistry.rules.clear();
	}
}

export type { RuleSchema } from "./types";
