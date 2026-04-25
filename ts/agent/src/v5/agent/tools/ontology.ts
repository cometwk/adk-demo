import { tool } from "ai";
import { z } from "zod";
import type { ConstraintKind } from "../../ontology/constraints";
import {
	filterRules,
	getRiskAssessmentRules,
	getRuleById,
} from "../../ontology/constraints";
import {
	getAllRelationSchemas,
	getAllTypeSchemas,
	getRelationsForType,
	getTypeSchema,
} from "../../ontology/schema";
import { failure, success } from "../../runtime/decorator";
import type { ToolResult } from "../../runtime/types";

// ─────────────────────────────────────────────────────────────────────────────────
// V5 本体工具：inspect_schema 和 inspect_rules
// 让模型可以查询类型 schema、关系 schema 和规则
// ─────────────────────────────────────────────────────────────────────────────────

export function createOntologyTools() {
	const inspect_schema = tool({
		description:
			"Inspect type and relation schemas. Query a specific type or get all schemas. Use this to understand entity types and their structure.",
		inputSchema: z.object({
			typeName: z
				.string()
				.optional()
				.describe(
					"Optional: specific type name to inspect (e.g. 'Project', 'Engineer')",
				),
		}),
		execute: async ({
			typeName,
		}): Promise<
			ToolResult<{
				types?: any[];
				relations?: any[];
			}>
		> => {
			if (typeName) {
				const typeSchema = getTypeSchema(typeName);
				if (!typeSchema) {
					return failure(
						"not_found",
						`Type '${typeName}' not found in ontology`,
						false,
					);
				}

				const relations = getRelationsForType(typeName);
				return success({
					types: [typeSchema],
					relations,
				});
			}

			// 返回所有 schema
			return success({
				types: getAllTypeSchemas(),
				relations: getAllRelationSchemas(),
			});
		},
	});

	const inspect_rules = tool({
		description:
			"Inspect decision criteria and constraints. Filter by intent (risk_assessment), entity type, or rule kind. Use this to understand applicable rules for a decision.",
		inputSchema: z.object({
			intent: z
				.string()
				.optional()
				.describe("Filter by intent (e.g. 'risk_assessment')"),
			entityType: z
				.string()
				.optional()
				.describe("Filter by entity type (e.g. 'Project', 'Engineer')"),
			kind: z
				.enum([
					"hard_constraint",
					"soft_criterion",
					"inference_rule",
					"conflict_policy",
					"explanation_policy",
				])
				.optional()
				.describe("Filter by rule kind"),
			ruleId: z.string().optional().describe("Get a specific rule by ID"),
		}),
		execute: async ({
			intent,
			entityType,
			kind,
			ruleId,
		}): Promise<
			ToolResult<{
				rules: any[];
			}>
		> => {
			if (ruleId) {
				const rule = getRuleById(ruleId);
				if (!rule) {
					return failure("not_found", `Rule '${ruleId}' not found`, false);
				}
				return success({ rules: [rule] });
			}

			const rules = filterRules(
				intent,
				entityType,
				kind as ConstraintKind | undefined,
			);
			if (rules.length === 0) {
				return failure(
					"empty_result",
					"No rules found matching the given filters",
					false,
				);
			}

			return success({ rules });
		},
	});

	return { inspect_schema, inspect_rules };
}

// ─────────────────────────────────────────────────────────────────────────────────
// 导出工具类型
// ─────────────────────────────────────────────────────────────────────────────────

export type OntologyTools = ReturnType<typeof createOntologyTools>;
