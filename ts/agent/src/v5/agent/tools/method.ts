import { tool } from "ai";
import { z } from "zod";
import type { Graph } from "../../runtime/graph";
import { AgentMethodRegistry } from "../../runtime/registry";
import { type ToolResult, toolErr, toolOk } from "../../runtime/types";

function schemaToJsonSchema(schema: z.ZodType<any>): any {
	if ("toJSONSchema" in schema && typeof schema.toJSONSchema === "function") {
		return schema.toJSONSchema();
	}
	return {};
}

export function createMethodTools(graph: Graph) {
	const describe_method = tool({
		description:
			"Get the full schema of a method before calling it: params, returns, description, required facts, and related rules. Always call this before call_method for unfamiliar methods.",
		inputSchema: z.object({
			nodeId: z.string().describe("The node that owns the method"),
			method: z.string().describe("The method name to describe"),
		}),
		execute: async ({ nodeId, method }): Promise<ToolResult> => {
			const node = graph.getNode(nodeId);
			if (!node) {
				return toolErr("NOT_FOUND", `Node '${nodeId}' not found`);
			}

			const className = node.constructor.name;
			const schema = AgentMethodRegistry.get(className, method);
			if (!schema) {
				const available = AgentMethodRegistry.getMethodsForClass(className).map(
					(m) => m.methodName,
				);
				return toolErr(
					"METHOD_NOT_FOUND",
					`Method '${method}' not found on ${className}`,
					{
						expected: { availableMethods: available },
					},
				);
			}

			const paramsJsonSchema = schemaToJsonSchema(schema.params);

			return toolOk({
				methodName: schema.methodName,
				description: schema.description,
				params: paramsJsonSchema.properties ?? {},
				required: paramsJsonSchema.required ?? [],
				returns: schema.returns,
				requiredFacts: schema.requiredFacts ?? [],
				relatedRuleIds: schema.relatedRuleIds ?? [],
			});
		},
	});

	const call_method = tool({
		description:
			"Call a registered method on a graph node. Pass arguments as named key-value pairs matching the method's param schema. Use describe_method first to learn the schema.",
		inputSchema: z.object({
			nodeId: z.string().describe("The node to call the method on"),
			method: z.string().describe("The method name to call"),
			args: z
				.record(z.string(), z.any())
				.default({})
				.describe("Arguments as { paramName: value }"),
		}),
		execute: async ({ nodeId, method, args }): Promise<ToolResult> => {
			const node = graph.getNode(nodeId);
			if (!node) {
				return toolErr("NOT_FOUND", `Node '${nodeId}' not found`);
			}

			const className = node.constructor.name;
			const schema = AgentMethodRegistry.get(className, method);
			if (!schema) {
				const available = AgentMethodRegistry.getMethodsForClass(className).map(
					(m) => m.methodName,
				);
				return toolErr(
					"METHOD_NOT_FOUND",
					`Method '${method}' not found on ${className}`,
					{
						expected: { availableMethods: available },
					},
				);
			}

			const parseResult = schema.params.safeParse(args);
			if (!parseResult.success) {
				const issues = parseResult.error.issues.map(
					(i: any) => `${i.path.join(".")}: ${i.message}`,
				);
				return toolErr(
					"INVALID_ARGS",
					`Invalid args for ${method}: ${issues.join("; ")}`,
					{
						expected: {
							params: Object.keys(
								schemaToJsonSchema(schema.params).properties ?? {},
							),
						},
					},
				);
			}

			const fn = (node as any)[method];
			if (typeof fn !== "function") {
				return toolErr(
					"INTERNAL_ERROR",
					`${method} is not a callable function`,
				);
			}

			// V5 ABI: pass single parsed object, not positional args
			const result = fn.call(node, parseResult.data);
			return toolOk(result);
		},
	});

	return { describe_method, call_method };
}
