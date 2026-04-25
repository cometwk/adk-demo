import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { agentMethod, agentProperty } from "../../runtime/decorator";
import { BaseNode, Graph } from "../../runtime/graph";
import {
	AgentMethodRegistry,
	AgentPropertyRegistry,
} from "../../runtime/registry";
import type { MethodSchema } from "../../runtime/types";
import { createGraphTools } from "./graph";

// ─────────────────────────────────────────────────────────────────────────────────
// 测试用的节点类
// 注意：装饰器只在类首次加载时执行，测试中需要手动注册
// ─────────────────────────────────────────────────────────────────────────────────

class TestEngineer extends BaseNode {
	workload: number;
	seniority: string;

	constructor(id: string, workload: number, seniority: string) {
		super(id);
		this.workload = workload;
		this.seniority = seniority;
	}

	assessBurnoutRisk(): { risk: string } {
		return { risk: this.workload > 70 ? "HIGH" : "LOW" };
	}

	getCapabilities(): MethodSchema[] {
		return AgentMethodRegistry.getMethodsForClass("TestEngineer");
	}

	// 手动覆盖 getProperties 用于测试
	getProperties(): Record<string, any> {
		return { workload: this.workload, seniority: this.seniority };
	}
}

class TestProject extends BaseNode {
	priority: string;

	constructor(id: string, priority: string) {
		super(id);
		this.priority = priority;
	}

	getCapabilities(): MethodSchema[] {
		return [];
	}

	getProperties(): Record<string, any> {
		return { priority: this.priority };
	}
}

class TestTeam extends BaseNode {
	department: string;

	constructor(id: string, department: string) {
		super(id);
		this.department = department;
	}

	getCapabilities(): MethodSchema[] {
		return [];
	}

	getProperties(): Record<string, any> {
		return { department: this.department };
	}
}

// ─────────────────────────────────────────────────────────────────────────────────
// 测试
// ─────────────────────────────────────────────────────────────────────────────────

describe("Graph Tools", () => {
	let graph: Graph;
	let tools: ReturnType<typeof createGraphTools>;

	beforeEach(() => {
		AgentMethodRegistry.clear();
		AgentPropertyRegistry.clear();

		// 手动注册方法（因为装饰器只在类首次定义时执行）
		AgentMethodRegistry.register("TestEngineer", "assessBurnoutRisk", {
			methodName: "assessBurnoutRisk",
			params: z.object({}),
			returns: "{ risk: string }",
			description: "assess burnout risk",
		});

		graph = new Graph();

		// 创建测试节点
		const alice = new TestEngineer("alice", 85, "senior");
		const bob = new TestEngineer("bob", 65, "mid");
		const projectPortal = new TestProject("project_portal", "high");
		const projectApi = new TestProject("project_api", "medium");
		const teamFrontend = new TestTeam("team_frontend", "Product");

		graph.addNode(alice);
		graph.addNode(bob);
		graph.addNode(projectPortal);
		graph.addNode(projectApi);
		graph.addNode(teamFrontend);

		// 创建边
		graph.addEdge({ from: "alice", to: "team_frontend", type: "member_of" });
		graph.addEdge({ from: "bob", to: "team_frontend", type: "member_of" });
		graph.addEdge({ from: "alice", to: "project_portal", type: "assigned_to" });
		graph.addEdge({ from: "bob", to: "project_portal", type: "assigned_to" });
		graph.addEdge({
			from: "project_portal",
			to: "team_frontend",
			type: "owned_by",
		});
		graph.addEdge({
			from: "project_portal",
			to: "project_api",
			type: "depends_on",
		});

		tools = createGraphTools(graph);
	});

	describe("search_nodes", () => {
		it("should search nodes by query substring", async () => {
			const result = await tools.search_nodes.execute({
				query: "project",
				limit: 10,
				offset: 0,
			});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data.length).toBe(2);
				expect(
					result.data.find((n) => n.nodeId === "project_portal"),
				).toBeDefined();
				expect(
					result.data.find((n) => n.nodeId === "project_api"),
				).toBeDefined();
			}
		});

		it("should search nodes by type", async () => {
			const result = await tools.search_nodes.execute({
				type: "TestEngineer",
				limit: 10,
				offset: 0,
			});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data.length).toBe(2);
				expect(result.data.every((n) => n.type === "TestEngineer")).toBe(true);
			}
		});

		it("should search nodes related to another entity", async () => {
			const result = await tools.search_nodes.execute({
				relatedTo: "project_portal",
				limit: 10,
				offset: 0,
			});

			expect(result.ok).toBe(true);
			if (result.ok) {
				// project_portal 的邻居: alice, bob, team_frontend, project_api
				expect(result.data.length).toBeGreaterThan(0);
				expect(result.data.find((n) => n.nodeId === "alice")).toBeDefined();
				expect(
					result.data.find((n) => n.nodeId === "project_api"),
				).toBeDefined();
			}
		});

		it("should return paginated results", async () => {
			const result = await tools.search_nodes.execute({
				limit: 1,
				offset: 0,
			});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data.length).toBe(1);
				expect(result.meta?.page?.hasMore).toBe(true);
			}
		});

		it("should return empty_result for no matches", async () => {
			const result = await tools.search_nodes.execute({
				query: "nonexistent",
				limit: 10,
				offset: 0,
			});

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.code).toBe("empty_result");
			}
		});
	});

	describe("inspect_node", () => {
		it("should inspect node with default fields", async () => {
			const result = await tools.inspect_node.execute({
				nodeId: "alice",
				fields: ["type", "properties", "methods"],
			});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data.type).toBe("TestEngineer");
				expect(result.data.properties).toEqual({
					workload: 85,
					seniority: "senior",
				});
				expect(result.data.methods).toEqual(["assessBurnoutRisk"]);
			}
		});

		it("should inspect node with specific fields only", async () => {
			const result = await tools.inspect_node.execute({
				nodeId: "project_portal",
				fields: ["type", "outEdges"],
			});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data.type).toBe("TestProject");
				expect(result.data.outEdges).toBeDefined();
				expect(result.data.properties).toBeUndefined(); // not requested
			}
		});

		it("should return not_found for unknown node", async () => {
			const result = await tools.inspect_node.execute({
				nodeId: "unknown_node",
				fields: ["type"],
			});

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.code).toBe("not_found");
			}
		});
	});

	describe("query_neighbors", () => {
		it("should query neighbors with relation filter", async () => {
			const result = await tools.query_neighbors.execute({
				nodeId: "project_portal",
				relation: "depends_on",
				direction: "out",
				limit: 10,
				offset: 0,
			});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data.length).toBe(1);
				expect(result.data[0].nodeId).toBe("project_api");
				expect(result.data[0].relation).toBe("depends_on");
			}
		});

		it("should query neighbors with type filter", async () => {
			const result = await tools.query_neighbors.execute({
				nodeId: "project_portal",
				targetType: "TestEngineer",
				direction: "in",
				limit: 10,
				offset: 0,
			});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data.length).toBe(2);
				expect(result.data.every((n) => n.type === "TestEngineer")).toBe(true);
			}
		});

		it("should query neighbors with pagination", async () => {
			const result = await tools.query_neighbors.execute({
				nodeId: "project_portal",
				direction: "both",
				limit: 1,
				offset: 0,
			});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data.length).toBe(1);
				expect(result.meta?.page?.hasMore).toBe(true);
			}
		});

		it("should return not_found for unknown node", async () => {
			const result = await tools.query_neighbors.execute({
				nodeId: "unknown_node",
				direction: "both",
				limit: 10,
				offset: 0,
			});

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.code).toBe("not_found");
			}
		});

		it("should return empty_result for no neighbors matching filters", async () => {
			const result = await tools.query_neighbors.execute({
				nodeId: "alice",
				relation: "depends_on", // alice has no depends_on edges
				direction: "out",
				limit: 10,
				offset: 0,
			});

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.code).toBe("empty_result");
			}
		});
	});
});
