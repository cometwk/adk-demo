import { generateText } from "ai";
// AI SDK uses maxOutputTokens, not maxTokens
import { createOpenAI } from "@ai-sdk/openai";
import type { DecisionTask } from "../ontology/decision";
import type { Ontology } from "../ontology/schema";
import { buildPlannerPrompt } from "./prompt";
import { model } from "../../lib/model";

// ── ExplorationPlan ──

export type SubgraphSpec = {
	centerEntityId: string;
	depth: number;
	reason: string;
};

export type MethodInvocationHint = {
	nodeId: string;
	method: string;
	requiredFacts: string[];
};

export type ExplorationPlan = {
	expectedSubgraphs: SubgraphSpec[];
	methodsToInvoke: MethodInvocationHint[];
	rulesetOfInterest: string[];
	estimatedSteps: number;
};

// ── DiagnosticPlan ──

export type DiagnosticPlan = {
	rootOutcome: string;
	backwardChains: string[];
	eventsToReconstruct: string[];
	candidateCauseSpace: string[];
};

// ── Planner (predictive) ──
//
// One lightweight LLM call; NO tool calls allowed.
// Returns ExplorationPlan to guide the executor.

export async function runPlanner(
	task: DecisionTask,
	ontology: Ontology,
	modelId = "gpt-4o-mini",
): Promise<ExplorationPlan> {
	// const openai = createOpenAI({});
	const prompt = buildPlannerPrompt(task, ontology);

	const { text } = await generateText({
		model: model,
		prompt,
		temperature: 0,
		maxOutputTokens: 512,
	});

	try {
		// Strip markdown fences if present
		const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
		return JSON.parse(clean) as ExplorationPlan;
	} catch {
		// Fallback: expand from entry entities
		return {
			expectedSubgraphs: (task.entryEntities ?? []).map((eid) => ({
				centerEntityId: eid,
				depth: 2,
				reason: "fallback plan",
			})),
			methodsToInvoke: [],
			rulesetOfInterest: [],
			estimatedSteps: 10,
		};
	}
}
