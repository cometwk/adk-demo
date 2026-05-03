import { Graph } from "../../runtime/graph";
import { EventStore, FactStore } from "../../runtime/eventStore";
import { clearRules } from "../../ontology/rules";
import type { FactBinding } from "../../runtime/types";
import { DataModel, DataSource, Dashboard, DataOwner } from "./entities";
import { registerDbtRules } from "./rules";
import { buildDbtCausalGraph } from "./causal";

// ── Graph seed ──
// Scenario: revenue_summary model failure → CFO Dashboard shows incorrect data.

export function seedDbtGraph(): Graph {
	const g = new Graph();

	// DataOwners
	const ownerData = new DataOwner("owner_data_team", "Data Platform Team", 8);
	const ownerFinance = new DataOwner("owner_finance_analytics", "Finance Analytics", 3);

	// DataSources
	const srcOrders = new DataSource("src_orders_api", "api", 1);          // updates hourly
	const srcPayments = new DataSource("src_payments_db", "database", 0.5); // updates every 30min

	// DataModels (lineage: orders_raw → orders_daily → revenue_summary)
	const ordersRaw = new DataModel("orders_raw", 2, 0.85, true, 500_000);
	const ordersDaily = new DataModel("orders_daily", 24, 0.70, true, 30_000);      // 24h SLA
	const revenueSummary = new DataModel("revenue_summary", 24, 0.45, true, 5_000); // low test coverage!
	const customerSegments = new DataModel("customer_segments", 48, 0.80, false, 10_000); // no owner!

	// Dashboards
	const cfoBoard = new Dashboard("cfo_dashboard", "critical", 2);    // feeds from revenue_summary
	const salesBoard = new Dashboard("sales_dashboard", "high", 3);
	const opsBoard = new Dashboard("ops_dashboard", "medium", 2);
	const mktBoard = new Dashboard("mkt_dashboard", "low", 1);

	for (const node of [
		ownerData, ownerFinance,
		srcOrders, srcPayments,
		ordersRaw, ordersDaily, revenueSummary, customerSegments,
		cfoBoard, salesBoard, opsBoard, mktBoard,
	]) {
		g.addNode(node);
	}

	// Lineage: source → model → model
	g.addEdge({ from: "src_orders_api", to: "orders_raw", type: "sourced_by" });
	g.addEdge({ from: "src_payments_db", to: "orders_raw", type: "sourced_by" });
	g.addEdge({ from: "orders_raw", to: "orders_daily", type: "depends_on" });
	g.addEdge({ from: "orders_daily", to: "revenue_summary", type: "depends_on" });
	g.addEdge({ from: "orders_daily", to: "customer_segments", type: "depends_on" });

	// Model → Dashboard
	g.addEdge({ from: "revenue_summary", to: "cfo_dashboard", type: "feeds" });
	g.addEdge({ from: "revenue_summary", to: "sales_dashboard", type: "feeds" });
	g.addEdge({ from: "revenue_summary", to: "ops_dashboard", type: "feeds" });
	g.addEdge({ from: "revenue_summary", to: "mkt_dashboard", type: "feeds" });
	g.addEdge({ from: "orders_daily", to: "sales_dashboard", type: "feeds" });
	g.addEdge({ from: "orders_daily", to: "ops_dashboard", type: "feeds" });

	// Ownership
	g.addEdge({ from: "orders_raw", to: "owner_data_team", type: "owned_by" });
	g.addEdge({ from: "orders_daily", to: "owner_data_team", type: "owned_by" });
	g.addEdge({ from: "revenue_summary", to: "owner_finance_analytics", type: "owned_by" });
	// customer_segments has NO owned_by edge → unowned

	return g;
}

// ── FactStore seed (predictive: current state snapshot) ──

export function seedDbtFactStore(): FactStore {
	const now = "2026-04-27T00:00:00.000Z";
	const bindings: FactBinding[] = [
		// DataModel properties
		{ entityId: "orders_raw", property: "freshnessSlaHours", value: 2, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "orders_raw", property: "testCoverage", value: 0.85, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "orders_raw", property: "hasOwner", value: true, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "orders_raw", property: "hoursSinceLastRefresh", value: 1.5, source: { kind: "aggregation" }, confidence: 0.95, validFrom: now, observedAt: now },

		{ entityId: "orders_daily", property: "freshnessSlaHours", value: 24, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "orders_daily", property: "testCoverage", value: 0.70, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "orders_daily", property: "hasOwner", value: true, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "orders_daily", property: "hoursSinceLastRefresh", value: 97, source: { kind: "aggregation" }, confidence: 0.95, validFrom: now, observedAt: now }, // ~4 days overdue!
		{ entityId: "orders_daily", property: "downstreamDashboardCount", value: 2, source: { kind: "aggregation" }, confidence: 1.0, validFrom: now, observedAt: now },

		{ entityId: "revenue_summary", property: "freshnessSlaHours", value: 24, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "revenue_summary", property: "testCoverage", value: 0.45, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now }, // low!
		{ entityId: "revenue_summary", property: "hasOwner", value: true, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "revenue_summary", property: "hoursSinceLastRefresh", value: 48, source: { kind: "aggregation" }, confidence: 0.95, validFrom: now, observedAt: now }, // 2x overdue
		{ entityId: "revenue_summary", property: "downstreamDashboardCount", value: 4, source: { kind: "aggregation" }, confidence: 1.0, validFrom: now, observedAt: now }, // >3 → high impact

		{ entityId: "customer_segments", property: "freshnessSlaHours", value: 48, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "customer_segments", property: "testCoverage", value: 0.80, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "customer_segments", property: "hasOwner", value: false, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now }, // unowned!
		{ entityId: "customer_segments", property: "hoursSinceLastRefresh", value: 50, source: { kind: "aggregation" }, confidence: 0.95, validFrom: now, observedAt: now },

		// DataSource properties
		{ entityId: "src_orders_api", property: "avgUpdateIntervalHours", value: 1, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "src_orders_api", property: "currentDelayHours", value: 96, source: { kind: "aggregation" }, confidence: 0.9, validFrom: now, observedAt: now }, // incident!
		{ entityId: "src_payments_db", property: "avgUpdateIntervalHours", value: 0.5, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "src_payments_db", property: "currentDelayHours", value: 0.4, source: { kind: "aggregation" }, confidence: 0.9, validFrom: now, observedAt: now },
	];
	return new FactStore(bindings);
}

// ── EventStore seed (diagnostic: incident timeline) ──
// T-0 = 2026-04-27T09:00Z (CFO Dashboard data incorrect discovered)

export function seedDbtEventStore(): EventStore {
	const store = new EventStore();

	// T-5d: Source incident — upstream API latency spike
	store.addEvent({
		id: "evt_source_incident",
		type: "source_incident",
		occurredAt: "2026-04-22T14:00:00.000Z",
		actorId: "monitoring_system",
		affectedEntities: ["src_orders_api"],
		payload: {
			description: "Orders API P99 latency spike to 30s, upstream timeout",
			causalEdgeId: "ce_source_incident_late_refresh",
		},
	});

	// T-4d: Late refresh — orders_daily 未按时刷新
	store.addEvent({
		id: "evt_orders_daily_late_refresh",
		type: "late_refresh",
		occurredAt: "2026-04-23T06:30:00.000Z",
		actorId: "dbt_scheduler",
		affectedEntities: ["orders_daily"],
		payload: {
			scheduledAt: "2026-04-23T02:00:00.000Z",
			actualAt: null,
			reason: "upstream src_orders_api timeout",
			causalEdgeId: "ce_late_refresh_stale_data",
		},
	});

	// T-3d: Schema drift — revenue_summary 字段变更
	store.addEvent({
		id: "evt_schema_drift",
		type: "schema_drift",
		occurredAt: "2026-04-24T10:00:00.000Z",
		actorId: "backend_engineering",
		affectedEntities: ["orders_raw"],
		payload: {
			description: "Column 'order_status' renamed to 'status' in orders source table",
			causalEdgeId: "ce_schema_drift_model_failure",
		},
	});

	// T-1d: Model failure — revenue_summary 跑失败
	store.addEvent({
		id: "evt_revenue_model_failure",
		type: "model_failure",
		occurredAt: "2026-04-26T03:15:00.000Z",
		actorId: "dbt_scheduler",
		affectedEntities: ["revenue_summary"],
		payload: {
			error: "ColumnNotFound: column 'order_status' not found",
			runId: "dbt_run_20260426",
			causalEdgeId: "ce_model_failure_downstream_blocked",
		},
	});

	// T-0: Dashboard incorrect — CFO Dashboard 数据错误
	store.addEvent({
		id: "evt_dashboard_incorrect",
		type: "dashboard_incorrect",
		occurredAt: "2026-04-27T09:00:00.000Z",
		actorId: "cfo_user",
		affectedEntities: ["cfo_dashboard", "revenue_summary"],
		payload: {
			description: "CFO Dashboard shows stale revenue data from 4 days ago",
			reportedBy: "CFO",
		},
	});

	return store;
}

// ── Full scenario setup ──

export function setupDbtScenario(): {
	graph: Graph;
	factStore: FactStore;
	eventStore: EventStore;
	causalGraph: ReturnType<typeof buildDbtCausalGraph>;
} {
	clearRules();
	registerDbtRules();

	return {
		graph: seedDbtGraph(),
		factStore: seedDbtFactStore(),
		eventStore: seedDbtEventStore(),
		causalGraph: buildDbtCausalGraph(),
	};
}
