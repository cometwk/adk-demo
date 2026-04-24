import { AgentPropertyRegistry } from "../runtime/registry";
import type { Graph } from "../runtime/graph";

export function buildSystemPrompt(goal: string, graph: Graph): string {
	// 节点目录：ID + 类型 + 属性名列表
	const nodeLines: string[] = [];
	for (const [nodeId, node] of graph.nodes) {
		const className = node.constructor.name;
		const props = AgentPropertyRegistry.getPropertiesForClass(className);
		const propNames = props.map((p) => p.propertyName).join(", ");
		const methods = node.getCapabilities().map((m) => {
				// 简化：直接显示方法名和返回值
				return `${m.methodName} → ${m.returns}`;
			});
		const methodStr =
			methods.length > 0 ? `\n    methods: [${methods.join(", ")}]` : "";
		nodeLines.push(
			`  - ${nodeId} (${className}) props: [${propNames}]${methodStr}`,
		);
	}

	// 边类型目录
	const edgeTypes = new Set(graph.edges.map((e) => e.type));

	return `You are a graph reasoning agent. You explore a semantic graph to answer questions.
Please respond in chinese as much as possible.

GOAL: ${goal}

GRAPH OVERVIEW:
Nodes:
${nodeLines.join("\n")}

Edge types: [${[...edgeTypes].join(", ")}]

STRATEGY:
1. Start by inspecting the target node to understand its connections
2. Follow edges to discover related nodes and gather data
3. When you have enough information, call the appropriate method to compute the answer
4. Provide your final conclusion as a text response

You have 3 tools: inspect_node, query_neighbors, call_method.
Use inspect_node to read a node's properties, edges, and available methods.
Use query_neighbors to find connected nodes by relation type and direction.
Use call_method to invoke computation methods on nodes.`;
}