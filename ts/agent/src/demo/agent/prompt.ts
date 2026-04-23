import { zodToJsonSchema } from "zod-to-json-schema";
import {
	AgentPropertyRegistry,
	MethodSchema,
	PropertySchema,
} from "../runtime/decorator";
import type { Graph } from "../runtime/graph";
import type { AgentState } from "../runtime/state";

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
			lines.push(
				`  - ${cap.methodName}(params: ${paramsStr}, returns: ${cap.returns})`,
			);
			lines.push(`    ${cap.description}`);
		}
	}

	return lines.join("\n");
}

function formatProperties(graph: Graph): string {
	const lines: string[] = [];

	for (const [nodeId, node] of graph.nodes) {
		const className = node.constructor.name;
		const props = AgentPropertyRegistry.getPropertiesForClass(className);

		if (props.length === 0) continue;

		lines.push(`${className} (${nodeId}):`);

		for (const prop of props) {
			lines.push(
				`  - ${prop.propertyName}: ${prop.returns} — ${prop.description}`,
			);
		}
	}

	return lines.join("\n");
}

function formatTopology(graph: Graph): string {
	const lines: string[] = [];

	const edgesByFrom: Record<string, Record<string, string[]>> = {};

	for (const edge of graph.edges) {
		if (!edgesByFrom[edge.from]) {
			edgesByFrom[edge.from] = {};
		}
		if (!edgesByFrom[edge.from][edge.type]) {
			edgesByFrom[edge.from][edge.type] = [];
		}
		edgesByFrom[edge.from][edge.type].push(edge.to);
	}

	for (const [from, relations] of Object.entries(edgesByFrom)) {
		for (const [relation, targets] of Object.entries(relations)) {
			lines.push(`${from}: ${relation} → [${targets.join(", ")}]`);
		}
	}

	return lines.join("\n");
}

function formatBlackboard(state: AgentState<any>): string {
	return state.toJSON();
}

export function buildPrompt(
	goal: string,
	graph: Graph,
	state: AgentState<any>,
	lastObservation: string,
): string {
	const capabilitiesBlock = formatCapabilities(graph);
	const propertiesBlock = formatProperties(graph);
	const topologyBlock = formatTopology(graph);
	const blackboardBlock = formatBlackboard(state);

	return `
You are a reasoning agent.

GOAL:
${goal}

AVAILABLE CAPABILITIES:
${capabilitiesBlock || "(none)"}

AVAILABLE PROPERTIES:
${propertiesBlock || "(none)"}

AVAILABLE TOPOLOGY:
${topologyBlock || "(none)"}

CURRENT BLACKBOARD STATE:
${blackboardBlock}

LAST OBSERVATION:
${lastObservation}

RULES:
- You can ONLY output ONE JSON action
- Do NOT assume facts
- If missing info → explore
- If confident → stop

Available actions:
1. traverse { from, relation }
2. read_node { node }
3. call { node, method, args }
4. update_state { key, value }
5. stop { reason }

Respond ONLY JSON:
`;
}
