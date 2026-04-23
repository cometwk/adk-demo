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

export async function callLLM_mock(prompt: string): Promise<NextAction> {
	console.log("\nPROMPT:\n", prompt);

	if (actionIndex >= mockActions.length) {
		return { op: "stop", reason: "Demo finished" };
	}

	const action = mockActions[actionIndex];
	actionIndex++;
	return action;
}
