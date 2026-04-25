// ─────────────────────────────────────────────────────────────────────────────────
// V5 入口点：辅助决策 Agent
// ─────────────────────────────────────────────────────────────────────────────────

import { createOpenAI } from "@ai-sdk/openai";
import { type RunResult, runDecisionAgent } from "./agent/run";
import { initializeConstraints } from "./ontology/constraints";
import type { Graph } from "./runtime/graph";

// ─────────────────────────────────────────────────────────────────────────────────
// 模型配置
// ─────────────────────────────────────────────────────────────────────────────────

export function createModel() {
	return createOpenAI({
		apiKey: process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY,
		baseURL: process.env.LLM_BASE_URL ?? "https://api.openai.com/v1",
	})("gpt-4o-mini");
}

// ─────────────────────────────────────────────────────────────────────────────────
// 运行入口
// ─────────────────────────────────────────────────────────────────────────────────

export type V5Config = {
	goal: string;
	entryEntities: string[];
	graph: Graph;
	maxSteps?: number;
};

export async function runV5(config: V5Config): Promise<RunResult> {
	// 初始化约束
	initializeConstraints();

	// 运行 agent
	const result = await runDecisionAgent(config);

	return result;
}

// ─────────────────────────────────────────────────────────────────────────────────
// 导出核心类型和函数
// ─────────────────────────────────────────────────────────────────────────────────

export type { RunResult } from "./agent/run";
export { initializeConstraints } from "./ontology/constraints";
export type {
	CandidateAnswer,
	DecisionOutput,
	DecisionTask,
	Evidence,
	Uncertainty,
} from "./ontology/decision";
export { DecisionWorkspace } from "./ontology/decision";
export { BaseNode, Graph } from "./runtime/graph";
