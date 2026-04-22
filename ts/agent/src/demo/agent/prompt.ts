import { zodToJsonSchema } from "zod-to-json-schema";
import { Graph } from "../runtime/graph";
import { MethodSchema } from "../runtime/decorator";

function formatCapabilities(graph: Graph): string {
  const lines: string[] = [];

  for (const [nodeId, node] of graph.nodes) {
    const className = node.constructor.name;
    const capabilities = node.getCapabilities();

    if (capabilities.length === 0) continue;

    lines.push(`${className} (${nodeId}):`);

    for (const cap of capabilities) {
      const paramsSchema = zodToJsonSchema(cap.params) as any;
      const paramsStr = JSON.stringify(paramsSchema.properties || {});
      lines.push(`  - ${cap.methodName}(params: ${paramsStr}, returns: ${cap.returns})`);
      lines.push(`    ${cap.description}`);
    }
  }

  return lines.join("\n");
}

export function buildPrompt(goal: string, history: any[], graph: Graph): string {
  const capabilitiesBlock = formatCapabilities(graph);

  return `
You are a reasoning agent.

GOAL:
${goal}

AVAILABLE CAPABILITIES:
${capabilitiesBlock}

RULES:
- You can ONLY output ONE JSON action
- Do NOT assume facts
- If missing info → explore
- If confident → stop

Available actions:
1. traverse { from, relation }
2. call { node, method, args }
3. stop { reason }

History:
${JSON.stringify(history, null, 2)}

Respond ONLY JSON:
`;
}