import { runAgent } from "./agent/run";
import { seedGraph } from "./data/seed_v3";

async function main() {
	const graph = seedGraph();

	const result = await runAgent(
		// "Assess project risk for project_1. Find all team members involved, gather their workload data, then call the risk evaluation method with the total team workload.",
		"评估 project_portal 的综合交付风险",
		graph,
	);

	console.log("\n📊 Final Result:", result.answer);
}

main();
