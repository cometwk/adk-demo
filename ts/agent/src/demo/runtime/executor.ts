import { Graph } from "./graph";
import { NextAction, Observation } from "./types";

export class Executor {
  constructor(private graph: Graph) {}

  execute(action: NextAction): Observation {
    try {
      if (action.op === "traverse") {
        const result = this.graph.traverse(action.from, action.relation);
        return { success: true, data: result };
      }

      if (action.op === "call") {
        const node = this.graph.getNode(action.node);
        if (!node) throw new Error("Node not found");

        const fn = (node as any)[action.method];
        if (typeof fn !== "function") {
          throw new Error("Invalid method");
        }

        const result = fn.call(node, action.args);
        return { success: true, data: result };
      }

      if (action.op === "stop") {
        return { success: true, data: action.reason };
      }

      return { success: false, error: "Unknown op" };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}