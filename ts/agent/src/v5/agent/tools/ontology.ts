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
			"Query the ontology type and relation schema. Optionally filter by a specific type name.",
		inputSchema: z.object({
			typeName: z
				.string()
				.optional()
				.describe(
					"A specific type name to inspect (e.g. 'Project'). Omit to get all types.",
				),
		}),
		execute: async ({ typeName }): Promise<ToolResult> => {
			if (typeName) {
				const ts = getTypeSchema(ontology, typeName);
				if (!ts) {
					return toolErr(
						"NOT_FOUND",
						`Type '${typeName}' not found in ontology`,
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
			"Query decision rules and constraints. Filter by intent (e.g. 'risk_assessment'), entity type, or constraint kind.",
		inputSchema: z.object({
			intent: z
				.string()
				.optional()
				.describe(
					"Decision intent to filter by (e.g. 'risk_assessment', 'prioritization')",
				),
			entityType: z
				.string()
				.optional()
				.describe("Entity type to filter by (e.g. 'Project', 'Engineer')"),
			kind: z
				.enum([
					"hard_constraint",
					"soft_criterion",
					"inference_rule",
					"conflict_policy",
					"explanation_policy",
				])
				.optional()
				.describe("Constraint kind to filter by"),
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
					{ hint: "No rules matched the filter criteria" },
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
