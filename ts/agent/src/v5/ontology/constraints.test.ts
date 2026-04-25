import { beforeEach, describe, expect, it } from "vitest";
import type { ConstraintKind } from "../ontology/constraints";
import {
	filterRules,
	getAllRules,
	getRiskAssessmentRules,
	getRuleById,
	getRulesByKind,
	getRulesForEntity,
	initializeConstraints,
	validateAllRules,
	validateRule,
} from "../ontology/constraints";
import { RuleRegistry } from "../runtime/registry";

describe("Ontology Constraints", () => {
	beforeEach(() => {
		initializeConstraints();
	});

	describe("rule registration", () => {
		it("should register all predefined rules", () => {
			const rules = getAllRules();
			expect(rules.length).toBeGreaterThan(0);

			// 验证关键规则存在
			const expectedIds = [
				"engineer_burnout_threshold",
				"project_team_load",
				"senior_coverage",
				"dependency_risk_propagation",
				"high_priority_pressure",
				"deadline_pressure",
				"missing_fact_uncertainty",
			];

			for (const id of expectedIds) {
				expect(getRuleById(id)).toBeDefined();
			}
		});

		it("should get rule by id", () => {
			const rule = getRuleById("project_team_load");
			expect(rule).toBeDefined();
			expect(rule?.id).toBe("project_team_load");
			expect(rule?.kind).toBe("soft_criterion");
			expect(rule?.appliesTo).toContain("Project");
		});
	});

	describe("filter rules", () => {
		it("should filter by kind: hard_constraint", () => {
			const rules = getRulesByKind("hard_constraint");
			expect(rules.length).toBeGreaterThan(0);
			for (const r of rules) {
				expect(r.kind).toBe("hard_constraint");
			}
		});

		it("should filter by kind: soft_criterion", () => {
			const rules = getRulesByKind("soft_criterion");
			expect(rules.length).toBeGreaterThan(0);
			for (const r of rules) {
				expect(r.kind).toBe("soft_criterion");
			}
		});

		it("should filter by kind: inference_rule", () => {
			const rules = getRulesByKind("inference_rule");
			expect(rules.length).toBeGreaterThan(0);
			for (const r of rules) {
				expect(r.kind).toBe("inference_rule");
			}
		});

		it("should filter by kind: explanation_policy", () => {
			const rules = getRulesByKind("explanation_policy");
			expect(rules.length).toBeGreaterThan(0);
			for (const r of rules) {
				expect(r.kind).toBe("explanation_policy");
			}
		});

		it("should filter by entity type: Project", () => {
			const rules = getRulesForEntity("Project");
			expect(rules.length).toBeGreaterThan(0);
			for (const r of rules) {
				expect(r.appliesTo).toContain("Project");
			}
		});

		it("should filter by entity type: Engineer", () => {
			const rules = getRulesForEntity("Engineer");
			expect(rules.length).toBeGreaterThan(0);
			for (const r of rules) {
				expect(r.appliesTo).toContain("Engineer");
			}
		});

		it("should filter by intent: risk_assessment", () => {
			const rules = getRiskAssessmentRules();
			expect(rules.length).toBeGreaterThan(0);

			const expectedIds = [
				"engineer_burnout_threshold",
				"project_team_load",
				"senior_coverage",
				"dependency_risk_propagation",
				"high_priority_pressure",
				"deadline_pressure",
				"risk_aggregation",
				"missing_fact_uncertainty",
			];

			for (const id of expectedIds) {
				expect(rules.find((r) => r.id === id)).toBeDefined();
			}
		});

		it("should filter by intent and entity type", () => {
			const rules = getRiskAssessmentRules("Project");
			expect(rules.length).toBeGreaterThan(0);

			for (const r of rules) {
				expect(r.appliesTo).toContain("Project");
			}
		});

		it("should return empty array for unknown entity type", () => {
			const rules = getRulesForEntity("UnknownType");
			expect(rules).toEqual([]);
		});
	});

	describe("rule metadata validation", () => {
		it("should validate that every rule has non-empty id", () => {
			const rules = getAllRules();
			for (const r of rules) {
				expect(r.id).toBeDefined();
				expect(r.id.trim().length).toBeGreaterThan(0);
			}
		});

		it("should validate that every rule has kind", () => {
			const rules = getAllRules();
			for (const r of rules) {
				expect(r.kind).toBeDefined();
			}
		});

		it("should validate that every rule has appliesTo", () => {
			const rules = getAllRules();
			for (const r of rules) {
				expect(r.appliesTo).toBeDefined();
				expect(r.appliesTo.length).toBeGreaterThan(0);
			}
		});

		it("should validate that every rule has description", () => {
			const rules = getAllRules();
			for (const r of rules) {
				expect(r.description).toBeDefined();
				expect(r.description.trim().length).toBeGreaterThan(0);
			}
		});

		it("should validate that every rule has requiredFacts", () => {
			const rules = getAllRules();
			for (const r of rules) {
				expect(r.requiredFacts).toBeDefined();
				expect(r.requiredFacts.length).toBeGreaterThan(0);
			}
		});

		it("should pass validateAllRules for predefined rules", () => {
			const result = validateAllRules();
			expect(result.valid).toBe(true);
			expect(result.errors.size).toBe(0);
		});

		it("should detect invalid rule", () => {
			const invalidRule = {
				id: "",
				kind: "soft_criterion" as ConstraintKind,
				appliesTo: [],
				description: "",
				requiredFacts: [],
				explanationTemplate: "",
			};

			const result = validateRule(invalidRule);
			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
		});
	});

	describe("rule explanation templates", () => {
		it("should have explanation template for every rule", () => {
			const rules = getAllRules();
			for (const r of rules) {
				expect(r.explanationTemplate).toBeDefined();
				expect(r.explanationTemplate.trim().length).toBeGreaterThan(0);
			}
		});
	});

	describe("project_portal scenario rules", () => {
		it("should have all rules needed for project_portal risk assessment", () => {
			const rules = getRiskAssessmentRules("Project");

			// project_portal 评估需要的关键规则
			const neededRules = [
				"project_team_load",
				"senior_coverage",
				"dependency_risk_propagation",
				"high_priority_pressure",
				"deadline_pressure",
			];

			for (const id of neededRules) {
				expect(rules.find((r) => r.id === id)).toBeDefined();
			}
		});

		it("should have burnout rule for engineer assessment", () => {
			const rule = getRuleById("engineer_burnout_threshold");
			expect(rule).toBeDefined();
			expect(rule?.appliesTo).toContain("Engineer");
			expect(rule?.requiredFacts).toContain("engineer workload");
			expect(rule?.requiredFacts).toContain("engineer seniority");
		});
	});
});
