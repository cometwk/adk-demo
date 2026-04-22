import { NextAction } from "./types";
import { Graph } from "./graph";
import { AgentMethodRegistry } from "./decorator";

export type ValidationResult = {
  valid: boolean;
  error?: string;
};

export class Validator {
  constructor(private graph: Graph) {}

  validate(action: NextAction): ValidationResult {
    if (action.op === "traverse") {
      const node = this.graph.getNode(action.from);
      if (!node) {
        return { valid: false, error: `Node '${action.from}' not found` };
      }
      return { valid: true };
    }

    if (action.op === "call") {
      const node = this.graph.getNode(action.node);
      if (!node) {
        return { valid: false, error: `Node '${action.node}' not found` };
      }

      const className = node.constructor.name;

      if (!AgentMethodRegistry.has(className, action.method)) {
        return {
          valid: false,
          error: `Method '${action.method}' is not an agent-accessible method on ${className}`,
        };
      }

      const schema = AgentMethodRegistry.get(className, action.method);
      if (schema && action.args !== undefined) {
        const result = schema.params.safeParse(action.args);
        if (!result.success) {
          return {
            valid: false,
            error: `Args validation failed: ${result.error.message}`,
          };
        }
      }

      return { valid: true };
    }

    return { valid: true };
  }
}