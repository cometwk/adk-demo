import type { Graph } from "../../runtime/graph";

// ── Query Statistics Interface ──
// Mock implementations for demo; user will provide real implementations later.

export type SqlResult = {
	rows: Record<string, unknown>[];
	rowCount: number;
	executionTimeMs: number;
};

export type AgentInfo = {
	agentNo: string;
	name: string;
	disabled: boolean;
	parentId: string;
	children: string[];
	boundMerchants: string[];
};

export type MerchInfo = {
	merchNo: string;
	name: string;
	rate: number;
	contactName: string;
	contactPhone: string;
	boundAgents: string[];
};

export type ApplyInfo = {
	applyNo: string;
	agentNo: string;
	merchNo: string;
	merchName: string;
	status: "INIT" | "PENDING" | "SUCCESS" | "FAIL";
	statusReason: string;
	chanNo: string;
	rate: number;
};

// ── SQL Pseudo Function ──
// User will implement real SQL execution later.

export function executeSql(sql: string): SqlResult {
	// Mock implementation — returns empty result with timing
	console.log(`[executeSql] Mock executing: ${sql.slice(0, 100)}...`);
	return {
		rows: [],
		rowCount: 0,
		executionTimeMs: 0,
	};
}

// ── Single Entity Queries ──

export function queryAgent(graph: Graph, agentNo: string): AgentInfo | null {
	// Find agent node by agentNo
	for (const [id, node] of graph.nodes) {
		if (node.constructor.name === "Agent") {
			const props = node.getProperties();
			if (props.agentNo === agentNo) {
				// Get children from has_parent edges
				const children: string[] = [];
				for (const edge of graph.edges) {
					if (edge.type === "has_parent" && edge.to === id) {
						const childNode = graph.getNode(edge.from);
						if (childNode) {
							children.push((childNode.getProperties().agentNo as string) || edge.from);
						}
					}
				}
				// Get bound merchants from binds → relates_to edges
				const boundMerchants: string[] = [];
				for (const edge of graph.edges) {
					if (edge.type === "binds" && edge.from === id) {
						const agentRelId = edge.to;
						for (const e2 of graph.edges) {
							if (e2.type === "relates_to" && e2.from === agentRelId) {
								const merchNode = graph.getNode(e2.to);
								if (merchNode) {
									boundMerchants.push((merchNode.getProperties().merchNo as string) || e2.to);
								}
							}
						}
					}
				}
				return {
					agentNo: props.agentNo as string,
					name: props.name as string,
					disabled: props.disabled as boolean,
					parentId: props.parentId as string,
					children,
					boundMerchants,
				};
			}
		}
	}
	return null;
}

export function queryMerch(graph: Graph, merchNo: string): MerchInfo | null {
	for (const [id, node] of graph.nodes) {
		if (node.constructor.name === "Merch") {
			const props = node.getProperties();
			if (props.merchNo === merchNo) {
				// Get bound agents from relates_to → binds edges
				const boundAgents: string[] = [];
				for (const edge of graph.edges) {
					if (edge.type === "relates_to" && edge.to === id) {
						const agentRelId = edge.from;
						for (const e2 of graph.edges) {
							if (e2.type === "binds" && e2.to === agentRelId) {
								const agentNode = graph.getNode(e2.from);
								if (agentNode) {
									boundAgents.push((agentNode.getProperties().agentNo as string) || e2.from);
								}
							}
						}
					}
				}
				return {
					merchNo: props.merchNo as string,
					name: props.name as string,
					rate: props.rate as number,
					contactName: props.contactName as string,
					contactPhone: props.contactPhone as string,
					boundAgents,
				};
			}
		}
	}
	return null;
}

export function queryApply(graph: Graph, applyNo: string): ApplyInfo | null {
	for (const [id, node] of graph.nodes) {
		if (node.constructor.name === "Apply") {
			const props = node.getProperties();
			if (props.applyNo === applyNo) {
				return {
					applyNo: props.applyNo as string,
					agentNo: props.agentNo as string,
					merchNo: props.merchNo as string,
					merchName: props.merchName as string,
					status: props.status as "INIT" | "PENDING" | "SUCCESS" | "FAIL",
					statusReason: props.statusReason as string,
					chanNo: props.chanNo as string,
					rate: props.rate as number,
				};
			}
		}
	}
	return null;
}

// ── Hierarchy Queries ──

export function queryAgentChildren(graph: Graph, agentNo: string): string[] {
	const agentInfo = queryAgent(graph, agentNo);
	return agentInfo?.children ?? [];
}

export function queryAgentDescendants(graph: Graph, agentNo: string): string[] {
	// Recursive traversal via has_parent edges
	const descendants: string[] = [];
	const visited = new Set<string>();

	const recurse = (currentId: string) => {
		if (visited.has(currentId)) return;
		visited.add(currentId);
		for (const edge of graph.edges) {
			if (edge.type === "has_parent" && edge.to === currentId) {
				const childNode = graph.getNode(edge.from);
				if (childNode) {
					const childNo = (childNode.getProperties().agentNo as string) || edge.from;
					descendants.push(childNo);
					recurse(edge.from);
				}
			}
		}
	};

	// Find agent node id
	for (const [id, node] of graph.nodes) {
		if (node.constructor.name === "Agent" && node.getProperties().agentNo === agentNo) {
			recurse(id);
			break;
		}
	}

	return descendants;
}

// ── Relationship Aggregation Queries ──

export function queryMerchBoundAgents(graph: Graph, merchNo: string): string[] {
	const merchInfo = queryMerch(graph, merchNo);
	return merchInfo?.boundAgents ?? [];
}

// ── Time Range Statistics Queries (via SQL) ──
// These use the executeSql pseudo function with mock implementations.

export function queryProfitDaily(agentNo: string, startDate: string, endDate: string): SqlResult {
	const sql = `
		SELECT stat_date, agent_no, total_trade_amt, total_profit, net_profit
		FROM profit_daily
		WHERE agent_no = '${agentNo}'
		AND stat_date BETWEEN '${startDate}' AND '${endDate}'
		ORDER BY stat_date
	`;
	return executeSql(sql);
}

export function queryOrderDaily(merchNo: string, startDate: string, endDate: string): SqlResult {
	const sql = `
		SELECT report_date, merch_no, total_count, total_amount
		FROM order_daily
		WHERE merch_no = '${merchNo}'
		AND report_date BETWEEN '${startDate}' AND '${endDate}'
		ORDER BY report_date
	`;
	return executeSql(sql);
}