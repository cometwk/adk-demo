import { zodToJsonSchema } from "zod-to-json-schema";
import { AgentPropertyRegistry } from "../runtime/registry";
import type { Graph } from "../runtime/graph";

export function buildSystemPrompt(goal: string, graph: Graph): string {
	const nodeLines: string[] = [];
	for (const [nodeId, node] of graph.nodes) {
		const className = node.constructor.name;
		const props = AgentPropertyRegistry.getPropertiesForClass(className);
		const propNames = props.map((p) => p.propertyName).join(", ");

		const methods = node.getCapabilities().map((m) => {
			const schema = zodToJsonSchema(m.params as any) as any;
			const paramsStr = JSON.stringify(schema.properties ?? {});
			return `${m.methodName}(${paramsStr}) → ${m.returns}`;
		});
		const methodStr = methods.length > 0 ? `  methods: [${methods.join(", ")}]` : "";

		nodeLines.push(`  - ${nodeId} (${className}) props: [${propNames}]${methodStr}`);
	}

	const edgeTypes = [...new Set(graph.edges.map((e) => e.type))];

	return `You are a graph reasoning agent. You explore a semantic graph to answer questions.
Please respond in chinese as much as possible.

GOAL: ${goal}

GRAPH OVERVIEW:
Nodes:
${nodeLines.join("\n")}

Edge types: [${edgeTypes.join(", ")}]

STRATEGY:
1. Start by inspecting the target node to understand its connections
2. Follow edges to discover related nodes and gather data
3. When you have enough information, call the appropriate method to compute the answer
4. Provide your final conclusion as a text response

You have 3 tools: inspect_node, query_neighbors, call_method.
- inspect_node: read a node's properties, edges, and available methods
- query_neighbors: find connected nodes by relation type and direction (out/in/both)
- call_method: invoke computation methods on nodes with the required arguments`;
}
