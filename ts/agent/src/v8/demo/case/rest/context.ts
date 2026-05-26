import type {
	GetNeighborsOpts,
	NeighborData,
	NodeData,
	Paginated,
} from "../../../engine";
import type { RestNodeClassRegistry } from "../../../provider/rest-query";
import {
	apiSearchSafe,
	emptyPaginated,
	toGlobalId,
} from "../../../provider/rest-query";
import type { PaymentAccessContext } from "./bindings";
import {
	Agent,
	AgentClosure,
	AgentRel,
	Apply,
	Merch,
	OrderDaily,
	ProfitDaily,
} from "./ontology";

// ID 处理函数
function rawIdOf(node: NodeData): string {
	const i = node.id.indexOf(":");
	return i === -1 ? node.id : node.id.slice(i + 1);
}

// AgentClosure 特殊 ID 处理
function rowToNodeData(type: string, row: Record<string, unknown>): NodeData {
	let rawId = String(row.id ?? "");
	if (type === "AgentClosure") {
		rawId = `${row.ancestor_id}_${row.descendant_id}`;
	}
	const { id: _id, ...rest } = row;
	return {
		id: toGlobalId(type, rawId),
		type,
		properties: rest,
	};
}

const MAX_RESOLVE_LIMIT = 100;

// 扩展方法实现
async function agentsByIds(
	ctx: PaymentAccessContext,
	rawIds: string[],
	relation: string,
	direction: "out" | "in",
	opts: GetNeighborsOpts,
): Promise<Paginated<NeighborData>> {
	const unique = [...new Set(rawIds.filter(Boolean))].slice(
		0,
		MAX_RESOLVE_LIMIT,
	);
	const nodes = await ctx.fetchMany("Agent", unique);
	return ctx.neighborsFromNodes(nodes, relation, direction, opts);
}

async function agentsByNos(
	ctx: PaymentAccessContext,
	agentNos: string[],
	relation: string,
	direction: "out" | "in",
	opts: GetNeighborsOpts,
): Promise<Paginated<NeighborData>> {
	const unique = [...new Set(agentNos.filter(Boolean))].slice(
		0,
		MAX_RESOLVE_LIMIT,
	);
	const nodes: NodeData[] = [];
	const prefix = ctx.typeRegistry.Agent?.prefix;
	if (!prefix) throw new Error('agentsByNos: unknown type "Agent"');
	for (const no of unique) {
		const page = await ctx.apiSearchSafe<Record<string, unknown>>(prefix, {
			"where.agent_no.eq": no,
			pagesize: 1,
			page: 0,
		});
		const row = page.items[0];
		if (row) nodes.push(rowToNodeData("Agent", row));
	}
	return ctx.neighborsFromNodes(nodes, relation, direction, opts);
}

async function merchsByIds(
	ctx: PaymentAccessContext,
	rawIds: string[],
	relation: string,
	direction: "out" | "in",
	opts: GetNeighborsOpts,
): Promise<Paginated<NeighborData>> {
	const unique = [...new Set(rawIds.filter(Boolean))].slice(
		0,
		MAX_RESOLVE_LIMIT,
	);
	const nodes = await ctx.fetchMany("Merch", unique);
	return ctx.neighborsFromNodes(nodes, relation, direction, opts);
}

// TypeRegistry 定义
export const typeRegistry: RestNodeClassRegistry = {
	Agent: { class: Agent, prefix: "/agent" },
	Merch: { class: Merch, prefix: "/merch" },
	Apply: { class: Apply, prefix: "/apply" },
	AgentRel: { class: AgentRel, prefix: "/agent_rel" },
	AgentClosure: { class: AgentClosure, prefix: "/agent_closure" },
	OrderDaily: { class: OrderDaily, prefix: "/order_daily" },
	ProfitDaily: { class: ProfitDaily, prefix: "/profit_daily" },
};

// 完整的 PaymentAccessContext 实现（用于 RestQueryGraphStore）
export function createPaymentAccessContext(): PaymentAccessContext {
	return {
		typeRegistry,
		rawId: rawIdOf,
		toGlobalId,
		apiSearchSafe,
		// fetchOne 和 fetchMany 由 RestQueryGraphStore.buildAccessContext 提供
		fetchOne: async (_type: string, _rawId: string) => {
			throw new Error("fetchOne should be provided by RestQueryGraphStore");
		},
		fetchMany: async (_type: string, _rawIds: string[]) => {
			throw new Error("fetchMany should be provided by RestQueryGraphStore");
		},
		neighborsFromNodes: (nodes, relation, direction, opts, pageInfo) => {
			const limit = opts.limit ?? 20;
			const offset = opts.offset ?? 0;
			let filtered = nodes;
			if (opts.targetType) {
				filtered = filtered.filter((n) => n.type === opts.targetType);
			}
			const items: NeighborData[] = filtered.map((n) => ({
				nodeId: n.id,
				type: n.type,
				relation,
				direction,
			}));
			const slice = items.slice(offset, offset + limit);
			return {
				items: slice,
				page: pageInfo ?? {
					offset,
					limit,
					hasMore: offset + limit < items.length,
					total: items.length,
				},
			};
		},
		emptyNeighbors: (limit, offset) => emptyPaginated(limit, offset),
		agentsByIds,
		agentsByNos,
		merchsByIds,
	};
}
