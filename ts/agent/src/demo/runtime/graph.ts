import { z } from "zod";
import { Edge } from "./types";
import { agentMethod, AgentMethodRegistry, MethodSchema } from "./decorator";

export abstract class BaseNode {
  id: string;
  constructor(id: string) {
    this.id = id;
  }

  abstract getCapabilities(): MethodSchema[];
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
      .filter(e => e.from === from && e.type === relation)
      .map(e => e.to);
  }
}