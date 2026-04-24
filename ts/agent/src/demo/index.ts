import { runAgent } from "./agent/run";
import { seedGraph } from "./data/seed";

async function main() {
	const graph = seedGraph();

	const result = await runAgent(
		"Assess project risk for project_1. Gather workload data from all team members, then call the risk evaluation method.",
		graph,
	);

	console.log("\n📊 Final Result:", result.answer);
}

main();