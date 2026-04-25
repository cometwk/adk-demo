import { generateText, stepCountIs, type ModelMessage } from "ai";
import { model } from "../../lib/model";
import type { Graph } from "../runtime/graph";
import { DecisionWorkspace } from "../ontology/decision";
import { buildSystemPrompt } from "./prompt";
import { createAllTools } from "./tools";

// ─────────────────────────────────────────────────────────────────────────────────
// V5 Agent Runner
// 使用 AI SDK generateText + tools，保留 V4 的核心运行模式
// 增加 DecisionWorkspace 用于决策支持
// ─────────────────────────────────────────────────────────────────────────────────

export type RunConfig = {
	goal: string;
	entryEntities: string[];
	graph: Graph;
	maxSteps?: number;
	history?: ModelMessage[];
};

export type RunResult = {
	answer: string;
	steps: any[];
	usage: any;
	workspace: DecisionWorkspace;
};

export async function runDecisionAgent(config: RunConfig): Promise<RunResult> {
	const { goal, entryEntities, graph, maxSteps = 15, history = [] } = config;

	// 创建工作空间
	const workspace = new DecisionWorkspace();
	workspace.setup(goal, "unknown", entryEntities);

	// 创建工具
	const tools = createAllTools(graph, workspace);

	// 构建 prompt
	const systemPrompt = buildSystemPrompt({ goal, entryEntities, graph });

	console.log("=== V5 Decision Agent Start ===");
	console.log("Goal:", goal);
	console.log("Entry Entities:", entryEntities);
	console.log("\nSystem Prompt:\n", systemPrompt);
	console.log("=================================\n");

	const messages = [
		...history,
		{ role: "user", content: goal } satisfies ModelMessage,
	];

	const result = await generateText({
		model,
		system: systemPrompt,
		messages,
		tools,
		stopWhen: stepCountIs(maxSteps),
		onStepFinish({
			stepNumber,
			text,
			staticToolCalls,
			staticToolResults,
			finishReason,
		}) {
			console.log(`\n── Step ${stepNumber} (${finishReason}) ──`);
			if (text) console.log("💭 THOUGHT:", text);
			if (staticToolCalls.length > 0) {
				for (const tc of staticToolCalls) {
					console.log(`🔧 TOOL: ${tc.toolName}(${JSON.stringify(tc.input)})`);
				}
			}
			if (staticToolResults.length > 0) {
				for (const tr of staticToolResults) {
					console.log("📋 RESULT:", JSON.stringify(tr.output, null, 2));
				}
			}
		},
	});

	console.log("\n=== V5 Decision Agent Done ===");
	console.log("Final answer:", result.text);
	console.log(`Steps: ${result.steps.length}`);
	console.log(`Tokens: ${JSON.stringify(result.usage)}`);

	// 打印决策工作空间摘要
	console.log("\n=== Decision Workspace Summary ===");
	console.log("Evidence:", workspace.getAllEvidence().length);
	console.log("Candidates:", workspace.getAllCandidates().length);
	console.log("Uncertainty:", workspace.getAllUncertainty().length);

	{
		// 再触发一次，获取完整的历史
		const updatedHistory: ModelMessage[] = [
			...messages,
			...result.response.messages,
		];
		const m = [
			...updatedHistory,
			{
				role: "user",
				content: "bye, just response with bye",
			} satisfies ModelMessage,
		];
		await generateText({
			model,
			system: systemPrompt,
			messages: m,
			tools,
			stopWhen: stepCountIs(1),
		});
	}

	return {
		answer: result.text,
		steps: result.steps,
		usage: result.usage,
		workspace,
	};
}

// ─────────────────────────────────────────────────────────────────────────────────
// 导出
// ─────────────────────────────────────────────────────────────────────────────────

export { DecisionWorkspace } from "../ontology/decision";
export { buildSystemPrompt } from "./prompt";
export { createAllTools, toolCategories } from "./tools";