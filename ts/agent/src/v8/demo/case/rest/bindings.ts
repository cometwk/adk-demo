import type {
	GetNeighborsOpts,
	NeighborData,
	NodeData,
	Paginated,
} from "../../../engine";
import type {
	RestNodeClassRegistry,
	SearchParams,
} from "../../../provider/rest-query";

// 扩展 AccessContext 包含业务专用方法
export type PaymentAccessContext = {
	typeRegistry: RestNodeClassRegistry;
	rawId: (node: NodeData) => string;
	toGlobalId: (type: string, rawId: string) => string;
	apiSearchSafe: <T extends Record<string, unknown>>(
		prefix: string,
		query?: SearchParams,
	) => Promise<Paginated<T>>;
	fetchOne: (type: string, rawId: string) => Promise<NodeData | undefined>;
	fetchMany: (type: string, rawIds: string[]) => Promise<NodeData[]>;
	neighborsFromNodes: (
		nodes: NodeData[],
		relation: string,
		direction: "out" | "in",
		opts: GetNeighborsOpts,
		pageInfo?: Paginated<NodeData>["page"],
	) => Paginated<NeighborData>;
	emptyNeighbors: (limit: number, offset: number) => Paginated<NeighborData>;
	// 业务扩展方法
	agentsByIds: (
		ctx: PaymentAccessContext,
		agentIds: string[],
		relation: string,
		direction: "out" | "in",
		opts: GetNeighborsOpts,
	) => Promise<Paginated<NeighborData>>;
	agentsByNos: (
		ctx: PaymentAccessContext,
		agentNos: string[],
		relation: string,
		direction: "out" | "in",
		opts: GetNeighborsOpts,
	) => Promise<Paginated<NeighborData>>;
	merchsByIds: (
		ctx: PaymentAccessContext,
		merchIds: string[],
		relation: string,
		direction: "out" | "in",
		opts: GetNeighborsOpts,
	) => Promise<Paginated<NeighborData>>;
};

export type PaymentAccessBinding =
	| {
			kind: "search";
			relation: string;
			fromType: string;
			toType: string;
			direction: "out" | "in";
			searchOn: string;
			params: (source: NodeData, ctx: PaymentAccessContext) => SearchParams;
			optional?: boolean;
	  }
	| {
			kind: "custom";
			relation: string;
			fromType: string;
			toType: string;
			direction: "out" | "in";
			handler: (
				source: NodeData,
				opts: GetNeighborsOpts,
				ctx: PaymentAccessContext,
			) => Promise<Paginated<NeighborData>>;
	  };

export type PaymentAccessBindingMap = Record<string, PaymentAccessBinding>;

const MAX_RESOLVE_LIMIT = 100;

// 业务扩展方法实现
async function agentsByIdsImpl(
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

async function agentsByNosImpl(
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
		if (row) {
			nodes.push({
				id: ctx.toGlobalId("Agent", String(row.id)),
				type: "Agent",
				properties: row,
			});
		}
	}
	return ctx.neighborsFromNodes(nodes, relation, direction, opts);
}

async function merchsByIdsImpl(
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

export const paymentAccessBindings: PaymentAccessBindingMap = {
	// Agent -> 直接上级 (Agent:parent:out)
	"Agent:parent:out": {
		kind: "custom",
		relation: "parent",
		fromType: "Agent",
		toType: "Agent",
		direction: "out",
		handler: async (source, opts, ctx) => {
			const parentId = source.properties.parent_id;
			if (!parentId || parentId === "0") {
				return ctx.emptyNeighbors(opts.limit ?? 20, opts.offset ?? 0);
			}
			const parent = await ctx.fetchOne("Agent", String(parentId));
			if (!parent) {
				return ctx.emptyNeighbors(opts.limit ?? 20, opts.offset ?? 0);
			}
			return ctx.neighborsFromNodes([parent], "parent", "out", opts);
		},
	},

	// Agent -> 直接下级 (Agent:children:out)
	"Agent:children:out": {
		kind: "search",
		relation: "children",
		fromType: "Agent",
		toType: "Agent",
		direction: "out",
		searchOn: "Agent",
		params: (source, ctx) => ({ "where.parent_id.eq": ctx.rawId(source) }),
	},

	// Agent -> 闭包后代 (Agent:descendant_of:out)
	"Agent:descendant_of:out": {
		kind: "custom",
		relation: "descendant_of",
		fromType: "Agent",
		toType: "Agent",
		direction: "out",
		handler: async (source, opts, ctx) => {
			const ancestorId = ctx.rawId(source);
			const limit = opts.limit ?? 20;
			const offset = opts.offset ?? 0;
			const closures = await ctx.apiSearchSafe<Record<string, unknown>>(
				"/agent_closure",
				{
					"where.ancestor_id.eq": ancestorId,
					"where.depth.gt": 0,
					pagesize: limit,
					page: limit > 0 ? Math.floor(offset / limit) : 0,
				},
			);
			const agentIds = closures.items.map((c) => String(c.descendant_id));
			return agentsByIdsImpl(ctx, agentIds, "descendant_of", "out", opts);
		},
	},

	// Agent -> 闭包祖先 (Agent:ancestor_of:out)
	"Agent:ancestor_of:out": {
		kind: "custom",
		relation: "ancestor_of",
		fromType: "Agent",
		toType: "Agent",
		direction: "out",
		handler: async (source, opts, ctx) => {
			const descendantId = ctx.rawId(source);
			const limit = opts.limit ?? 20;
			const offset = opts.offset ?? 0;
			const closures = await ctx.apiSearchSafe<Record<string, unknown>>(
				"/agent_closure",
				{
					"where.descendant_id.eq": descendantId,
					"where.depth.gt": 0,
					pagesize: limit,
					page: limit > 0 ? Math.floor(offset / limit) : 0,
				},
			);
			const agentIds = closures.items.map((c) => String(c.ancestor_id));
			return agentsByIdsImpl(ctx, agentIds, "ancestor_of", "out", opts);
		},
	},

	// Agent -> 绑定商户 (Agent:binds_merch:out)
	"Agent:binds_merch:out": {
		kind: "custom",
		relation: "binds_merch",
		fromType: "Agent",
		toType: "Merch",
		direction: "out",
		handler: async (source, opts, ctx) => {
			const agentNo = String(source.properties.agent_no ?? "");
			const rels = await ctx.apiSearchSafe<Record<string, unknown>>(
				"/agent_rel",
				{
					"where.agent_no.eq": agentNo,
					"where.agent_type.eq": "MERCH",
					pagesize: 500,
					page: 0,
				},
			);
			const merchIds = rels.items.map((r) => String(r.obj_id));
			return merchsByIdsImpl(ctx, merchIds, "binds_merch", "out", opts);
		},
	},

	// Agent -> 进件 (Agent:submitted_apply:out)
	"Agent:submitted_apply:out": {
		kind: "search",
		relation: "submitted_apply",
		fromType: "Agent",
		toType: "Apply",
		direction: "out",
		searchOn: "Apply",
		params: (source, _ctx) => ({
			"where.agent_no.eq": String(source.properties.agent_no ?? ""),
		}),
	},

	// Agent -> 日分润 (Agent:has_profit_daily:out)
	"Agent:has_profit_daily:out": {
		kind: "search",
		relation: "has_profit_daily",
		fromType: "Agent",
		toType: "ProfitDaily",
		direction: "out",
		searchOn: "ProfitDaily",
		params: (source, _ctx) => ({
			"where.agent_no.eq": String(source.properties.agent_no ?? ""),
		}),
	},

	// Merch -> 绑定代理 (Merch:bound_by:out)
	"Merch:bound_by:out": {
		kind: "custom",
		relation: "bound_by",
		fromType: "Merch",
		toType: "Agent",
		direction: "out",
		handler: async (source, opts, ctx) => {
			const merchNo = String(source.properties.merch_no ?? "");
			const rels = await ctx.apiSearchSafe<Record<string, unknown>>(
				"/agent_rel",
				{
					"where.obj_no.eq": merchNo,
					"where.agent_type.eq": "MERCH",
					pagesize: 100,
					page: 0,
				},
			);
			const agentNos = [...new Set(rels.items.map((r) => String(r.agent_no)))];
			return agentsByNosImpl(ctx, agentNos, "bound_by", "out", opts);
		},
	},

	// Merch -> 进件记录 (Merch:created_from:out)
	"Merch:created_from:out": {
		kind: "search",
		relation: "created_from",
		fromType: "Merch",
		toType: "Apply",
		direction: "out",
		searchOn: "Apply",
		params: (source, _ctx) => ({
			"where.merch_no.eq": String(source.properties.merch_no ?? ""),
		}),
	},

	// Merch -> 日交易 (Merch:has_order_daily:out)
	"Merch:has_order_daily:out": {
		kind: "search",
		relation: "has_order_daily",
		fromType: "Merch",
		toType: "OrderDaily",
		direction: "out",
		searchOn: "OrderDaily",
		params: (source, _ctx) => ({
			"where.merch_no.eq": String(source.properties.merch_no ?? ""),
		}),
	},

	// Apply -> 代理商 (Apply:submitted_by:out)
	"Apply:submitted_by:out": {
		kind: "custom",
		relation: "submitted_by",
		fromType: "Apply",
		toType: "Agent",
		direction: "out",
		handler: async (source, opts, ctx) => {
			const agentNo = String(source.properties.agent_no ?? "");
			return agentsByNosImpl(ctx, [agentNo], "submitted_by", "out", opts);
		},
	},

	// Apply -> 商户 (Apply:creates:out)
	"Apply:creates:out": {
		kind: "custom",
		relation: "creates",
		fromType: "Apply",
		toType: "Merch",
		direction: "out",
		handler: async (source, opts, ctx) => {
			const merchNo = String(source.properties.merch_no ?? "");
			if (!merchNo) {
				return ctx.emptyNeighbors(opts.limit ?? 20, opts.offset ?? 0);
			}
			const page = await ctx.apiSearchSafe<Record<string, unknown>>("/merch", {
				"where.merch_no.eq": merchNo,
				pagesize: 1,
				page: 0,
			});
			const nodeDatas = page.items.map((row) => ({
				id: ctx.toGlobalId("Merch", String(row.id)),
				type: "Merch",
				properties: row,
			}));
			return ctx.neighborsFromNodes(nodeDatas, "creates", "out", opts);
		},
	},

	// AgentRel -> Agent (AgentRel:for_agent:out)
	"AgentRel:for_agent:out": {
		kind: "custom",
		relation: "for_agent",
		fromType: "AgentRel",
		toType: "Agent",
		direction: "out",
		handler: async (source, opts, ctx) => {
			const agentNo = String(source.properties.agent_no ?? "");
			return agentsByNosImpl(ctx, [agentNo], "for_agent", "out", opts);
		},
	},

	// AgentRel -> Merch (AgentRel:for_merch:out)
	"AgentRel:for_merch:out": {
		kind: "custom",
		relation: "for_merch",
		fromType: "AgentRel",
		toType: "Merch",
		direction: "out",
		handler: async (source, opts, ctx) => {
			const objId = String(source.properties.obj_id ?? "");
			if (source.properties.agent_type !== "MERCH") {
				return ctx.emptyNeighbors(opts.limit ?? 20, opts.offset ?? 0);
			}
			const merch = await ctx.fetchOne("Merch", objId);
			if (!merch) return ctx.emptyNeighbors(opts.limit ?? 20, opts.offset ?? 0);
			return ctx.neighborsFromNodes([merch], "for_merch", "out", opts);
		},
	},

	// AgentClosure -> 祖先 Agent (AgentClosure:ancestor:out)
	"AgentClosure:ancestor:out": {
		kind: "custom",
		relation: "ancestor",
		fromType: "AgentClosure",
		toType: "Agent",
		direction: "out",
		handler: async (source, opts, ctx) => {
			const ancestorId = String(source.properties.ancestor_id ?? "");
			const agent = await ctx.fetchOne("Agent", ancestorId);
			if (!agent) return ctx.emptyNeighbors(opts.limit ?? 20, opts.offset ?? 0);
			return ctx.neighborsFromNodes([agent], "ancestor", "out", opts);
		},
	},

	// AgentClosure -> 后代 Agent (AgentClosure:descendant:out)
	"AgentClosure:descendant:out": {
		kind: "custom",
		relation: "descendant",
		fromType: "AgentClosure",
		toType: "Agent",
		direction: "out",
		handler: async (source, opts, ctx) => {
			const descendantId = String(source.properties.descendant_id ?? "");
			const agent = await ctx.fetchOne("Agent", descendantId);
			if (!agent) return ctx.emptyNeighbors(opts.limit ?? 20, opts.offset ?? 0);
			return ctx.neighborsFromNodes([agent], "descendant", "out", opts);
		},
	},

	// OrderDaily -> Merch (OrderDaily:for_merch:out)
	"OrderDaily:for_merch:out": {
		kind: "custom",
		relation: "for_merch",
		fromType: "OrderDaily",
		toType: "Merch",
		direction: "out",
		handler: async (source, opts, ctx) => {
			const merchNo = String(source.properties.merch_no ?? "");
			const page = await ctx.apiSearchSafe<Record<string, unknown>>("/merch", {
				"where.merch_no.eq": merchNo,
				pagesize: 1,
				page: 0,
			});
			const nodeDatas = page.items.map((row) => ({
				id: ctx.toGlobalId("Merch", String(row.id)),
				type: "Merch",
				properties: row,
			}));
			return ctx.neighborsFromNodes(nodeDatas, "for_merch", "out", opts);
		},
	},

	// ProfitDaily -> Agent (ProfitDaily:for_agent:out)
	"ProfitDaily:for_agent:out": {
		kind: "custom",
		relation: "for_agent",
		fromType: "ProfitDaily",
		toType: "Agent",
		direction: "out",
		handler: async (source, opts, ctx) => {
			const agentNo = String(source.properties.agent_no ?? "");
			return agentsByNosImpl(ctx, [agentNo], "for_agent", "out", opts);
		},
	},
};
