import { NextAction } from "./types";
import { Graph } from "./graph";

export class Validator {
  constructor(private graph: Graph) {}

  validate(action: NextAction): boolean {
    if (action.op === "traverse") {
      return this.graph.getNode(action.from) !== undefined;
    }

    if (action.op === "call") {
      const node = this.graph.getNode(action.node);
      return node && typeof (node as any)[action.method] === "function" || false;
    }

    return true;
  }
}