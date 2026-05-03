import { tool } from "ai";
import { z } from "zod";
import {
	type ConstraintKind,
	queryConstraints,
} from "../../ontology/constraints";
import type { Ontology } from "../../ontology/schema";
import { getRelationsFor, getTypeSchema } from "../../ontology/schema";
import { type ToolResult, toolErr, toolOk } from "../../runtime/types";

export function createOntologyTools(ontology: Ontology) {
	const inspect_schema = tool({
		description:
			"查询本体的类型和关系 Schema。可按类型名称过滤，不指定则返回全部。",
		inputSchema: z.object({
			typeName: z
				.string()
				.optional()
				.describe(
					"要检查的特定类型名称（如 'Project'）。不指定则返回全部类型。",
				),
		}),
		execute: async ({ typeName }): Promise<ToolResult> => {
			if (typeName) {
				const ts = getTypeSchema(ontology, typeName);
				if (!ts) {
					return toolErr(
						"NOT_FOUND",
						`类型 '${typeName}' 在本体中未找到`,
						{
							expected: { availableTypes: ontology.types.map((t) => t.name) },
						},
					);
				}
				const relations = getRelationsFor(ontology, typeName);
				return toolOk({ type: ts, relations });
			}

			return toolOk({
				types: ontology.types.map((t) => ({
					name: t.name,
					description: t.description,
					propertyCount: t.properties.length,
					methodCount: t.methods.length,
				})),
				relations: ontology.relations,
			});
		},
	});

	const inspect_rules = tool({
		description:
			"查询决策规则和约束。可按意图（如 'risk_assessment'）、实体类型或约束类型过滤。",
		inputSchema: z.object({
			intent: z
				.string()
				.optional()
				.describe(
					"按决策意图过滤（如 'risk_assessment', 'prioritization'）",
				),
			entityType: z
				.string()
				.optional()
				.describe("按实体类型过滤（如 'Project', 'Engineer'）"),
			kind: z
				.enum([
					"hard_constraint",
					"soft_criterion",
					"inference_rule",
					"conflict_policy",
					"explanation_policy",
				])
				.optional()
				.describe("按约束类型过滤"),
		}),
		execute: async ({ intent, entityType, kind }): Promise<ToolResult> => {
			const results = queryConstraints({
				intent,
				entityType,
				kind: kind as ConstraintKind | undefined,
			});

			if (results.length === 0) {
				return toolOk(
					{ rules: [], count: 0 },
					{ hint: "没有匹配过滤条件的规则" },
				);
			}

			return toolOk({
				rules: results.map((c) => ({
					id: c.id,
					kind: c.kind,
					appliesTo: c.appliesTo,
					description: c.description,
					requiredFacts: c.requiredFacts,
					weight: c.weight,
				})),
				count: results.length,
			});
		},
	});

	return { inspect_schema, inspect_rules };
}