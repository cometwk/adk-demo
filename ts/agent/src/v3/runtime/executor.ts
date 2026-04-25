import { AgentMethodRegistry } from "./decorator";
import type { Graph } from "./graph";
import type { AgentState } from "./state";
import type { NextAction, Observation } from "./types";

export class Executor {
	constructor(
		private graph: Graph,
		private agentState: AgentState<any>,
	) {}

	execute(action: NextAction): Observation {
		try {
			if (action.op === "traverse") {
				const targetIds = this.graph.traverse(action.from, action.relation);
				const summaries = targetIds.map((id) => {
					const node = this.graph.getNode(id);
					if (!node)
						return { nodeId: id, className: "Unknown", methodNames: [] };
					const className = node.constructor.name;
					const methods = AgentMethodRegistry.getMethodsForClass(className);
					return {
						nodeId: id,
						className,
						methodNames: methods.map((m) => m.methodName),
					};
				});
				return { success: true, data: summaries };
			}

			if (action.op === "read_node") {
				const node = this.graph.getNode(action.node);
				if (!node) {
					throw new Error(`Node '${action.node}' not found`);
				}

				const properties = node.getProperties();

				const edges: Record<string, string[]> = {};
				for (const edge of this.graph.edges) {
					if (edge.from === action.node) {
						if (!edges[edge.type]) {
							edges[edge.type] = [];
						}
						edges[edge.type].push(edge.to);
					}
				}

				return { success: true, data: { properties, edges } };
			}

			if (action.op === "call") {
				const node = this.graph.getNode(action.node);
				if (!node) throw new Error("Node not found");

				const className = node.constructor.name;
				const schema = AgentMethodRegistry.get(className, action.method);

				if (!schema) {
					throw new Error(`Method '${action.method}' not in registry`);
				}

				const fn = (node as any)[action.method];
				if (typeof fn !== "function") {
					throw new Error("Invalid method");
				}

				// 解析最终参数：from_state 提供基础值，args 显式覆盖（与 Validator 保持一致）
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

				const parsed = schema.params.parse(resolvedArgs);
				const result =
					typeof parsed === "object" && parsed !== null
						? fn.apply(node, Object.values(parsed))
						: fn.call(node, parsed);

				return { success: true, data: result };
			}

			if (action.op === "update_state") {
				this.agentState.set(action.key, action.value);
				return { success: true, data: { updated: action.key } };
			}

			if (action.op === "stop") {
				return { success: true, data: action.reason };
			}

			return { success: false, error: "Unknown op" };
		} catch (err: any) {
			return { success: false, error: err.message };
		}
	}
}
