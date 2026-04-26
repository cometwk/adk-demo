import { tool } from "ai";
import { z } from "zod";
import type { Graph } from "../../runtime/graph";
import { type ToolResult, toolErr, toolOk } from "../../runtime/types";

type NodeField = "type" | "properties" | "outEdges" | "inEdges" | "methods";
const VALID_FIELDS: NodeField[] = [
	"type",
	"properties",
	"outEdges",
	"inEdges",
	"methods",
];

export function createGraphTools(graph: Graph) {
	const inspect_node = tool({
		description:
			"Inspect a node with optional field projection. Fields: type, properties, outEdges, inEdges, methods. Omit fields to get all.",
		inputSchema: z.object({
			nodeId: z.string().describe("The ID of the node to inspect"),
			fields: z
				.array(z.enum(["type", "properties", "outEdges", "inEdges", "methods"]))
				.optional()
				.describe("Specific fields to return. Omit for all fields."),
		}),
		execute: async ({ nodeId, fields }): Promise<ToolResult> => {
			const node = graph.getNode(nodeId);
			if (!node) {
				return toolErr("NOT_FOUND", `Node '${nodeId}' not found`, {
					expected: { hint: "Use search_nodes to find available nodes" },
				});
			}

			const requestedFields = fields ?? VALID_FIELDS;

			for (const f of requestedFields) {
				if (!VALID_FIELDS.includes(f)) {
					return toolErr("UNSUPPORTED_FIELD", `Field '${f}' is not supported`, {
						expected: { validFields: VALID_FIELDS },
					});
				}
			}

			const className = node.constructor.name;
			const data: Record<string, any> = {};

			if (requestedFields.includes("type")) {
				data.type = className;
			}
			if (requestedFields.includes("properties")) {
				data.properties = node.getProperties();
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
			direction: z
				.enum(["out", "in", "both"])
				.default("both")
				.describe("Edge direction filter"),
			typeFilter: z
				.string()
				.optional()
				.describe("Filter neighbors by node type name"),
			limit: z.number().optional().default(20).describe("Max results per page"),
			offset: z
				.number()
				.optional()
				.default(0)
				.describe("Offset for pagination"),
		}),
		execute: async ({
			nodeId,
			relation,
			direction,
			typeFilter,
			limit,
			offset,
		}): Promise<ToolResult> => {
			if (!graph.getNode(nodeId)) {
				return toolErr("NOT_FOUND", `Node '${nodeId}' not found`);
			}

			const result = graph.queryNeighbors(nodeId, {
				relation,
				direction,
				typeFilter,
				limit,
				offset,
			});

			if (result.items.length === 0) {
				return toolOk(
					{ neighbors: [], page: result.page },
					{
						hint: `No neighbors found for '${nodeId}'${relation ? ` with relation '${relation}'` : ""}`,
					},
				);
			}

			return toolOk({ neighbors: result.items, page: result.page });
		},
	});

	const search_nodes = tool({
		description:
			"Search graph nodes by ID substring and/or type name. Returns paginated results.",
		inputSchema: z.object({
			query: z
				.string()
				.optional()
				.describe("Substring to match against node IDs"),
			type: z
				.string()
				.optional()
				.describe("Filter by node type name (e.g. 'Project', 'Engineer')"),
			limit: z.number().optional().default(20).describe("Max results per page"),
			offset: z
				.number()
				.optional()
				.default(0)
				.describe("Offset for pagination"),
		}),
		execute: async ({ query, type, limit, offset }): Promise<ToolResult> => {
			const result = graph.searchNodes({ query, type, limit, offset });

			if (result.items.length === 0) {
				return toolOk(
					{ nodes: [], page: result.page },
					{ hint: "No nodes matched the search criteria" },
				);
			}

			return toolOk({ nodes: result.items, page: result.page });
		},
	});

	return { inspect_node, query_neighbors, search_nodes };
}
