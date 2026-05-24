import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NodeData, Paginated } from "../../../../engine";
import { BaseNode } from "../../../../ontology/base-node";
import type {
	AccessContext,
	RestAccessBindingMap,
	RestNodeClassRegistry,
	SearchParams,
} from "../../../../provider/rest-query";
import { RestQueryProvider } from "../../../../provider/rest-query";
import { paymentAccessBindings } from "../bindings";

// Mock BaseNode class - minimal implementation for testing
class MockAgentNode extends BaseNode {}

describe("RestQueryProvider", () => {
	let provider: RestQueryProvider;
	let mockCtx: Partial<AccessContext>;
	let mockTypeRegistry: RestNodeClassRegistry;

	beforeEach(() => {
		mockTypeRegistry = {
			Agent: { class: MockAgentNode, prefix: "/agent" },
			Merch: { prefix: "/merch" },
		};

		const mockFetchOne = vi.fn(
			async (type: string, rawId: string): Promise<NodeData | undefined> => {
				if (type === "Agent" && rawId === "A001") {
					return {
						id: "Agent:A001",
						type: "Agent",
						properties: { agent_no: "A001", name: "Test Agent" },
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
				if (prefix === "/agent") {
					return {
						items: [
							{ id: "A001", agent_no: "A001", name: "Test Agent" },
						] as unknown as T[],
						page: { offset: 0, limit: 20, hasMore: false, total: 1 },
					};
				}
				return {
					items: [],
					page: { offset: 0, limit: 20, hasMore: false, total: 0 },
				};
			},
		) as AccessContext["apiSearchSafe"];

		mockCtx = {
			typeRegistry: mockTypeRegistry,
			fetchOne: mockFetchOne,
			apiSearchSafe: mockApiSearchSafe,
			rawId: (node: NodeData) => node.id.split(":")[1],
			toGlobalId: (type: string, rawId: string) => `${type}:${rawId}`,
		};
	});

	describe("parseGlobalId", () => {
		it("should parse valid global ID", () => {
			provider = new RestQueryProvider(
				paymentAccessBindings as unknown as RestAccessBindingMap,
				mockCtx,
			);
			const result = provider.parseGlobalId("Agent:A001");
			expect(result.type).toBe("Agent");
			expect(result.rawId).toBe("A001");
		});

		it("should throw for invalid ID format", () => {
			provider = new RestQueryProvider(
				paymentAccessBindings as unknown as RestAccessBindingMap,
				mockCtx,
			);
			expect(() => provider.parseGlobalId("invalid")).toThrow();
		});
	});
});
