import { tool } from "ai";
import { z } from "zod";
import { failure, success } from "../../runtime/decorator";
import type { Graph } from "../../runtime/graph";
import { AgentMethodRegistry } from "../../runtime/registry";
import type { ToolResult } from "../../runtime/types";

// ─────────────────────────────────────────────────────────────────────────────────
// V5 方法工具：方法内省和安全调用
// describe_method 解决 V4 的盲调问题：模型可以先查询参数 schema
// call_method 使用对象参数 ABI，避免 V4 的 positional call 风格
// ─────────────────────────────────────────────────────────────────────────────────

export function createMethodTools(graph: Graph) {
	const describe_method = tool({
		description:
			"Describe a method before calling it. Returns params schema, return type, description, required facts, and related rule IDs. Use this to understand what arguments are needed.",
		inputSchema: z.object({
			nodeId: z.string().describe("The node containing the method"),
			method: z.string().describe("The method name to describe"),
		}),
		execute: async ({
			nodeId,
			method,
		}): Promise<
			ToolResult<{
				params: Record<
					string,
					{ type: string; required: boolean; description: string }
				>;
				returns: string;
				description: string;
				requiredFacts: string[];
				relatedRuleIds: string[];
			}>
		> => {
			const node = graph.getNode(nodeId);
			if (!node) {
				return failure("not_found", `Node '${nodeId}' not found`, false);
			}

			const className = node.constructor.name;
			const schema = AgentMethodRegistry.get(className, method);
			if (!schema) {
				const available = AgentMethodRegistry.getMethodsForClass(className).map(
					(m) => m.methodName,
				);
				return failure(
					"method_not_found",
					`Method '${method}' not found on ${className}`,
					false,
					{ available },
				);
			}

			// 解析参数 schema
			const params: Record<
				string,
				{ type: string; required: boolean; description: string }
			> = {};
			const paramsSchema = schema.params;
			if (paramsSchema && paramsSchema._def) {
				const shape =
					(paramsSchema as any)._def.shape ?? (paramsSchema as any).shape;
				if (shape) {
					for (const [key, field] of Object.entries(shape)) {
						const fieldDef = (field as any)?._def ?? field;
						params[key] = {
							type: fieldDef?.typeName ?? fieldDef?.type ?? "unknown",
							required: !fieldDef?.optional,
							description: fieldDef?.description ?? "",
						};
					}
				}
			}

			return success({
				params,
				returns: schema.returns,
				description: schema.description,
				requiredFacts: schema.requiredFacts ?? [],
				relatedRuleIds: schema.relatedRuleIds ?? [],
			});
		},
	});

	const call_method = tool({
		description:
			"Call a method on a node. First use describe_method to get the required params. Pass args as an object with named parameters.",
		inputSchema: z.object({
			nodeId: z.string().describe("The node to call the method on"),
			method: z.string().describe("The method name to call"),
			args: z
				.record(z.string(), z.any())
				.describe("Method arguments as { paramName: value }"),
		}),
		execute: async ({
			nodeId,
			method,
			args,
		}): Promise<ToolResult<{ result: any; triggeredRules?: string[] }>> => {
			const node = graph.getNode(nodeId);
			if (!node) {
				return failure("not_found", `Node '${nodeId}' not found`, false);
			}

			const className = node.constructor.name;
			const schema = AgentMethodRegistry.get(className, method);
			if (!schema) {
				const available = AgentMethodRegistry.getMethodsForClass(className).map(
					(m) => m.methodName,
				);
				return failure(
					"method_not_found",
					`Method '${method}' not found on ${className}`,
					false,
					{ available },
				);
			}

			// V5: 验证参数 schema
			const parseResult = schema.params.safeParse(args);
			if (!parseResult.success) {
				const issues = parseResult.error.issues.map(
					(i) => `${i.path.join(".")}: ${i.message}`,
				);
				return failure(
					"invalid_args",
					`Invalid arguments: ${issues.join("; ")}`,
					false,
					{
						expected: schema.params._def ?? schema.params,
					},
				);
			}

			// 获取方法函数
			const fn = (node as any)[method];
			if (typeof fn !== "function") {
				return failure(
					"internal_failure",
					`${method} is not a callable function`,
					false,
				);
			}

			// V5: 使用对象参数调用（与 V4 的 positional call 不同）
			// 对于 z.object({}), 解析结果本身是对象，直接传递
			const parsedArgs = parseResult.data;
			let result: any;

			if (typeof parsedArgs === "object" && parsedArgs !== null) {
				// V5: 如果方法期望多个参数，按对象值顺序传递
				// 如果方法期望单个对象参数，直接传递
				const paramKeys = Object.keys(parsedArgs);
				if (paramKeys.length === 0) {
					// 无参数方法
					result = fn.call(node);
				} else {
					// V5: 约定 agent 方法接收单个对象参数
					// 但如果方法实现使用 positional params，Object.values 传递
					result = fn.apply(node, Object.values(parsedArgs));
				}
			} else {
				result = fn.call(node, parsedArgs);
			}

			// V5: 返回结果时包含触发的规则 ID（如果 schema 中有定义）
			const triggeredRules = schema.relatedRuleIds ?? [];

			return success(
				{ result, triggeredRules },
				{ source: `${className}.${method}` },
			);
		},
	});

	return { describe_method, call_method };
}

// ─────────────────────────────────────────────────────────────────────────────────
// 导出工具类型
// ─────────────────────────────────────────────────────────────────────────────────

export type MethodTools = ReturnType<typeof createMethodTools>;
