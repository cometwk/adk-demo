import { Graph } from "./graph";
import { NextAction, Observation } from "./types";
import { AgentMethodRegistry } from "./decorator";

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

        const className = node.constructor.name;
        const schema = AgentMethodRegistry.get(className, action.method);

        if (!schema) {
          throw new Error(`Method '${action.method}' not in registry`);
        }

        const fn = (node as any)[action.method];
        if (typeof fn !== "function") {
          throw new Error("Invalid method");
        }

        let result;
        if (action.args !== undefined) {
          const parsed = schema.params.parse(action.args);
          if (typeof parsed === "object" && parsed !== null) {
            const argsArray = Object.values(parsed);
            result = fn.apply(node, argsArray);
          } else {
            result = fn.call(node, parsed);
          }
        } else {
          result = fn.call(node);
        }

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