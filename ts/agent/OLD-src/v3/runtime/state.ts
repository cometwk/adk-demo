import type { z } from "zod";

export class AgentState<T extends z.ZodObject<any>> {
	private schema: T;
	private data: z.infer<T>;

	constructor(schema: T) {
		this.schema = schema;
		this.data = schema.parse({});
	}

	getSchemaShape(): Record<string, z.ZodType<any>> {
		return this.schema.shape;
	}

	set<K extends keyof z.infer<T>>(key: K, value: z.infer<T>[K]): void {
		if (!(key in this.schema.shape)) {
			throw new Error(`Key '${String(key)}' not in state schema`);
		}

		const fieldSchema = this.schema.shape[key as string];
		const result = fieldSchema.safeParse(value);

		if (!result.success) {
			throw new Error(
				`Validation failed for '${String(key)}': ${result.error.message}`,
			);
		}

		(this.data as any)[key] = result.data;
	}

	get(): z.infer<T> {
		return { ...this.data };
	}

	toJSON(): string {
		return JSON.stringify(this.data, null, 2);
	}
}
