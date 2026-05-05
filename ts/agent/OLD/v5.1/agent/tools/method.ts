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
			"获取方法的完整 Schema，包括参数、返回值、描述、所需事实和相关规则。调用 call_method 前建议先调用此工具了解 unfamiliar 方法的结构。",
		inputSchema: z.object({
			nodeId: z.string().describe("拥有该方法的节点"),
			method: z.string().describe("要描述的方法名"),
		}),
		execute: async ({ nodeId, method }): Promise<ToolResult> => {
			const node = graph.getNode(nodeId);
			if (!node) {
				return toolErr("NOT_FOUND", `节点 '${nodeId}' 未找到`);
			}

			const className = node.constructor.name;
			const schema = AgentMethodRegistry.get(className, method);
			if (!schema) {
				const available = AgentMethodRegistry.getMethodsForClass(className).map(
					(m) => m.methodName,
				);
				return toolErr(
					"METHOD_NOT_FOUND",
					`方法 '${method}' 在 ${className} 上未找到`,
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
			"调用图谱节点上的注册方法。参数需以键值对形式传递，匹配方法的参数 Schema。建议先用 describe_method 了解参数结构。",
		inputSchema: z.object({
			nodeId: z.string().describe("要调用方法的节点"),
			method: z.string().describe("要调用的方法名"),
			args: z
				.record(z.string(), z.any())
				.default({})
				.describe("参数，格式为 { 参数名: 值 }"),
		}),
		execute: async ({ nodeId, method, args }): Promise<ToolResult> => {
			const node = graph.getNode(nodeId);
			if (!node) {
				return toolErr("NOT_FOUND", `节点 '${nodeId}' 未找到`);
			}

			const className = node.constructor.name;
			const schema = AgentMethodRegistry.get(className, method);
			if (!schema) {
				const available = AgentMethodRegistry.getMethodsForClass(className).map(
					(m) => m.methodName,
				);
				return toolErr(
					"METHOD_NOT_FOUND",
					`方法 '${method}' 在 ${className} 上未找到`,
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
					`${method} 的参数无效: ${issues.join("; ")}`,
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
					`${method} 不是可调用的函数`,
				);
			}

			// V5 ABI: 传入单个解析后的对象，而非位置参数
			const result = fn.call(node, parseResult.data);
			return toolOk(result);
		},
	});

	return { describe_method, call_method };
}