import { generateText, stepCountIs } from "ai";
import { model } from "../../lib/model";
import type { Graph } from "../runtime/graph";
import { createGraphTools } from "./tools";
import { buildSystemPrompt } from "./prompt";

export async function runAgent(goal: string, graph: Graph) {
	const tools = createGraphTools(graph);
	const systemPrompt = buildSystemPrompt(goal, graph);

	console.log("=== Agent Start ===");
	console.log("Goal:", goal);
	console.log("System Prompt:\n", systemPrompt);
	console.log("===================\n");

	const result = await generateText({
		model,
		system: systemPrompt,
		prompt: goal,
		tools,
		stopWhen: stepCountIs(15),
		onStepFinish: ({
			stepNumber,
			text,
			toolCalls,
			toolResults,
			finishReason,
		}) => {
			console.log(`Step ${stepNumber} finished (${finishReason})`);
			if (text) console.log("💭 THOUGHT:", text);
			if (toolCalls && toolCalls.length > 0) {
				for (const tc of toolCalls) {
					const args = (tc as any).args;
					console.log(`🔧 TOOL: ${tc.toolName}(${JSON.stringify(args)})`);
				}
			}
			if (toolResults && toolResults.length > 0) {
				for (const tr of toolResults) {
					const res = (tr as any).result;
					console.log(`📋 RESULT:`, JSON.stringify(res, null, 2));
				}
			}
			console.log("---");
		},
	});

	console.log("\n=== Agent Done ===");
	console.log("Final answer:", result.text);
	console.log(`Steps: ${result.steps.length}`);
	console.log(`Tokens: ${result.usage.totalTokens}`);

	return {
		answer: result.text,
		steps: result.steps,
		usage: result.usage,
	};
}