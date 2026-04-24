import { z } from "zod";
import { runAgentLoop } from "./agent/loop";
import { seedGraph } from "./data/seed";
import { Executor } from "./runtime/executor";
import { AgentState } from "./runtime/state";
import { Validator } from "./runtime/validator";

async function main() {
	const graph = seedGraph();

	// key 命名与 checkRiskStatus 的参数名对齐，方便 from_state 直接绑定
	const workflowSchema = z.object({
		teamLoad: z.number().default(0),
	});

	const state = new AgentState(workflowSchema);

	const executor = new Executor(graph, state);
	const validator = new Validator(graph, state);

	await runAgentLoop(
		"Assess project risk for project_1",
		graph,
		executor,
		validator,
		state,
	);
}

main();
