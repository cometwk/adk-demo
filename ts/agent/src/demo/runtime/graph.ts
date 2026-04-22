import { Edge } from "./types";

export abstract class BaseNode {
  id: string;
  constructor(id: string) {
    this.id = id;
  }
}

export class Person extends BaseNode {
  workload: number;

  constructor(id: string, workload: number) {
    super(id);
    this.workload = workload;
  }

  getWorkload() {
    return this.workload;
  }
}

export class Project extends BaseNode {
  deadlineRisk: number;

  constructor(id: string, deadlineRisk: number) {
    super(id);
    this.deadlineRisk = deadlineRisk;
  }

  checkRiskStatus(teamLoad: number) {
    if (teamLoad > 100 || this.deadlineRisk > 0.7) {
      return { risk: "HIGH" };
    }
    return { risk: "LOW" };
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
      .filter(e => e.from === from && e.type === relation)
      .map(e => e.to);
  }
}