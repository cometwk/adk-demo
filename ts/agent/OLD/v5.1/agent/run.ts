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

	console.log("=== V5 决策 Agent 启动 ===");
	console.log("目标:", goal);
	console.log("入口实体:", entryEntities);
	console.log("\n系统提示词:\n", systemPrompt);
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
			console.log(`\n── 步骤 ${stepNumber} (${finishReason}) ──`);
			if (text) console.log("💭 思考:", text);
			if (staticToolCalls.length > 0) {
				for (const tc of staticToolCalls) {
					console.log(`🔧 工具: ${tc.toolName}(${JSON.stringify(tc.input)})`);
				}
			}
			if (staticToolResults.length > 0) {
				for (const tr of staticToolResults) {
					console.log("📋 结果:", JSON.stringify(tr.output, null, 2));
				}
			}
		},
	});

	console.log("\n=== V5 决策 Agent 完成 ===");
	console.log("最终答案:", result.text);
	console.log(`步骤数: ${result.steps.length}`);
	console.log(`Token用量: ${JSON.stringify(result.usage)}`);


	{
		// 再触发一次，获取完整的历史
		const updatedHistory: ModelMessage[] = [...messages, ...result.response.messages]
		// console.log('Updated History:', updatedHistory)
		const m = [...updatedHistory, { role: 'user', content: '再见，只需回复"再见"' } satisfies ModelMessage]
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