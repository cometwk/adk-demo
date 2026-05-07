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

	traverse(from: string, relation: string): string[] {
		return this.edges
			.filter((e) => e.from === from && e.type === relation)
			.map((e) => e.to);
	}
}
