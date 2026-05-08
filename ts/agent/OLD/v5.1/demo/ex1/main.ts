import { runDecisionAgent } from "../../agent/run";
import { seedGraph } from "./seed";
import { registerProjectPortalConstraints } from "./constraints";
import { projectOntology } from "./schema";

async function main() {
	registerProjectPortalConstraints();

	const graph = seedGraph();

	const result = await runDecisionAgent({
		goal: "评估 project_portal 的综合交付风险",
		graph,
		ontology: projectOntology,
		entryEntities: ["project_portal"],
	});

	console.log("\n📊 V5 决策输出:", result.answer);
}

main();