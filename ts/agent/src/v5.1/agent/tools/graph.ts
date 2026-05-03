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
			"检查节点，支持字段投影。可用字段：type, properties, outEdges, inEdges, methods。不指定字段则返回全部。",
		inputSchema: z.object({
			nodeId: z.string().describe("要检查的节点ID"),
			fields: z
				.array(z.enum(["type", "properties", "outEdges", "inEdges", "methods"]))
				.optional()
				.describe("指定要返回的字段。不指定则返回全部字段。"),
		}),
		execute: async ({ nodeId, fields }): Promise<ToolResult> => {
			const node = graph.getNode(nodeId);
			if (!node) {
				return toolErr("NOT_FOUND", `节点 '${nodeId}' 未找到`, {
					expected: { hint: "使用 search_nodes 查找可用节点" },
				});
			}

			const requestedFields = fields ?? VALID_FIELDS;

			for (const f of requestedFields) {
				if (!VALID_FIELDS.includes(f)) {
					return toolErr("UNSUPPORTED_FIELD", `字段 '${f}' 不支持`, {
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
			"查询节点的邻居节点，支持按关系类型、方向、节点类型过滤和分页。",
		inputSchema: z.object({
			nodeId: z.string().describe("起始节点ID"),
			relation: z.string().optional().describe("按边关系类型过滤"),
			direction: z
				.enum(["out", "in", "both"])
				.default("both")
				.describe("边的方向过滤"),
			typeFilter: z
				.string()
				.optional()
				.describe("按邻居节点类型名称过滤"),
			limit: z.number().optional().default(20).describe("每页最大结果数"),
			offset: z
				.number()
				.optional()
				.default(0)
				.describe("分页偏移量"),
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
				return toolErr("NOT_FOUND", `节点 '${nodeId}' 未找到`);
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
						hint: `未找到 '${nodeId}' 的邻居节点${relation ? `（关系类型 '${relation}'）` : ""}`,
					},
				);
			}

			return toolOk({ neighbors: result.items, page: result.page });
		},
	});

	const search_nodes = tool({
		description:
			"按 ID 子串和/或类型名称搜索图谱节点。返回分页结果。",
		inputSchema: z.object({
			query: z
				.string()
				.optional()
				.describe("匹配节点 ID 的子串"),
			type: z
				.string()
				.optional()
				.describe("按节点类型名称过滤（如 'Project', 'Engineer'）"),
			limit: z.number().optional().default(20).describe("每页最大结果数"),
			offset: z
				.number()
				.optional()
				.default(0)
				.describe("分页偏移量"),
		}),
		execute: async ({ query, type, limit, offset }): Promise<ToolResult> => {
			const result = graph.searchNodes({ query, type, limit, offset });

			if (result.items.length === 0) {
				return toolOk(
					{ nodes: [], page: result.page },
					{ hint: "没有匹配搜索条件的节点" },
				);
			}

			return toolOk({ nodes: result.items, page: result.page });
		},
	});

	return { inspect_node, query_neighbors, search_nodes };
}