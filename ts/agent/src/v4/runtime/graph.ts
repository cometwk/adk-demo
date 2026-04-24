import { AgentPropertyRegistry, type MethodSchema } from "./registry";
import type { Edge } from "./types";

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
}

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

	queryNeighbors(
		nodeId: string,
		relation?: string,
		direction: "out" | "in" | "both" = "both",
	): Array<{
		nodeId: string;
		type: string;
		relation: string;
		direction: "out" | "in";
	}> {
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
					results.push({
						nodeId: e.to,
						type: target?.constructor.name ?? "Unknown",
						relation: e.type,
						direction: "out",
					});
				}
			}
		}

		if (direction === "in" || direction === "both") {
			for (const e of this.edges) {
				if (e.to === nodeId && (!relation || e.type === relation)) {
					const source = this.nodes.get(e.from);
					results.push({
						nodeId: e.from,
						type: source?.constructor.name ?? "Unknown",
						relation: e.type,
						direction: "in",
					});
				}
			}
		}

		return results;
	}
}
