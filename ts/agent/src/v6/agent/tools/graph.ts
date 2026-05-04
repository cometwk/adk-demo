import { tool } from "ai";
import { z } from "zod";
import type { Graph } from "../../runtime/graph";
import type { FactStore } from "../../runtime/eventStore";
import { type ToolResult, toolErr, toolOk } from "../../runtime/types";
import type { PolicyContext } from "../../policy/context";
import {
	checkEntityAccess,
	checkTypeAccess,
	maybeLogToolCall,
	redactProperties,
} from "../../policy/filters";

type NodeField = "type" | "properties" | "outEdges" | "inEdges" | "methods";
const VALID_FIELDS: NodeField[] = [
	"type",
	"properties",
	"outEdges",
	"inEdges",
	"methods",
];

export function createGraphTools(
	graph: Graph,
	policy: PolicyContext,
	facts?: FactStore,
) {
	const inspect_node = tool({
		description:
			"Inspect a graph node. Fields: type, properties, outEdges, inEdges, methods. " +
			"Optional `at` (ISO 8601) for time-travel: if provided and a FactStore is available, " +
			"bound facts override graph properties.",
		inputSchema: z.object({
			nodeId: z.string().describe("The ID of the node to inspect"),
			fields: z
				.array(z.enum(["type", "properties", "outEdges", "inEdges", "methods"]))
				.optional()
				.describe("Specific fields to return. Omit for all."),
			at: z
				.string()
				.optional()
				.describe("ISO 8601 timestamp for time-travel (diagnostic mode)"),
		}),
		execute: async ({ nodeId, fields, at }): Promise<ToolResult> => {
			maybeLogToolCall("inspect_node", { nodeId, fields, at }, policy);

			if (!checkEntityAccess(nodeId, policy)) {
				return toolErr("POLICY_DENIED", `Access to entity '${nodeId}' is denied by policy`);
			}

			const node = graph.getNode(nodeId);
			if (!node) {
				return toolErr("NOT_FOUND", `Node '${nodeId}' not found`, {
					expected: { hint: "Use search_nodes to find available nodes" },
				});
			}

			const typeName = node.constructor.name;
			if (!checkTypeAccess(typeName, policy)) {
				return toolErr("POLICY_DENIED", `Access to type '${typeName}' is denied by policy`);
			}

			const requestedFields = fields ?? VALID_FIELDS;
			const data: Record<string, unknown> = {};

			if (requestedFields.includes("type")) {
				data.type = typeName;
			}
			if (requestedFields.includes("properties")) {
				let props = node.getProperties();
				// Time-travel: override with bound facts if `at` is provided and facts exist
				if (at && facts) {
					const boundFacts = facts.forEntity(nodeId);
					for (const bf of boundFacts) {
						props = { ...props, [bf.property]: bf.value };
					}
				} else if (facts) {
					// Always overlay FactStore bindings over graph properties
					const boundFacts = facts.forEntity(nodeId);
					for (const bf of boundFacts) {
						props = { ...props, [bf.property]: bf.value };
					}
				}
				data.properties = redactProperties(props, policy);
			}
			if (requestedFields.includes("outEdges")) {
				data.outEdges = graph.getOutEdges(nodeId);
			}
			if (requestedFields.includes("inEdges")) {
				data.inEdges = graph.getInEdges(nodeId);
			}
			if (requestedFields.includes("methods")) {
				data.methods = node.getCapabilities().map((m) => ({
					name: m.methodName,
					description: m.description,
					returns: m.returns,
					requiredFacts: m.requiredFacts ?? [],
					preconditions: m.preconditions ?? [],
				}));
			}

			return toolOk(data);
		},
	});

	const query_neighbors = tool({
		description:
			"Query neighbors of a node with optional filtering by relation, direction, type, and pagination.",
		inputSchema: z.object({
			nodeId: z.string().describe("The starting node ID"),
			relation: z.string().optional().describe("Filter by edge relation type"),
			direction: z.enum(["out", "in", "both"]).default("both").describe("Edge direction filter"),
			typeFilter: z.string().optional().describe("Filter neighbors by node type name"),
			limit: z.number().optional().default(20).describe("Max results per page"),
			offset: z.number().optional().default(0).describe("Offset for pagination"),
		}),
		execute: async ({ nodeId, relation, direction, typeFilter, limit, offset }): Promise<ToolResult> => {
			maybeLogToolCall("query_neighbors", { nodeId, relation, direction }, policy);

			if (!checkEntityAccess(nodeId, policy)) {
				return toolErr("POLICY_DENIED", `Access to entity '${nodeId}' is denied by policy`);
			}
			if (!graph.getNode(nodeId)) {
				return toolErr("NOT_FOUND", `Node '${nodeId}' not found`);
			}

			const result = graph.queryNeighbors(nodeId, { relation, direction, typeFilter, limit, offset });
			const filteredItems = result.items.filter(
				(n) => checkEntityAccess(n.nodeId, policy) && checkTypeAccess(n.type, policy),
			);

			return toolOk({ neighbors: filteredItems, page: result.page });
		},
	});

	const search_nodes = tool({
		description: "Search graph nodes by ID substring and/or type name. Returns paginated results.",
		inputSchema: z.object({
			query: z.string().optional().describe("Substring to match against node IDs"),
			type: z.string().optional().describe("Filter by node type name (e.g. 'Project', 'Engineer')"),
			limit: z.number().optional().default(20).describe("Max results per page"),
			offset: z.number().optional().default(0).describe("Offset for pagination"),
		}),
		execute: async ({ query, type, limit, offset }): Promise<ToolResult> => {
			maybeLogToolCall("search_nodes", { query, type }, policy);

			const result = graph.searchNodes({ query, type, limit, offset });
			const filteredItems = result.items.filter(
				(n) => checkEntityAccess(n.nodeId, policy) && checkTypeAccess(n.type, policy),
			);

			return toolOk({ nodes: filteredItems, page: result.page });
		},
	});

	return { inspect_node, query_neighbors, search_nodes };
}
