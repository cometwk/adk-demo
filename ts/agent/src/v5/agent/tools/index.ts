import type { DecisionWorkspace } from "../../ontology/decision";
import type { Graph } from "../../runtime/graph";
import { createDecisionTools } from "./decision";
import { createGraphTools } from "./graph";
import { createMethodTools } from "./method";
import { createOntologyTools } from "./ontology";

// ─────────────────────────────────────────────────────────────────────────────────
// V5 工具组合：将所有工具类别整合
// ─────────────────────────────────────────────────────────────────────────────────

export type AllV5Tools = ReturnType<typeof createAllTools>;

export function createAllTools(graph: Graph, workspace: DecisionWorkspace) {
	const graphTools = createGraphTools(graph);
	const methodTools = createMethodTools(graph);
	const ontologyTools = createOntologyTools();
	const decisionTools = createDecisionTools(workspace, graph);

	return {
		...graphTools,
		...methodTools,
		...ontologyTools,
		...decisionTools,
	};
}

// ─────────────────────────────────────────────────────────────────────────────────
// 工具类别说明（供 prompt 使用）
// ─────────────────────────────────────────────────────────────────────────────────

export const toolCategories = {
	ontology: ["inspect_schema", "inspect_rules"],
	graph: ["search_nodes", "inspect_node", "query_neighbors"],
	method: ["describe_method", "call_method"],
	decision: [
		"propose_candidates",
		"record_evidence",
		"aggregate_facts",
		"evaluate_candidates",
	],
};
