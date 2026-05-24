import { buildOntology } from "../../../../ontology";
import { RestQueryProvider } from "../../../../provider/rest-query";
import { paymentAccessBindings } from "../bindings";
import { typeRegistry } from "../context";
import "../ontology";

async function test() {
	const ontology = buildOntology({ version: "restapi-1.0" });
	console.log(
		"ontology types:",
		ontology.types.map((t) => t.name),
	);
	console.log(
		"ontology relations:",
		ontology.relations.map((r) => `${r.fromType} --${r.type}--> ${r.toType}`),
	);

	const provider = new RestQueryProvider(
		paymentAccessBindings as any,
		{ typeRegistry } as any,
	);

	const agents = await provider.findNodes({ type: "Agent", limit: 3 });
	console.log(
		"findNodes Agent:",
		agents.items.map((n) => ({
			id: n.id,
			name: n.properties.name,
			agent_no: n.properties.agent_no,
		})),
	);

	const first = agents.items[0];
	if (!first) {
		console.log("no agents found");
		return;
	}

	const node = await provider.getNode(first.id);
	console.log("getNode:", node?.id, node?.properties.name);

	const children = await provider.getNeighbors(first.id, {
		relation: "children",
		direction: "out",
		limit: 10,
	});
	console.log(
		"children neighbors:",
		children.items.map((n) => n.nodeId),
	);

	const summary = await provider.getEdgeSummary(first.id);
	console.log("edgeSummary:", summary);
}

test().catch(console.error);
