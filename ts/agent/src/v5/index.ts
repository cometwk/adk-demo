import { runDecisionAgent } from "./agent/run";
import { seedGraph } from "./data/seed";
import { registerProjectPortalConstraints } from "./ontology/constraints";
import { projectOntology } from "./ontology/schema";

async function main() {
	registerProjectPortalConstraints();

	const graph = seedGraph();

	const result = await runDecisionAgent({
		goal: "评估 project_portal 的综合交付风险",
		graph,
		ontology: projectOntology,
		entryEntities: ["project_portal"],
	});

	console.log("\n📊 V5 Decision Output:", result.answer);
}

main();
