import { tool } from "ai";
import { z } from "zod";
import { AgentMethodRegistry } from "../runtime/registry";
import type { Graph } from "../runtime/graph";

export function createGraphTools(graph: Graph) {
	const inspect_node = tool({
		description:
			"Inspect a node to see its type, properties, connections (both outgoing and incoming edges), and available methods. Use this to explore the graph and gather data.",
		inputSchema: z.object({
			nodeId: z.string().describe("The ID of the node to inspect"),
		}),
		execute: async ({ nodeId }) => {
			const node = graph.getNode(nodeId);
			if (!node) return { error: `Node '${nodeId}' not found` };

			const className = node.constructor.name;
			const properties = node.getProperties();
			const outEdges = graph.getOutEdges(nodeId);
			const inEdges = graph.getInEdges(nodeId);
			const methods = node.getCapabilities().map((m) => ({
				name: m.methodName,
				description: m.description,
				returns: m.returns,
			}));

			return { type: className, properties, outEdges, inEdges, methods };
		},
	});

	const query_neighbors = tool({
		description:
			"Query neighbors of a node, optionally filtering by relation type and direction. Returns neighbor node IDs with their types.",
		inputSchema: z.object({
			nodeId: z.string().describe("The starting node ID"),
			relation: z
				.string()
				.optional()
				.describe("Filter by edge relation type (e.g. 'involved_in', 'depends_on')"),
			direction: z
				.enum(["out", "in", "both"])
				.default("both")
				.describe("Edge direction: 'out' for outgoing, 'in' for incoming, 'both' for all"),
		}),
		execute: async ({ nodeId, relation, direction }) => {
			if (!graph.getNode(nodeId)) return { error: `Node '${nodeId}' not found` };
			const neighbors = graph.queryNeighbors(nodeId, relation, direction);
			if (neighbors.length === 0) {
				return {
					neighbors: [],
					message: `No neighbors found for '${nodeId}'${relation ? ` with relation '${relation}'` : ""}`,
				};
			}
			return { neighbors };
		},
	});

	const call_method = tool({
		description:
			"Call a registered method on a graph node. The method must be decorated with @agentMethod. Pass the required arguments as key-value pairs in 'args'.",
		inputSchema: z.object({
			nodeId: z.string().describe("The node to call the method on"),
			method: z.string().describe("The method name to call"),
			args: z
				.record(z.string(), z.any())
				.default({})
				.describe("Arguments to pass to the method as { paramName: value }"),
		}),
		execute: async ({ nodeId, method, args }) => {
			const node = graph.getNode(nodeId);
			if (!node) return { error: `Node '${nodeId}' not found` };

			const className = node.constructor.name;
			const schema = AgentMethodRegistry.get(className, method);
			if (!schema) {
				const available = AgentMethodRegistry.getMethodsForClass(className).map((m) => m.methodName);
				return {
					error: `Method '${method}' not found on ${className}. Available: [${available.join(", ")}]`,
				};
			}

			const parseResult = schema.params.safeParse(args);
			if (!parseResult.success) {
				return {
					error: `Invalid args for ${method}: ${parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
				};
			}

			const fn = (node as any)[method];
			if (typeof fn !== "function") return { error: `${method} is not a callable function` };

			const parsed = parseResult.data;
			const result =
				typeof parsed === "object" && parsed !== null
					? fn.apply(node, Object.values(parsed))
					: fn.call(node, parsed);

			return { result };
		},
	});

	return { inspect_node, query_neighbors, call_method };
}
