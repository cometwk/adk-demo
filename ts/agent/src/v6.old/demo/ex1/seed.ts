import { Graph } from "../../runtime/graph";
import { EventStore, FactStore } from "../../runtime/eventStore";
import { clearRules } from "../../ontology/rules";
import type { FactBinding } from "../../runtime/types";
import { Engineer, Team, Project } from "./entities";
import { registerEngineeringRules } from "./rules";
import { buildEngineeringCausalGraph } from "./causal";

// ── Graph seed ──

export function seedGraph(): Graph {
	const g = new Graph();

	const teamFrontend = new Team("team_frontend", "Product", 2);
	const teamBackend = new Team("team_backend", "Platform", 3);

	const alice = new Engineer("alice", 85, "senior");   // over 80h → burnout
	const bob = new Engineer("bob", 65, "mid");
	const carol = new Engineer("carol", 72, "senior");
	const dave = new Engineer("dave", 50, "mid");
	const eve = new Engineer("eve", 60, "junior");       // over 55h → burnout

	const projectPortal = new Project("project_portal", "high", 0.85);
	const projectApi = new Project("project_api", "medium", 0.55);

	for (const node of [teamFrontend, teamBackend, alice, bob, carol, dave, eve, projectPortal, projectApi]) {
		g.addNode(node);
	}

	g.addEdge({ from: "alice", to: "team_frontend", type: "member_of" });
	g.addEdge({ from: "bob", to: "team_frontend", type: "member_of" });
	g.addEdge({ from: "carol", to: "team_backend", type: "member_of" });
	g.addEdge({ from: "dave", to: "team_backend", type: "member_of" });
	g.addEdge({ from: "eve", to: "team_backend", type: "member_of" });
	g.addEdge({ from: "alice", to: "project_portal", type: "assigned_to" });
	g.addEdge({ from: "bob", to: "project_portal", type: "assigned_to" });
	g.addEdge({ from: "carol", to: "project_api", type: "assigned_to" });
	g.addEdge({ from: "dave", to: "project_api", type: "assigned_to" });
	g.addEdge({ from: "eve", to: "project_api", type: "assigned_to" });
	g.addEdge({ from: "project_portal", to: "team_frontend", type: "owned_by" });
	g.addEdge({ from: "project_api", to: "team_backend", type: "owned_by" });
	g.addEdge({ from: "project_portal", to: "project_api", type: "depends_on" });

	return g;
}

// ── Initial FactStore snapshot ──

export function seedFactStore(): FactStore {
	const now = "2026-04-27T00:00:00.000Z";
	const bindings: FactBinding[] = [
		// Engineers
		{ entityId: "alice", property: "workload", value: 85, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "alice", property: "seniority", value: "senior", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "bob", property: "workload", value: 65, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "bob", property: "seniority", value: "mid", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "carol", property: "workload", value: 72, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "carol", property: "seniority", value: "senior", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "dave", property: "workload", value: 50, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "dave", property: "seniority", value: "mid", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "eve", property: "workload", value: 60, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "eve", property: "seniority", value: "junior", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		// Teams
		{ entityId: "team_frontend", property: "capacity", value: 2, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "team_backend", property: "capacity", value: 3, source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		// Projects
		{ entityId: "project_portal", property: "priority", value: "high", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "project_api", property: "priority", value: "medium", source: { kind: "graph_property" }, confidence: 1.0, validFrom: now, observedAt: now },
		// Derived / aggregated
		{ entityId: "project_portal", property: "teamLoad", value: 150, source: { kind: "aggregation" }, confidence: 0.9, validFrom: now, observedAt: now },
		{ entityId: "project_portal", property: "seniorCount", value: 1, source: { kind: "aggregation" }, confidence: 0.9, validFrom: now, observedAt: now },
		{ entityId: "project_api", property: "teamLoad", value: 182, source: { kind: "aggregation" }, confidence: 0.9, validFrom: now, observedAt: now },
		{ entityId: "project_api", property: "seniorCount", value: 1, source: { kind: "aggregation" }, confidence: 0.9, validFrom: now, observedAt: now },
		// Member counts
		{ entityId: "team_frontend", property: "memberCount", value: 2, source: { kind: "aggregation" }, confidence: 1.0, validFrom: now, observedAt: now },
		{ entityId: "team_backend", property: "memberCount", value: 3, source: { kind: "aggregation" }, confidence: 1.0, validFrom: now, observedAt: now },
	];
	return new FactStore(bindings);
}

// ── EventStore seed (V6.5 diagnostic scenario) ──

export function seedEventStore(): EventStore {
	const store = new EventStore();

	store.addEvent({
		id: "evt_scope_added",
		type: "scope_added",
		occurredAt: "2026-04-08T09:00:00.000Z",
		actorId: "product_manager",
		affectedEntities: ["project_portal"],
		payload: { featureCount: 3, estimatedDaysAdded: 10, causalEdgeId: "ce_scope_added_pressure" },
	});

	store.addEvent({
		id: "evt_alice_workload_spike",
		type: "workload_changed",
		occurredAt: "2026-04-10T09:00:00.000Z",
		actorId: "system",
		affectedEntities: ["alice"],
		payload: { from: 75, to: 92, causalEdgeId: "ce_workload_burnout" },
		derivedBindings: [
			{
				entityId: "alice",
				property: "workload",
				value: 92,
				source: { kind: "derived", ref: "evt_alice_workload_spike" },
				confidence: 1.0,
				validFrom: "2026-04-10T09:00:00.000Z",
				observedAt: "2026-04-10T09:00:00.000Z",
			},
		],
	});

	store.addEvent({
		id: "evt_api_delivery_slip",
		type: "delivery_slip",
		occurredAt: "2026-04-15T17:00:00.000Z",
		actorId: "team_backend",
		affectedEntities: ["project_api", "project_portal"],
		payload: { delayDays: 7, reason: "Backend capacity overloaded", causalEdgeId: "ce_dep_slip_portal_blocked" },
	});

	store.addEvent({
		id: "evt_portal_blocked",
		type: "downstream_blocked",
		occurredAt: "2026-04-16T09:00:00.000Z",
		actorId: "system",
		affectedEntities: ["project_portal"],
		payload: { blockedBy: "project_api", causalEdgeId: "ce_blocked_milestone_miss" },
	});

	store.addEvent({
		id: "evt_milestone_missed",
		type: "milestone_missed",
		occurredAt: "2026-04-21T23:59:00.000Z",
		actorId: "system",
		affectedEntities: ["project_portal"],
		payload: {
			milestoneName: "v2.0 feature complete",
			originalDeadline: "2026-04-21",
			newDeadline: "2026-05-05",
		},
	});

	return store;
}

// ── Full scenario setup ──

export function setupScenario(): {
	graph: Graph;
	factStore: FactStore;
	eventStore: EventStore;
	causalGraph: ReturnType<typeof buildEngineeringCausalGraph>;
} {
	clearRules();
	registerEngineeringRules();

	return {
		graph: seedGraph(),
		factStore: seedFactStore(),
		eventStore: seedEventStore(),
		causalGraph: buildEngineeringCausalGraph(),
	};
}
