import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { DecisionTask } from "../ontology/decision";
import type { Ontology } from "../ontology/schema";
import { buildDiagnosticPlannerPrompt } from "./prompt";
import type { DiagnosticPlan } from "./planner";

// ── Diagnostic Planner ──
//
// One lightweight LLM call; NO tool calls.
// Walks CausalGraph backward from outcome to enumerate candidate cause space.

export async function runDiagnosticPlanner(
	task: DecisionTask,
	ontology: Ontology,
	modelId = "gpt-4o-mini",
): Promise<DiagnosticPlan> {
	const openai = createOpenAI({});
	const prompt = buildDiagnosticPlannerPrompt(task, ontology);

	const { text } = await generateText({
		model: openai(modelId),
		prompt,
		temperature: 0,
		maxOutputTokens: 512,
	});

	try {
		const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
		return JSON.parse(clean) as DiagnosticPlan;
	} catch {
		return {
			rootOutcome: task.outcome?.eventType ?? "unknown",
			backwardChains: [],
			eventsToReconstruct: [],
			candidateCauseSpace: [],
		};
	}
}
