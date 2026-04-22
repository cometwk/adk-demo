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

export class Person extends BaseNode {
  workload: number;

  constructor(id: string, workload: number) {
    super(id);
    this.workload = workload;
  }

  @agentMethod({
    returns: "number",
    description: "Returns the workload value for this person",
  })
  getWorkload() {
    return this.workload;
  }

  getCapabilities(): MethodSchema[] {
    return AgentMethodRegistry.getMethodsForClass("Person");
  }
}

export class Project extends BaseNode {
  deadlineRisk: number;

  constructor(id: string, deadlineRisk: number) {
    super(id);
    this.deadlineRisk = deadlineRisk;
  }

  @agentMethod({
    params: z.object({ teamLoad: z.number() }),
    returns: "{ risk: 'HIGH' | 'LOW' }",
    description: "Checks risk status based on team load and deadline risk",
  })
  checkRiskStatus(teamLoad: number) {
    if (teamLoad > 100 || this.deadlineRisk > 0.7) {
      return { risk: "HIGH" };
    }
    return { risk: "LOW" };
  }

  getCapabilities(): MethodSchema[] {
    return AgentMethodRegistry.getMethodsForClass("Project");
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