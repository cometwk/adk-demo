import { stopWhen } from "@voltagent/core";
import { generateText } from "ai";
import { DecisionWorkspace } from "../ontology/decision";
import type { Graph } from "../runtime/graph";
import { buildSystemPrompt, type PromptConfig } from "./prompt";
import { createAllTools } from "./tools";

// ─────────────────────────────────────────────────────────────────────────────────
// V5 Agent Runner
// 使用 AI SDK generateText + tools，保留 V4 的核心运行模式
// ─────────────────────────────────────────────────────────────────────────────────

export type RunConfig = {
	goal: string;
	entryEntities: string[];
	graph: Graph;
	maxSteps?: number;
};

export type RunResult = {
	text: string;
	steps: Array<{ toolName: string; toolArgs: any; result: any }>;
	workspace: DecisionWorkspace;
};

export async function runDecisionAgent(config: RunConfig): Promise<RunResult> {
	const { goal, entryEntities, graph, maxSteps = 15 } = config;

	// 创建工作空间
	const workspace = new DecisionWorkspace();
	workspace.setup(goal, "unknown", entryEntities);

	// 创建工具
	const tools = createAllTools(graph, workspace);

	// 构建 prompt
	const systemPrompt = buildSystemPrompt({ goal, entryEntities, graph });

	// 运行 agent
	const result = await generateText({
		model: undefined as any, // 需要 caller 提供 model
		system: systemPrompt,
		tools,
		stopWhen: stopWhen.stepCountIs(maxSteps),
		maxSteps,
	});

	// 提取步骤信息
	const steps: Array<{ toolName: string; toolArgs: any; result: any }> = [];
	if (result.steps) {
		for (const step of result.steps) {
			if (step.toolCalls) {
				for (const tc of step.toolCalls) {
					steps.push({
						toolName: tc.toolName,
						toolArgs: tc.args,
						result: tc.result,
					});
				}
			}
		}
	}

	return {
		text: result.text,
		steps,
		workspace,
	};
}

// ─────────────────────────────────────────────────────────────────────────────────
// 导出
// ─────────────────────────────────────────────────────────────────────────────────

export { DecisionWorkspace } from "../ontology/decision";
export { buildSystemPrompt } from "./prompt";
export { createAllTools, toolCategories } from "./tools";
