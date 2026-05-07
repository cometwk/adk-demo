import { AgentMethodRegistry } from "./decorator";
import type { Graph } from "./graph";
import type { AgentState } from "./state";
import type { NextAction } from "./types";

export type ValidationResult = {
	valid: boolean;
	error?: string;
};

export class Validator {
	constructor(
		private graph: Graph,
		private agentState: AgentState<any>,
	) {}

	validate(action: NextAction): ValidationResult {
		if (action.op === "traverse") {
			const node = this.graph.getNode(action.from);
			if (!node) {
				return { valid: false, error: `Node '${action.from}' not found` };
			}
			return { valid: true };
		}

		if (action.op === "read_node") {
			const node = this.graph.getNode(action.node);
			if (!node) {
				return { valid: false, error: `Node '${action.node}' not found` };
			}
			return { valid: true };
		}

		if (action.op === "call") {
			const node = this.graph.getNode(action.node);
			if (!node) {
				return { valid: false, error: `Node '${action.node}' not found` };
			}

			const className = node.constructor.name;

			if (!AgentMethodRegistry.has(className, action.method)) {
				return {
					valid: false,
					error: `Method '${action.method}' is not an agent-accessible method on ${className}`,
				};
			}

			const schema = AgentMethodRegistry.get(className, action.method);
			if (schema) {
				// 校验 from_state 中引用的黑板 key 是否存在
				const schemaShape = this.agentState.getSchemaShape();
				if (action.from_state) {
					for (const [, stateKey] of Object.entries(action.from_state)) {
						if (!(stateKey in schemaShape)) {
							return {
								valid: false,
								error: `from_state: blackboard key '${stateKey}' not found in state schema`,
							};
						}
					}
				}

				// 解析最终参数：from_state 提供基础值，args 显式覆盖
				const stateValues = this.agentState.get();
				const fromStateArgs = action.from_state
					? Object.fromEntries(
							Object.entries(action.from_state).map(([argKey, stateKey]) => [
								argKey,
								stateValues[stateKey],
							]),
						)
					: {};
				const resolvedArgs = { ...fromStateArgs, ...(action.args ?? {}) };

				// 始终做全量校验，无论 args 是否显式传入
				const result = schema.params.safeParse(resolvedArgs);
				if (!result.success) {
					return {
						valid: false,
						error: `Args validation failed: ${JSON.stringify(result.error.issues)}`,
					};
				}
			}

			return { valid: true };
		}

		if (action.op === "update_state") {
			const schemaShape = this.agentState.getSchemaShape();
			if (!(action.key in schemaShape)) {
				return {
					valid: false,
					error: `Key '${action.key}' not in state schema`,
				};
			}
			return { valid: true };
		}

		if (action.op === "stop") {
			return { valid: true };
		}

		// TypeScript 确认所有 op 已处理，此处不应到达
		const _exhaustiveCheck: never = action;
		return {
			valid: false,
			error: `Unknown op: ${(_exhaustiveCheck as any).op}`,
		};
	}
}
