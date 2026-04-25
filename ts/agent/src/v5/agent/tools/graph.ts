import { tool } from "ai";
import { z } from "zod";
import { failure, paginated, success } from "../../runtime/decorator";
import type { Graph, NodeField } from "../../runtime/graph";
import type { ToolResult } from "../../runtime/types";

// ─────────────────────────────────────────────────────────────────────────────────
// V5 图访问工具：渐进式实体披露
// 所有工具返回统一的 ToolResult 格式
// ─────────────────────────────────────────────────────────────────────────────────

export function createGraphTools(graph: Graph) {
	const search_nodes = tool({
		description:
			"Search for nodes in the graph by ID substring, type, or relation to another node. Returns paginated results.",
		inputSchema: z.object({
			query: z
				.string()
				.optional()
				.describe("Substring to match node IDs (case-insensitive)"),
			type: z
				.string()
				.optional()
				.describe("Filter by node type (e.g. 'Project', 'Engineer', 'Team')"),
			relatedTo: z
				.string()
				.optional()
				.describe("Only return nodes related to this entity ID"),
			limit: z.number().default(10).describe("Maximum results per page"),
			offset: z.number().default(0).describe("Offset for pagination"),
		}),
		execute: async ({
			query,
			type,
			relatedTo,
			limit,
			offset,
		}): Promise<ToolResult<Array<{ nodeId: string; type: string }>>> => {
			const results = graph.searchNodes({ query, type, relatedTo });

			if (results.length === 0) {
				return failure("empty_result", "No matching nodes found", false);
			}

			const page = results.slice(offset, offset + limit);
			const hasMore = offset + page.length < results.length;

			return success(page, {
				page: { limit, offset, total: results.length, hasMore },
			});
		},
	});

	const inspect_node = tool({
		description:
			"Inspect a node to see specific fields: type, properties, edges, methods. Use 'fields' to request only what you need.",
		inputSchema: z.object({
			nodeId: z.string().describe("The ID of the node to inspect"),
			fields: z
				.array(z.enum(["type", "properties", "inEdges", "outEdges", "methods"]))
				.optional()
				.default(["type", "properties", "methods"])
				.describe("Fields to return. Default: type, properties, methods"),
		}),
		execute: async ({
			nodeId,
			fields,
		}): Promise<ToolResult<Record<NodeField, any>>> => {
			const node = graph.getNode(nodeId);
			if (!node) {
				return failure("not_found", `Node '${nodeId}' not found`, false);
			}

			const result = graph.getNodeFields(nodeId, fields as NodeField[]);
			if (!result) {
				return failure("internal_failure", "Failed to get node fields", false);
			}

			return success(result);
		},
	});

	const query_neighbors = tool({
		description:
			"Query neighbors of a node with optional filters for relation type, direction, target type, and pagination.",
		inputSchema: z.object({
			nodeId: z.string().describe("The starting node ID"),
			relation: z
				.string()
				.optional()
				.describe(
					"Filter by edge relation type (e.g. 'depends_on', 'assigned_to')",
				),
			direction: z
				.enum(["out", "in", "both"])
				.default("both")
				.describe(
					"Edge direction: 'out' for outgoing, 'in' for incoming, 'both' for all",
				),
			targetType: z
				.string()
				.optional()
				.describe("Filter by neighbor node type (e.g. 'Project', 'Engineer')"),
			limit: z.number().default(10).describe("Maximum neighbors per page"),
			offset: z.number().default(0).describe("Offset for pagination"),
		}),
		execute: async ({
			nodeId,
			relation,
			direction,
			targetType,
			limit,
			offset,
		}): Promise<
			ToolResult<
				Array<{
					nodeId: string;
					type: string;
					relation: string;
					direction: "out" | "in";
				}>
			>
		> => {
			const node = graph.getNode(nodeId);
			if (!node) {
				return failure("not_found", `Node '${nodeId}' not found`, false);
			}

			const allNeighbors = graph.queryNeighbors(nodeId, {
				relation,
				direction,
				targetType,
			});

			if (allNeighbors.length === 0) {
				return failure(
					"empty_result",
					`No neighbors found for '${nodeId}' with given filters`,
					false,
				);
			}

			const page = allNeighbors.slice(offset, offset + limit);
			const hasMore = offset + page.length < allNeighbors.length;

			return success(page, {
				page: { limit, offset, total: allNeighbors.length, hasMore },
			});
		},
	});

	return { search_nodes, inspect_node, query_neighbors };
}

// ─────────────────────────────────────────────────────────────────────────────────
// 导出工具类型
// ─────────────────────────────────────────────────────────────────────────────────

export type GraphTools = ReturnType<typeof createGraphTools>;
