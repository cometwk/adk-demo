import { generateText, type ModelMessage, stepCountIs } from "ai";
import { model } from "../../lib/model";
import type { Graph } from "../runtime/graph";
import { buildSystemPrompt } from "./prompt";
import { createGraphTools } from "./tools";

export async function runAgent(
	goal: string,
	graph: Graph,
	history: ModelMessage[] = [],
) {
	const tools = createGraphTools(graph);
	const systemPrompt = buildSystemPrompt(goal, graph);

	console.log("=== Agent Start ===");
	console.log("Goal:", goal);
	console.log("\nSystem Prompt:\n", systemPrompt);
	console.log("===================\n");

	const messages = [
		...history,
		{ role: "user", content: goal } satisfies ModelMessage,
	];

	const result = await generateText({
		model,
		system: systemPrompt,
		// prompt: goal,
		messages: messages,
		tools,
		stopWhen: stepCountIs(15),
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

	console.log("\n=== Agent Done ===");
	console.log("Final answer:", result.text);
	console.log(`Steps: ${result.steps.length}`);
	console.log(`Tokens: ${JSON.stringify(result.usage)}`);

	{
		// 再触发一次，获取完整的历史
		const updatedHistory: ModelMessage[] = [
			...messages,
			...result.response.messages,
		];
		// console.log('Updated History:', updatedHistory)
		const m = [
			...updatedHistory,
			{
				role: "user",
				content: "bye, just response with bye",
			} satisfies ModelMessage,
		];
		await generateText({
			model: model,
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
	};
}
