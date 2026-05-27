import type {
	GetNeighborsOpts,
	NeighborData,
	NodeData,
	Paginated,
} from "../../../engine";
import type { AccessContext } from "../../../provider/rest-query";

const MAX_RESOLVE_LIMIT = 100;

export async function resolveAgentsByIds(
	ctx: AccessContext,
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

export async function resolveAgentsByNos(
	ctx: AccessContext,
	agentNos: string[],
	relation: string,
	direction: "out" | "in",
	opts: GetNeighborsOpts,
): Promise<Paginated<NeighborData>> {
	const unique = [...new Set(agentNos.filter(Boolean))].slice(
		0,
		MAX_RESOLVE_LIMIT,
	);
	if (unique.length === 0) {
		return ctx.emptyNeighbors(opts.limit ?? 20, opts.offset ?? 0);
	}
	const prefix = ctx.typeRegistry.Agent?.prefix;
	if (!prefix) throw new Error('resolveAgentsByNos: unknown type "Agent"');
	const page = await ctx.apiSearchSafe<Record<string, unknown>>(prefix, {
		"where.agent_no.in": unique.join(","),
		pagesize: unique.length,
		page: 0,
	});
	const nodes = page.items.map((row) => ({
		id: ctx.toGlobalId("Agent", String(row.id)),
		type: "Agent",
		properties: row,
	}));
	return ctx.neighborsFromNodes(nodes, relation, direction, opts);
}

export async function resolveMerchsByIds(
	ctx: AccessContext,
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
