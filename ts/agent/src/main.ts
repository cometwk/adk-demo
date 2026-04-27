import { runDecisionAssistant } from "./v6";
import { seedGraph } from "./v6/data/seed";
import { projectOntology } from "./v6/ontology/schema";

async function main() {
	// registerProjectPortalConstraints();

	const graph = seedGraph();

	const result = await runDecisionAssistant({
		userQuery: "评估 project_portal 的综合交付风险",
		graph,
		ontology: projectOntology,
		entryEntities: ["project_portal"],
	});

	console.log("\n📊 V6 Decision Output:", JSON.stringify(result, null, 2));
}

main();