import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
	AgentMethodRegistry,
	AgentPropertyRegistry,
	agentMethod,
	agentProperty,
} from "../../runtime/decorator";
import { BaseNode, Graph } from "../../runtime/graph";
import type { MethodSchema } from "../../runtime/registry";
import type {
	ToolResult,
	ToolResultError,
	ToolResultSuccess,
} from "../../runtime/types";
import { createGraphTools } from "./graph";

class TestProject extends BaseNode {
	@agentProperty({ returns: "'high'", description: "Priority" })
	priority = "high";

	@agentMethod({ returns: "string", description: "Evaluate risk" })
	evaluateRisk() {
		return "HIGH";
	}

	getCapabilities(): MethodSchema[] {
		return AgentMethodRegistry.getMethodsForClass("TestProject");
	}
}

class TestEngineer extends BaseNode {
	@agentProperty({ returns: "number", description: "Workload" })
	workload: number;

	constructor(id: string, workload: number) {
		super(id);
		this.workload = workload;
	}

	getCapabilities(): MethodSchema[] {
		return AgentMethodRegistry.getMethodsForClass("TestEngineer");
	}
}

function buildTestGraph() {
	const g = new Graph();
	g.addNode(new TestProject("project_portal"));
	g.addNode(new TestProject("project_api"));
	g.addNode(new TestEngineer("alice", 85));
	g.addNode(new TestEngineer("bob", 65));

	g.addEdge({ from: "alice", to: "project_portal", type: "assigned_to" });
	g.addEdge({ from: "bob", to: "project_portal", type: "assigned_to" });
	g.addEdge({ from: "project_portal", to: "project_api", type: "depends_on" });
	return g;
}

function asOk(r: any): ToolResultSuccess & { data: any } {
	expect(r.ok).toBe(true);
	return r;
}

function asErr(r: any): ToolResultError & { expected?: any } {
	expect(r.ok).toBe(false);
	return r;
}

describe("inspect_node", () => {
	let tools: ReturnType<typeof createGraphTools>;

	beforeEach(() => {
		tools = createGraphTools(buildTestGraph());
	});

	it("returns only requested fields", async () => {
		const r = asOk(
			await tools.inspect_node.execute!(
				{ nodeId: "project_portal", fields: ["type", "methods"] },
				{} as any,
			),
		);
		expect(r.data).toHaveProperty("type", "TestProject");
		expect(r.data).toHaveProperty("methods");
		expect(r.data).not.toHaveProperty("properties");
		expect(r.data).not.toHaveProperty("outEdges");
		expect(r.data).not.toHaveProperty("inEdges");
	});

	it("returns all fields when none specified", async () => {
		const r = asOk(
			await tools.inspect_node.execute!(
				{ nodeId: "project_portal" },
				{} as any,
			),
		);
		expect(r.data).toHaveProperty("type");
		expect(r.data).toHaveProperty("properties");
		expect(r.data).toHaveProperty("outEdges");
		expect(r.data).toHaveProperty("inEdges");
		expect(r.data).toHaveProperty("methods");
	});

	it("returns NOT_FOUND for unknown node", async () => {
		const r = asErr(
			await tools.inspect_node.execute!({ nodeId: "nonexistent" }, {} as any),
		);
		expect(r.code).toBe("NOT_FOUND");
	});
});

describe("query_neighbors", () => {
	let tools: ReturnType<typeof createGraphTools>;

	beforeEach(() => {
		tools = createGraphTools(buildTestGraph());
	});

	it("returns depends_on neighbors for project_portal", async () => {
		const r = asOk(
			await tools.query_neighbors.execute!(
				{
					nodeId: "project_portal",
					relation: "depends_on",
					direction: "out",
					limit: 20,
					offset: 0,
				},
				{} as any,
			),
		);
		const neighbors = r.data.neighbors;
		expect(neighbors.length).toBe(1);
		expect(neighbors[0].nodeId).toBe("project_api");
	});

	it("returns NOT_FOUND for unknown node", async () => {
		const r = asErr(
			await tools.query_neighbors.execute!(
				{ nodeId: "nonexistent", direction: "both", limit: 20, offset: 0 },
				{} as any,
			),
		);
		expect(r.code).toBe("NOT_FOUND");
	});

	it("returns empty result with page info for no matches", async () => {
		const r = asOk(
			await tools.query_neighbors.execute!(
				{
					nodeId: "project_portal",
					relation: "member_of",
					direction: "out",
					limit: 20,
					offset: 0,
				},
				{} as any,
			),
		);
		expect(r.data.neighbors).toEqual([]);
		expect(r.data.page.hasMore).toBe(false);
	});
});

describe("search_nodes", () => {
	let tools: ReturnType<typeof createGraphTools>;

	beforeEach(() => {
		tools = createGraphTools(buildTestGraph());
	});

	it("searches by type", async () => {
		const r = asOk(
			await tools.search_nodes.execute!(
				{ type: "TestProject", limit: 20, offset: 0 },
				{} as any,
			),
		);
		expect(r.data.nodes.length).toBe(2);
		expect(r.data.nodes.every((n: any) => n.type === "TestProject")).toBe(true);
	});

	it("searches by query substring", async () => {
		const r = asOk(
			await tools.search_nodes.execute!(
				{ query: "portal", limit: 20, offset: 0 },
				{} as any,
			),
		);
		expect(r.data.nodes.length).toBe(1);
		expect(r.data.nodes[0].nodeId).toBe("project_portal");
	});

	it("returns pagination metadata", async () => {
		const r = asOk(
			await tools.search_nodes.execute!({ limit: 20, offset: 0 }, {} as any),
		);
		expect(r.data.page).toHaveProperty("hasMore");
		expect(r.data.page).toHaveProperty("offset");
		expect(r.data.page).toHaveProperty("limit");
	});
});

describe("pagination", () => {
	it("high-degree node returns first page and hasMore: true", async () => {
		const g = new Graph();
		const hub = new TestProject("hub");
		g.addNode(hub);
		for (let i = 0; i < 30; i++) {
			const eng = new TestEngineer(`eng_${i}`, 50);
			g.addNode(eng);
			g.addEdge({ from: `eng_${i}`, to: "hub", type: "assigned_to" });
		}

		const tools = createGraphTools(g);
		const r = asOk(
			await tools.query_neighbors.execute!(
				{ nodeId: "hub", direction: "in", limit: 10, offset: 0 },
				{} as any,
			),
		);
		expect(r.data.neighbors.length).toBe(10);
		expect(r.data.page.hasMore).toBe(true);
	});
});
