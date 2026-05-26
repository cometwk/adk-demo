import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NodeData, Paginated } from '../../../../engine'
import { BaseNode } from '../../../../ontology/base-node'
import type { AccessContext, RestAccessBindingMap, RestNodeClassRegistry, SearchParams } from '../../../../provider/rest-query'
import { RestQueryGraphStore } from '../../../../provider/rest-query'
import { paymentAccessBindings } from '../bindings'
import { Agent } from '../ontology'
import { createAccessContext } from '../context'
import { trace } from '../../../../../lib/trace'

// Mock BaseNode class - minimal implementation for testing
// class MockAgentNode extends BaseNode {}

describe('RestQueryGraphStore', () => {
  let provider: RestQueryGraphStore
  let mockCtx: Partial<AccessContext>
  let mockTypeRegistry: RestNodeClassRegistry

  beforeEach(() => {
    createAccessContext()
    mockTypeRegistry = {
      Agent: { class: Agent, prefix: '/agent' },
      Merch: { prefix: '/merch' },
    }

    // const mockFetchOne = vi.fn(
    // 	async (type: string, rawId: string): Promise<NodeData | undefined> => {
    // 		if (type === "Agent" && rawId === "A001") {
    // 			return {
    // 				id: "Agent:A001",
    // 				type: "Agent",
    // 				properties: { agent_no: "A001", name: "Test Agent" },
    // 			};
    // 		}
    // 		return undefined;
    // 	},
    // );

    // const mockApiSearchSafe = vi.fn(
    // 	async <T extends Record<string, unknown>>(
    // 		prefix: string,
    // 		_query?: SearchParams,
    // 	): Promise<Paginated<T>> => {
    // 		if (prefix === "/agent") {
    // 			return {
    // 				items: [
    // 					{ id: "A001", agent_no: "A001", name: "Test Agent" },
    // 				] as unknown as T[],
    // 				page: { offset: 0, limit: 20, hasMore: false, total: 1 },
    // 			};
    // 		}
    // 		return {
    // 			items: [],
    // 			page: { offset: 0, limit: 20, hasMore: false, total: 0 },
    // 		};
    // 	},
    // ) as AccessContext["apiSearchSafe"];

    mockCtx = {
      typeRegistry: mockTypeRegistry,
      // fetchOne: mockFetchOne,
      // apiSearchSafe: mockApiSearchSafe,
      // rawId: (node: NodeData) => node.id.split(":")[1],
      // toGlobalId: (type: string, rawId: string) => `${type}:${rawId}`,
    }
    provider = new RestQueryGraphStore(paymentAccessBindings as unknown as RestAccessBindingMap, mockCtx)
  })

  describe('parseGlobalId', () => {
    it('should parse valid global ID', () => {
      const result = provider.parseGlobalId('Agent:A001')
      expect(result.type).toBe('Agent')
      expect(result.rawId).toBe('A001')
    })

    it('just: 验证接口', async () => {
      const r = await provider.findNodes({ type: 'Agent', limit: 3, fields: ['id', 'agent_no', 'name'] })
      trace.user(r)
    })
  })
})
