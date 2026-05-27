import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseNode } from "../../../ontology/base-node";
import type { NodeData, Paginated } from "../../../engine";
import type {
	AccessContext,
	RestAccessBindingMap,
	RestNodeClassRegistry,
} from "../context";
import type { SearchParams } from "../http-client";
import { neighborsFromNodes } from "../helpers";

vi.mock("../api-search", () => ({
	apiSearchSafe: vi.fn(),
	apiSearchArraySafe: vi.fn(),
	apiSearch: vi.fn(),
	emptyPaginated: (limit: number, offset: number) => ({
		items: [],
		page: { offset, limit, hasMore: false, total: 0 },
	}),
	isNotFoundError: () => false,
}));

import { apiSearchSafe } from "../api-search";
import { RestQueryGraphStore } from "../react-query-store";

const mockedApiSearchSafe = vi.mocked(apiSearchSafe);

// Mock BaseNode class - minimal implementation for testing
class MockMerchNode extends BaseNode {
	constructor(id: string) {
		super(id);
	}
}

describe("RestQueryGraphStore", () => {
	let provider: RestQueryGraphStore;
	let mockCtx: Partial<AccessContext>;
	let mockBindings: RestAccessBindingMap;
	let mockTypeRegistry: RestNodeClassRegistry;

	beforeEach(() => {
		mockTypeRegistry = {
			Merch: {
				class: MockMerchNode,
				prefix: "/merch",
			},
			Agent: { prefix: "/agent" },
		};

		mockBindings = {
			"Merch:for_agent:out": {
				kind: "search",
				relation: "for_agent",
				fromType: "Merch",
				toType: "Agent",
				direction: "out",
				searchOn: "Agent",
				params: (source: NodeData) => ({
					"where.merch_no.eq": source.id.split(":")[1],
				}),
			},
		};

		const mockFetchOne = vi.fn(
			async (type: string, rawId: string): Promise<NodeData | undefined> => {
				if (type === "Merch" && rawId === "M001") {
					return {
						id: "Merch:M001",
						type: "Merch",
						properties: { merch_no: "M001", name: "Test Merch" },
					};
				}
				return undefined;
			},
		);

		const mockApiSearchSafe = vi.fn(
			async <T extends Record<string, unknown>>(
				prefix: string,
				_query?: SearchParams,
			): Promise<Paginated<T>> => {
				if (prefix === "/merch") {
					return {
						items: [{ id: "M001", merch_no: "M001", name: "Test Merch" }] as unknown as T[],
						page: { offset: 0, limit: 20, hasMore: false, total: 1 },
					};
				}
				return {
					items: [],
					page: { offset: 0, limit: 20, hasMore: false, total: 0 },
				};
			},
		);
		mockedApiSearchSafe.mockImplementation(mockApiSearchSafe);

		mockCtx = {
			typeRegistry: mockTypeRegistry,
			fetchOne: mockFetchOne,
			fetchMany: vi.fn(async (type: string, rawIds: string[]) => {
				if (type !== "Agent") return [];
				return rawIds.map((rawId) => ({
					id: `Agent:${rawId}`,
					type: "Agent",
					properties: { id: rawId, agent_no: `NO-${rawId}`, name: `Agent ${rawId}` },
				}));
			}) as AccessContext["fetchMany"],
			apiSearchSafe: mockApiSearchSafe as AccessContext["apiSearchSafe"],
			rawId: (node: NodeData) => node.id.split(":")[1],
			toGlobalId: (type: string, rawId: string) => `${type}:${rawId}`,
			neighborsFromNodes,
			emptyNeighbors: (limit: number, offset: number) => ({
				items: [],
				page: { offset, limit, hasMore: false, total: 0 },
			}),
		};
	});

	describe("getNode", () => {
		it("should return NodeData for valid ID", async () => {
			provider = new RestQueryGraphStore(mockBindings, mockCtx);
			const result = await provider.getNode("Merch:M001");
			expect(result).toBeDefined();
			expect(result?.type).toBe("Merch");
			expect(result?.id).toBe("Merch:M001");
		});

		it("should return undefined for invalid ID format", async () => {
			provider = new RestQueryGraphStore(mockBindings, mockCtx);
			const result = await provider.getNode("invalid");
			expect(result).toBeUndefined();
		});
	});

	describe("getBaseNode", () => {
		it("should return cached BaseNode instance", async () => {
			provider = new RestQueryGraphStore(mockBindings, mockCtx);
			const result1 = await provider.getBaseNode("Merch:M001");
			expect(result1).toBeDefined();
			expect(result1?.id).toBe("Merch:M001");

			// 第二次调用应返回缓存
			const result2 = await provider.getBaseNode("Merch:M001");
			expect(result2).toBe(result1);
		});

		it("should return undefined for unknown type", async () => {
			provider = new RestQueryGraphStore(mockBindings, mockCtx);
			const result = await provider.getBaseNode("Unknown:001");
			expect(result).toBeUndefined();
		});
	});

	describe("getNeighborsBatch", () => {
		it("should batch search bindings with where.*.in", async () => {
			provider = new RestQueryGraphStore(mockBindings, mockCtx);
			const cache = new Map<string, NodeData>([
				[
					"Merch:M001",
					{
						id: "Merch:M001",
						type: "Merch",
						properties: { merch_no: "M001", name: "Test Merch" },
					},
				],
				[
					"Merch:M002",
					{
						id: "Merch:M002",
						type: "Merch",
						properties: { merch_no: "M002", name: "Another Merch" },
					},
				],
			]);

			mockedApiSearchSafe.mockImplementation(async (prefix: string, query?: SearchParams) => {
				if (prefix === "/agent" && query?.["where.merch_no.in"]) {
					const nos = String(query["where.merch_no.in"]).split(",");
					return {
						items: nos.map((no) => ({
							id: `A-${no}`,
							agent_no: `NO-${no}`,
							merch_no: no,
							name: `Agent for ${no}`,
						})),
						page: { offset: 0, limit: 100, hasMore: false, total: nos.length },
					};
				}
				return { items: [], page: { offset: 0, limit: 20, hasMore: false, total: 0 } };
			});

			const result = await provider.getNeighborsBatch(
				["Merch:M001", "Merch:M002"],
				{ relation: "for_agent", direction: "out" },
				{ nodeDataCache: cache },
			);

			expect(result.get("Merch:M001")?.items).toHaveLength(1);
			expect(result.get("Merch:M002")?.items).toHaveLength(1);
			expect(mockedApiSearchSafe).toHaveBeenCalledWith(
				"/agent",
				expect.objectContaining({ "where.merch_no.in": "M001,M002" }),
			);
		});
	});

	describe("query", () => {
		it("should reuse nodeDataCache in RETURN phase", async () => {
			provider = new RestQueryGraphStore(mockBindings, mockCtx);
			const cache = new Map<string, NodeData>();
			const fetchMany = vi.fn(async () => []);
			mockCtx.fetchMany = fetchMany as AccessContext["fetchMany"];

			mockedApiSearchSafe.mockImplementation(async (prefix: string) => {
				if (prefix === "/merch") {
					return {
						items: [{ id: "M001", merch_no: "M001", name: "Test Merch", status: "active" }],
						page: { offset: 0, limit: 500, hasMore: false, total: 1 },
					};
				}
				return { items: [], page: { offset: 0, limit: 20, hasMore: false, total: 0 } };
			});

			const result = await provider.query(
				{
					match: { type: "Merch", where: [{ property: "status", op: "eq", value: "active" }] },
					return: { fields: ["merch_no", "name"], limit: 10 },
				},
				undefined,
				{ nodeDataCache: cache },
			);

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data.rows).toHaveLength(1);
				expect(result.data.rows[0]?.properties.merch_no).toBe("M001");
			}
			expect(fetchMany).not.toHaveBeenCalled();
			expect(cache.size).toBeGreaterThan(0);
		});
	});

	describe("parseGlobalId", () => {
		it("should parse valid global ID", () => {
			provider = new RestQueryGraphStore(mockBindings, mockCtx);
			const result = provider.parseGlobalId("Merch:M001");
			expect(result.type).toBe("Merch");
			expect(result.rawId).toBe("M001");
		});

		it("should throw for invalid ID format", () => {
			provider = new RestQueryGraphStore(mockBindings, mockCtx);
			expect(() => provider.parseGlobalId("invalid")).toThrow();
		});
	});
});
