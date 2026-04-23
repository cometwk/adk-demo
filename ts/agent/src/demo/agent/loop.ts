import type { Executor } from "../runtime/executor";
import type { Graph } from "../runtime/graph";
import type { AgentState } from "../runtime/state";
import type { NextAction } from "../runtime/types";
import type { Validator } from "../runtime/validator";
import { buildPrompt } from "./prompt";

// Mock LLM 返回的动作序列（用于 Demo 验证）
const mockActions: NextAction[] = [
	{ op: "read_node", node: "person_1" },
	{ op: "update_state", key: "teamLoadAccumulator", value: 60 },
	{ op: "read_node", node: "person_2" },
	{ op: "update_state", key: "teamLoadAccumulator", value: 130 },
	{
		op: "call",
		node: "project_1",
		method: "checkRiskStatus",
		args: { teamLoad: 130 },
	},
	{ op: "stop", reason: "Project risk is HIGH due to overloaded team" },
];

let actionIndex = 0;

async function callLLM(prompt: string): Promise<NextAction> {
	console.log("\nPROMPT:\n", prompt);

	if (actionIndex >= mockActions.length) {
		return { op: "stop", reason: "Demo finished" };
	}

	const action = mockActions[actionIndex];
	actionIndex++;
	return action;
}

export async function runAgentLoop(
	goal: string,
	graph: Graph,
	executor: Executor,
	validator: Validator,
	state: AgentState<any>,
) {
	let lastObservation = "(none)";

	for (let step = 0; step < 6; step++) {
		const prompt = buildPrompt(goal, graph, state, lastObservation);

		const action = await callLLM(prompt);

		console.log("ACTION:", action);

		const validation = validator.validate(action);
		if (!validation.valid) {
			console.log("❌ Invalid action:", validation.error);
			break;
		}

		const obs = executor.execute(action);

		console.log("OBS:", obs);

		// 格式化 lastObservation
		if (obs.success && obs.data !== undefined) {
			lastObservation = `${action.op} → ${JSON.stringify(obs.data)}`;
		} else if (!obs.success) {
			lastObservation = `${action.op} → ERROR: ${obs.error}`;
		}

		if (action.op === "stop") {
			console.log("✅ DONE:", obs.data);
			break;
		}
	}
}
