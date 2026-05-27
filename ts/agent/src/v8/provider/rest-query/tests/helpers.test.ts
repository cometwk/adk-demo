import { describe, expect, it } from "vitest";
import type { GetNeighborsOpts, NodeData } from "../../../engine";
import type { ComputeFilter, AggregateMetric, ComputeQuery } from "../../../engine/query/compute-query";
import type { TypeProperty, Ontology } from "../../../ontology/schema";
import {
  filtersToSearchParams,
  neighborsFromNodes,
  rawIdOf,
  computeFiltersToSearchParams,
  metricsToParam,
  computeQueryToAggregateParams,
  normalizeAggregateRows,
  ontologyTypeToFieldSchema,
  ontologyToSourceSchema,
} from "../helpers";

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

		it("should not produce NaN when offset is undefined", () => {
			const result = filtersToSearchParams(undefined, undefined, undefined, 20);
			expect(result.page).toBe(0);
			expect(Number.isNaN(result.page)).toBe(false);
		});

		it("should not produce NaN when limit is undefined", () => {
			const result = filtersToSearchParams(undefined, undefined, 20, undefined);
			expect(result.page).toBe(1);
			expect(result.pagesize).toBe(20);
			expect(Number.isNaN(result.page)).toBe(false);
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

		it("should wrap contains value with %", () => {
			const filters = [{ property: "name", op: "contains" as const, value: "test" }];
			const result = filtersToSearchParams(filters, undefined, 0, 20);
			expect(result["where.name.like"]).toBe("%test%");
		});
	});

	describe("rawIdOf", () => {
		it("should extract raw ID from global ID", () => {
			const node: NodeData = {
				id: "Merch:M001",
				type: "Merch",
				properties: {},
			};
			expect(rawIdOf(node)).toBe("M001");
		});

		it("should return full ID if no colon", () => {
			const node: NodeData = { id: "simple", type: "Test", properties: {} };
			expect(rawIdOf(node)).toBe("simple");
		});
	});

	describe("neighborsFromNodes", () => {
		it("should convert nodes to neighbor data", () => {
			const nodes: NodeData[] = [
				{ id: "Agent:A001", type: "Agent", properties: { name: "Agent 1" } },
				{ id: "Agent:A002", type: "Agent", properties: { name: "Agent 2" } },
			];
			const opts: GetNeighborsOpts = {
				relation: "for_agent",
				limit: 10,
				offset: 0,
			};
			const result = neighborsFromNodes(nodes, "for_agent", "out", opts);

			expect(result.items.length).toBe(2);
			expect(result.items[0].nodeId).toBe("Agent:A001");
			expect(result.items[0].relation).toBe("for_agent");
			expect(result.items[0].direction).toBe("out");
		});

		it("should filter by targetType", () => {
			const nodes: NodeData[] = [
				{ id: "Agent:A001", type: "Agent", properties: {} },
				{ id: "Merch:M001", type: "Merch", properties: {} },
			];
			const opts: GetNeighborsOpts = {
				relation: "for_agent",
				targetType: "Agent",
				limit: 10,
				offset: 0,
			};
			const result = neighborsFromNodes(nodes, "for_agent", "out", opts);

			expect(result.items.length).toBe(1);
			expect(result.items[0].type).toBe("Agent");
		});

		it("should apply pagination", () => {
			const nodes: NodeData[] = [
				{ id: "Agent:A001", type: "Agent", properties: {} },
				{ id: "Agent:A002", type: "Agent", properties: {} },
				{ id: "Agent:A003", type: "Agent", properties: {} },
			];
			const opts: GetNeighborsOpts = {
				relation: "for_agent",
				limit: 2,
				offset: 1,
			};
			const result = neighborsFromNodes(nodes, "for_agent", "out", opts);

			expect(result.items.length).toBe(2);
			expect(result.items[0].nodeId).toBe("Agent:A002");
			// offset=1, limit=2, total=3 → 1+2=3, items after filtering=3 → hasMore = 3 < 3 = false
			expect(result.page.hasMore).toBe(false);
		});
	});
});

// ── New compute/aggregate helpers ──

describe("computeFiltersToSearchParams", () => {
	it("should map eq/ne/gt/in to correct where params", () => {
		const filters: ComputeFilter[] = [
			{ field: "status", op: "eq", value: "active" },
			{ field: "amount", op: "ne", value: 0 },
			{ field: "price", op: "gt", value: 100 },
			{ field: "category", op: "in", value: ["A", "B"] },
		];
		const result = computeFiltersToSearchParams(filters);
		expect(result["where.status.eq"]).toBe("active");
		expect(result["where.amount.neq"]).toBe(0);
		expect(result["where.price.gt"]).toBe(100);
		expect(result["where.category.in"]).toBe("A,B");
	});

	it("should expand between into gte + lte params", () => {
		const filters: ComputeFilter[] = [
			{ field: "amount", op: "between", value: [100, 500] },
		];
		const result = computeFiltersToSearchParams(filters);
		expect(result["where.amount.gte"]).toBe(100);
		expect(result["where.amount.lte"]).toBe(500);
	});

	it("should skip unknown ops", () => {
		const filters: ComputeFilter[] = [
			{ field: "status", op: "eq", value: "active" },
			{ field: "name", op: "startsWith" as any, value: "test" },
		];
		const result = computeFiltersToSearchParams(filters);
		expect(result["where.status.eq"]).toBe("active");
		expect(Object.keys(result).length).toBe(1);
	});

	it("should return empty object for empty filters", () => {
		const result = computeFiltersToSearchParams([]);
		expect(Object.keys(result).length).toBe(0);
	});
});

describe("metricsToParam", () => {
	it("should format count(*) with alias", () => {
		const metrics: AggregateMetric[] = [
			{ field: "*", fn: "count", as: "total" },
		];
		expect(metricsToParam(metrics)).toBe("count(*).total");
	});

	it("should format sum(field) with alias", () => {
		const metrics: AggregateMetric[] = [
			{ field: "amount", fn: "sum", as: "totalAmount" },
		];
		expect(metricsToParam(metrics)).toBe("sum(amount).totalAmount");
	});

	it("should comma-join multiple metrics", () => {
		const metrics: AggregateMetric[] = [
			{ field: "*", fn: "count", as: "total" },
			{ field: "amount", fn: "sum", as: "amount" },
		];
		expect(metricsToParam(metrics)).toBe("count(*).total,sum(amount).amount");
	});
});

describe("computeQueryToAggregateParams", () => {
	it("should build full params with filters, metrics, groupBy, orderBy, limit/offset", () => {
		const query: ComputeQuery = {
			source: "OrderDaily",
			filters: [
				{ field: "status", op: "eq", value: "active" },
			],
			metrics: [
				{ field: "*", fn: "count", as: "total" },
				{ field: "amount", fn: "sum", as: "totalAmount" },
			],
			groupBy: ["status"],
			orderBy: [
				{ field: "totalAmount", direction: "desc" },
			],
			limit: 10,
			offset: 20,
		};
		const result = computeQueryToAggregateParams(query);
		expect(result.metrics).toBe("count(*).total,sum(amount).totalAmount");
		expect(result.group_by).toBe("status");
		expect(result.order).toBe("totalAmount.desc");
		expect(result["where.status.eq"]).toBe("active");
		expect(result.pagesize).toBe(10);
		expect(result.page).toBe(2);
		expect(result.select).toBeUndefined();
	});

	it("should handle minimal query with source + metrics only", () => {
		const query: ComputeQuery = {
			source: "OrderDaily",
			metrics: [
				{ field: "*", fn: "count", as: "total" },
			],
		};
		const result = computeQueryToAggregateParams(query);
		expect(result.metrics).toBe("count(*).total");
		expect(result.page).toBe(0);
		expect(result.pagesize).toBe(20);
		expect(result.select).toBeUndefined();
		expect(result.group_by).toBeUndefined();
		expect(result.order).toBeUndefined();
	});
});

describe("normalizeAggregateRows", () => {
	it("should extract groupBy fields into group object", () => {
		const rows = [
			{ status: "active", total: 10, amount: 500 },
			{ status: "inactive", total: 5, amount: 200 },
		];
		const result = normalizeAggregateRows(rows, ["status"], ["total", "amount"]);
		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({ group: { status: "active" }, total: 10, amount: 500 });
		expect(result[1]).toEqual({ group: { status: "inactive" }, total: 5, amount: 200 });
	});

	it("should return only metric aliases when no groupBy", () => {
		const rows = [
			{ total: 10, amount: 500 },
		];
		const result = normalizeAggregateRows(rows, undefined, ["total", "amount"]);
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({ total: 10, amount: 500 });
		expect(result[0].group).toBeUndefined();
	});

	it("should handle multiple groupBy fields", () => {
		const rows = [
			{ status: "active", region: "US", total: 10 },
		];
		const result = normalizeAggregateRows(rows, ["status", "region"], ["total"]);
		expect(result[0]).toEqual({ group: { status: "active", region: "US" }, total: 10 });
	});
});

describe("ontologyTypeToFieldSchema", () => {
	it("should map number to number type with aggregatable true", () => {
		const result = ontologyTypeToFieldSchema({ name: "amount", type: "number", description: "" });
		expect(result).toEqual({ name: "amount", type: "number", aggregatable: true });
	});

	it("should map integer to number type with aggregatable true", () => {
		const result = ontologyTypeToFieldSchema({ name: "count", type: "integer", description: "" });
		expect(result).toEqual({ name: "count", type: "number", aggregatable: true });
	});

	it("should map float to number type with aggregatable true", () => {
		const result = ontologyTypeToFieldSchema({ name: "rate", type: "float", description: "" });
		expect(result).toEqual({ name: "rate", type: "number", aggregatable: true });
	});

	it("should map string to string type with aggregatable false", () => {
		const result = ontologyTypeToFieldSchema({ name: "name", type: "string", description: "" });
		expect(result).toEqual({ name: "name", type: "string", aggregatable: false });
	});

	it("should map date to date type with aggregatable false", () => {
		const result = ontologyTypeToFieldSchema({ name: "created", type: "date", description: "" });
		expect(result).toEqual({ name: "created", type: "date", aggregatable: false });
	});

	it("should map datetime to date type with aggregatable false", () => {
		const result = ontologyTypeToFieldSchema({ name: "ts", type: "datetime", description: "" });
		expect(result).toEqual({ name: "ts", type: "date", aggregatable: false });
	});

	it("should map timestamp to date type with aggregatable false", () => {
		const result = ontologyTypeToFieldSchema({ name: "ts", type: "timestamp", description: "" });
		expect(result).toEqual({ name: "ts", type: "date", aggregatable: false });
	});

	it("should map boolean to boolean type with aggregatable false", () => {
		const result = ontologyTypeToFieldSchema({ name: "active", type: "boolean", description: "" });
		expect(result).toEqual({ name: "active", type: "boolean", aggregatable: false });
	});

	it("should map unknown types to string with aggregatable false", () => {
		const result = ontologyTypeToFieldSchema({ name: "data", type: "json", description: "" });
		expect(result).toEqual({ name: "data", type: "string", aggregatable: false });
	});
});

describe("ontologyToSourceSchema", () => {
	const ontology: Ontology = {
		version: "1.0.0",
		types: [
			{
				name: "OrderDaily",
				description: "Daily orders",
				properties: [
					{ name: "amount", type: "number", description: "Order amount" },
					{ name: "status", type: "string", description: "Order status" },
					{ name: "created", type: "date", description: "Created date" },
					{ name: "active", type: "boolean", description: "Is active" },
				],
				methods: [],
			},
		],
		relations: [],
	};

	it("should return FieldSchema[] with aggregatable flags for valid source", () => {
		const result = ontologyToSourceSchema(ontology, "OrderDaily");
		expect(result.fields).toHaveLength(4);
		expect(result.fields[0]).toEqual({ name: "amount", type: "number", aggregatable: true });
		expect(result.fields[1]).toEqual({ name: "status", type: "string", aggregatable: false });
		expect(result.fields[2]).toEqual({ name: "created", type: "date", aggregatable: false });
		expect(result.fields[3]).toEqual({ name: "active", type: "boolean", aggregatable: false });
	});

	it("should return empty fields for unknown source", () => {
		const result = ontologyToSourceSchema(ontology, "UnknownType");
		expect(result).toEqual({ fields: [] });
	});
});
