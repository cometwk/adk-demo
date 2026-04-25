import { AgentMethodRegistry, AgentPropertyRegistry } from "./registry";
import type { Edge, MethodSchema, NodeId } from "./types";

// ─────────────────────────────────────────────────────────────────────────────────
// BaseNode: 所有图节点的基类
// ─────────────────────────────────────────────────────────────────────────────────

export abstract class BaseNode {
	id: string;
	constructor(id: string) {
		this.id = id;
	}

	abstract getCapabilities(): MethodSchema[];

	getProperties(): Record<string, any> {
		const className = this.constructor.name;
		const propSchemas = AgentPropertyRegistry.getPropertiesForClass(className);
		const result: Record<string, any> = {};
		for (const schema of propSchemas) {
			result[schema.propertyName] = (this as any)[schema.propertyName];
		}
		return result;
	}

	getType(): string {
		return this.constructor.name;
	}
}

// ─────────────────────────────────────────────────────────────────────────────────
// Graph: 语义图，支持分页和字段投影 (V5 扩展)
// ─────────────────────────────────────────────────────────────────────────────────

export type NodeField =
	| "type"
	| "properties"
	| "inEdges"
	| "outEdges"
	| "methods";

export class Graph {
	nodes = new Map<string, BaseNode>();
	edges: Edge[] = [];

	addNode(node: BaseNode) {
		this.nodes.set(node.id, node);
	}

	addEdge(edge: Edge) {
		this.edges.push(edge);
	}

	getNode(id: string) {
		return this.nodes.get(id);
	}

	getNodeIds(): string[] {
		return Array.from(this.nodes.keys());
	}

	getOutEdges(nodeId: string): Record<string, string[]> {
		const result: Record<string, string[]> = {};
		for (const e of this.edges) {
			if (e.from === nodeId) {
				(result[e.type] ??= []).push(e.to);
			}
		}
		return result;
	}

	getInEdges(nodeId: string): Record<string, string[]> {
		const result: Record<string, string[]> = {};
		for (const e of this.edges) {
			if (e.to === nodeId) {
				(result[e.type] ??= []).push(e.from);
			}
		}
		return result;
	}

	// V5 扩展：支持分页、方向、类型过滤的邻居查询
	queryNeighbors(
		nodeId: string,
		options?: {
			relation?: string;
			direction?: "out" | "in" | "both";
			targetType?: string;
			limit?: number;
			offset?: number;
		},
	): Array<{
		nodeId: string;
		type: string;
		relation: string;
		direction: "out" | "in";
	}> {
		const {
			relation,
			direction = "both",
			targetType,
			limit,
			offset = 0,
		} = options ?? {};
		const results: Array<{
			nodeId: string;
			type: string;
			relation: string;
			direction: "out" | "in";
		}> = [];

		if (direction === "out" || direction === "both") {
			for (const e of this.edges) {
				if (e.from === nodeId && (!relation || e.type === relation)) {
					const target = this.nodes.get(e.to);
					if (!targetType || target?.constructor.name === targetType) {
						results.push({
							nodeId: e.to,
							type: target?.constructor.name ?? "Unknown",
							relation: e.type,
							direction: "out",
						});
					}
				}
			}
		}

		if (direction === "in" || direction === "both") {
			for (const e of this.edges) {
				if (e.to === nodeId && (!relation || e.type === relation)) {
					const source = this.nodes.get(e.from);
					if (!targetType || source?.constructor.name === targetType) {
						results.push({
							nodeId: e.from,
							type: source?.constructor.name ?? "Unknown",
							relation: e.type,
							direction: "in",
						});
					}
				}
			}
		}

		// 应用分页
		if (limit !== undefined) {
			return results.slice(offset, offset + limit);
		}
		return results.slice(offset);
	}

	// V5 新增：按条件搜索节点
	searchNodes(options?: {
		query?: string;
		type?: string;
		relatedTo?: string;
		limit?: number;
		offset?: number;
	}): Array<{ nodeId: string; type: string }> {
		const { query, type, relatedTo, limit, offset = 0 } = options ?? {};
		const results: Array<{ nodeId: string; type: string }> = [];

		// 如果有 relatedTo，先找出相关的节点
		const relatedNodeIds = new Set<string>();
		if (relatedTo) {
			for (const neighbor of this.queryNeighbors(relatedTo)) {
				relatedNodeIds.add(neighbor.nodeId);
			}
		}

		for (const [id, node] of this.nodes) {
			// 类型过滤
			if (type && node.constructor.name !== type) continue;

			// 关键词过滤 (ID substring)
			if (query && !id.toLowerCase().includes(query.toLowerCase())) continue;

			// 相关性过滤
			if (relatedTo && !relatedNodeIds.has(id)) continue;

			results.push({ nodeId: id, type: node.constructor.name });
		}

		// 应用分页
		if (limit !== undefined) {
			return results.slice(offset, offset + limit);
		}
		return results.slice(offset);
	}

	// V5 新增：获取节点特定字段
	getNodeFields(
		nodeId: string,
		fields: NodeField[],
	): Record<NodeField, any> | undefined {
		const node = this.nodes.get(nodeId);
		if (!node) return undefined;

		const result: Record<NodeField, any> = {} as Record<NodeField, any>;

		for (const field of fields) {
			switch (field) {
				case "type":
					result[field] = node.constructor.name;
					break;
				case "properties":
					result[field] = node.getProperties();
					break;
				case "inEdges":
					result[field] = this.getInEdges(nodeId);
					break;
				case "outEdges":
					result[field] = this.getOutEdges(nodeId);
					break;
				case "methods":
					result[field] = node.getCapabilities().map((m) => m.methodName);
					break;
			}
		}

		return result;
	}
}
