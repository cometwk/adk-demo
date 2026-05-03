import { runDecisionAgent } from "../../agent/run";
import { seedGraph } from "./seed";
import { registerLibraryConstraints } from "./constraints";
import { libraryOntology } from "./schema";

async function main() {
	registerLibraryConstraints();

	const graph = seedGraph();

	// 目标: 判断小明能否借《三体》
	const result = await runDecisionAgent({
		// goal: "判断小明能否借《三体》（已借2本：《飘》《老人与海》，其中《老人与海》逾期）",
		goal: "判断小明能否借《三体》",
		graph,
		ontology: libraryOntology,
		entryEntities: ["xiaoming", "santi"],
	});

	console.log("\n📊 决策输出:", result.answer);
}

main();