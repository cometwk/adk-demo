// ─────────────────────────────────────────────────────────────────────────────────
// V5 入口点：辅助决策 Agent
// ─────────────────────────────────────────────────────────────────────────────────

import { type RunResult, runDecisionAgent } from "./agent/run";
import { initializeConstraints } from "./ontology/constraints";
import type { Graph } from "./runtime/graph";
import { seedGraph, defaultScenario } from "./data/seed";

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
// 默认场景运行
// ─────────────────────────────────────────────────────────────────────────────────

export async function runDefaultScenario(): Promise<RunResult> {
	const graph = seedGraph();

	return runV5({
		goal: defaultScenario.goal,
		entryEntities: defaultScenario.entryEntities,
		graph,
	});
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
export { seedGraph, defaultScenario } from "./data/seed";