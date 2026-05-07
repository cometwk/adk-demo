import { beforeEach, describe, expect, it } from "vitest";
import {
	type ConstraintKind,
	clearConstraints,
	evaluateConstraint,
	getConstraintById,
	getConstraints,
	queryConstraints,
	registerProjectPortalConstraints,
} from "./constraints";

beforeEach(() => {
	clearConstraints();
	registerProjectPortalConstraints();
});

describe("constraint registry", () => {
	it("returns all project portal constraints", () => {
		const all = getConstraints();
		expect(all.length).toBeGreaterThanOrEqual(7);
	});

	it("every constraint has non-empty id, kind, appliesTo, description, and requiredFacts", () => {
		for (const c of getConstraints()) {
			expect(c.id).toBeTruthy();
			expect(c.kind).toBeTruthy();
			expect(c.appliesTo.length).toBeGreaterThan(0);
			expect(c.description).toBeTruthy();
			expect(Array.isArray(c.requiredFacts)).toBe(true);
		}
	});

	it("queries project risk constraints by intent", () => {
		const riskRules = queryConstraints({ intent: "risk_assessment" });
		const riskIds = riskRules.map((r) => r.id);
		expect(riskIds).toContain("engineer_burnout_threshold");
		expect(riskIds).toContain("dependency_risk_propagation");
	});

	it("filters by kind", () => {
		const hardOnly = queryConstraints({ kind: "hard_constraint" });
		expect(hardOnly.every((c) => c.kind === "hard_constraint")).toBe(true);
		expect(hardOnly.length).toBeGreaterThan(0);

		const soft = queryConstraints({ kind: "soft_criterion" });
		expect(soft.every((c) => c.kind === "soft_criterion")).toBe(true);
	});

	it("filters by entity type", () => {
		const engineerRules = queryConstraints({ entityType: "Engineer" });
		expect(engineerRules.every((c) => c.appliesTo.includes("Engineer"))).toBe(
			true,
		);
		expect(engineerRules.map((c) => c.id)).toContain(
			"engineer_burnout_threshold",
		);
	});

	it("returns empty array for unknown entity type", () => {
		const result = queryConstraints({ entityType: "UnknownType" });
		expect(result).toEqual([]);
	});
});

describe("constraint evaluation", () => {
	it("engineer_burnout_threshold triggers for overloaded senior", () => {
		const result = evaluateConstraint("engineer_burnout_threshold", {
			workload: 85,
			seniority: "senior",
		});
		expect("triggered" in result && result.triggered).toBe(true);
	});

	it("engineer_burnout_threshold does not trigger for normal junior", () => {
		const result = evaluateConstraint("engineer_burnout_threshold", {
			workload: 50,
			seniority: "junior",
		});
		expect("triggered" in result && result.triggered).toBe(false);
	});

	it("high_priority_pressure triggers for high priority", () => {
		const result = evaluateConstraint("high_priority_pressure", {
			priority: "high",
		});
		expect("triggered" in result && result.triggered).toBe(true);
	});

	it("senior_coverage triggers when no seniors", () => {
		const result = evaluateConstraint("senior_coverage", { seniorCount: 0 });
		expect("triggered" in result && result.triggered).toBe(true);
	});

	it("dependency_risk_propagation triggers for HIGH dep risk", () => {
		const result = evaluateConstraint("dependency_risk_propagation", {
			dependencyRisk: "HIGH",
		});
		expect("triggered" in result && result.triggered).toBe(true);
	});

	it("missing required facts produce uncertainty, not false negative", () => {
		const result = evaluateConstraint("engineer_burnout_threshold", {});
		expect("missingFacts" in result).toBe(true);
		if ("missingFacts" in result) {
			expect(result.missingFacts.length).toBeGreaterThan(0);
		}
	});

	it("metadata-only constraint returns error on evaluate", () => {
		const result = evaluateConstraint("missing_high_impact_fact", {});
		expect("error" in result).toBe(true);
	});

	it("unknown constraint returns error", () => {
		const result = evaluateConstraint("nonexistent_rule", {});
		expect("error" in result).toBe(true);
	});
});

describe("project_portal scenario rules", () => {
	it("can trigger high_priority_pressure, senior_coverage, and dependency_risk_propagation", () => {
		const portalFacts = {
			priority: "high",
			seniorCount: 1,
			dependencyRisk: "MEDIUM",
		};

		const pressureResult = evaluateConstraint(
			"high_priority_pressure",
			portalFacts,
		);
		expect("triggered" in pressureResult && pressureResult.triggered).toBe(
			true,
		);

		const coverageResult = evaluateConstraint("senior_coverage", portalFacts);
		expect("triggered" in coverageResult && coverageResult.triggered).toBe(
			false,
		);

		const depResult = evaluateConstraint(
			"dependency_risk_propagation",
			portalFacts,
		);
		expect("triggered" in depResult && depResult.triggered).toBe(true);
	});
});
