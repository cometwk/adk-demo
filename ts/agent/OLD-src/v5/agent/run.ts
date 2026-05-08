import { generateText, type ModelMessage, stepCountIs } from "ai";
import { model } from "../../lib/model";
import { DecisionWorkspace } from "../ontology/decision";
import type { Ontology } from "../ontology/schema";
import type { Graph } from "../runtime/graph";
import { buildSystemPrompt } from "./prompt";
import { createDecisionTools } from "./tools/decision";
import { createGraphTools } from "./tools/graph";
import { createMethodTools } from "./tools/method";
import { createOntologyTools } from "./tools/ontology";

export type RunConfig = {
	goal: string;
	graph: Graph;
	ontology: Ontology;
	entryEntities: string[];
	maxSteps?: number;
};

export async function runDecisionAgent(config: RunConfig) {
	const { goal, graph, ontology, entryEntities, maxSteps = 15 } = config;

	const workspace = new DecisionWorkspace();

	const graphTools = createGraphTools(graph);
	const methodTools = createMethodTools(graph);
	const ontologyTools = createOntologyTools(ontology);
	const decisionTools = createDecisionTools(workspace, graph);

	const tools = {
		...graphTools,
		...methodTools,
		...ontologyTools,
		...decisionTools,
	};

	const systemPrompt = buildSystemPrompt({ goal, entryEntities, ontology });

	console.log("=== V5 Decision Agent Start ===");
	console.log("Goal:", goal);
	console.log("Entry entities:", entryEntities);
	console.log("\nSystem Prompt:\n", systemPrompt);
	console.log("================================\n");

	const messages: ModelMessage[] = [{ role: "user", content: goal }];

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


	{
		// 再触发一次，获取完整的历史
		const updatedHistory: ModelMessage[] = [...messages, ...result.response.messages]
		// console.log('Updated History:', updatedHistory)
		const m = [...updatedHistory, { role: 'user', content: 'bye, just response with bye' } satisfies ModelMessage]
		await generateText({
		  model: model,
		  system: systemPrompt,
		  messages: m,
		  tools,
		  stopWhen: stepCountIs(1),
		})
	}

	return {
		answer: result.text,
		steps: result.steps,
		usage: result.usage,
		workspace,
	};
}
