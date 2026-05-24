import { describe, expect, it } from "vitest";
import type { GetNeighborsOpts, NodeData } from "../../../../engine";
import {
	filtersToSearchParams,
	neighborsFromNodes,
} from "../../../../provider/rest-query";

describe("helpers", () => {
	describe("filtersToSearchParams", () => {
		it("should return valid defaults when all params are undefined", () => {
			const result = filtersToSearchParams(
				undefined,
				undefined,
				undefined,
				undefined,
			);
			expect(result.page).toBe(0);
			expect(result.pagesize).toBe(20);
		});

		it("should correctly calculate page from offset and limit", () => {
			const result = filtersToSearchParams(undefined, undefined, 100, 20);
			expect(result.page).toBe(5);
			expect(result.pagesize).toBe(20);
		});

		it("should map filter operators to API params", () => {
			const filters = [
				{ property: "name", op: "eq" as const, value: "test" },
				{ property: "status", op: "in" as const, value: ["a", "b"] },
			];
			const result = filtersToSearchParams(filters, undefined, 0, 20);
			expect(result["where.name.eq"]).toBe("test");
			expect(result["where.status.in"]).toBe("a,b");
		});
	});

	describe("neighborsFromNodes", () => {
		it("should convert nodes to neighbor data", () => {
			const nodes: NodeData[] = [
				{ id: "Agent:A001", type: "Agent", properties: { name: "Agent 1" } },
				{ id: "Agent:A002", type: "Agent", properties: { name: "Agent 2" } },
			];
			const opts: GetNeighborsOpts = {
				relation: "children",
				limit: 10,
				offset: 0,
			};
			const result = neighborsFromNodes(nodes, "children", "out", opts);

			expect(result.items.length).toBe(2);
			expect(result.items[0].nodeId).toBe("Agent:A001");
			expect(result.items[0].relation).toBe("children");
			expect(result.items[0].direction).toBe("out");
		});

		it("should filter by targetType", () => {
			const nodes: NodeData[] = [
				{ id: "Agent:A001", type: "Agent", properties: {} },
				{ id: "Merch:M001", type: "Merch", properties: {} },
			];
			const opts: GetNeighborsOpts = {
				relation: "binds_merch",
				targetType: "Agent",
				limit: 10,
				offset: 0,
			};
			const result = neighborsFromNodes(nodes, "binds_merch", "out", opts);

			expect(result.items.length).toBe(1);
			expect(result.items[0].type).toBe("Agent");
		});
	});
});
