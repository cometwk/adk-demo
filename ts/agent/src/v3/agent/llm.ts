import { generateText, jsonSchema, stepCountIs, tool } from "ai";
import { z } from "zod";
import { model } from "../../lib/model";
import type { NextAction } from "../runtime/types";

const next_action = {
	description: "决定下一步的原子操作",
	parameters: {
		type: "object",
		anyOf: [
			{
				description: "移动到另一个节点",
				properties: {
					op: { const: "traverse" },
					from: { type: "string", description: "起始节点 ID" },
					relation: { type: "string", description: "关系名称" },
				},
				required: ["op", "from", "relation"],
				additionalProperties: false,
			},
			{
				description: "读取节点属性和方法",
				properties: {
					op: { const: "read_node" },
					node: { type: "string", description: "节点 ID" },
				},
				required: ["op", "node"],
				additionalProperties: false,
			},
			{
				description: "调用节点方法",
				properties: {
					op: { const: "call" },
					node: { type: "string", description: "节点 ID" },
					method: { type: "string", description: "方法名" },
					args: {
						type: "object",
						description: "显式参数值（可选），优先级高于 from_state",
						additionalProperties: true,
					},
					from_state: {
						type: "object",
						description:
							"声明式黑板绑定：{ 参数名: 黑板key }，Runtime 自动读取当前值。优先使用此字段代替手动复制黑板数值",
						additionalProperties: { type: "string" },
					},
				},
				required: ["op", "node", "method"],
				additionalProperties: false,
			},
			{
				description: "更新状态机状态",
				properties: {
					op: { const: "update_state" },
					key: { type: "string" },
					value: {
						type: ["string", "number", "boolean", "object", "array", "null"],
					},
				},
				required: ["op", "key", "value"],
				additionalProperties: false,
			},
			{
				description: "任务结束",
				properties: {
					op: { const: "stop" },
					reason: { type: "string", description: "停止的原因说明" },
				},
				required: ["op", "reason"],
				additionalProperties: false,
			},
		],
	},
};

const mySchema = jsonSchema<NextAction>(next_action.parameters);

// 1. 使用 tool() 定义你的工具
const nextActionTool = tool({
	description: "提取并保存用户信息",
	// 这里就是告诉 LLM Zod-schema 的地方
	inputSchema: mySchema,
	// 如果你只是想提取数据，execute 可以返回数据本身或简单的确认
	execute: async (action: NextAction) => {
		console.log("正在执行操作...", action);
		return action;
	},
});

export async function callLLM(prompt: string): Promise<NextAction> {
	console.log("\nPROMPT:\n", prompt);

	const r = await generateText({
		model: model,
		tools: {
			next_action: nextActionTool,
		},
		toolChoice: "required",
		prompt: prompt,
		stopWhen: stepCountIs(1),
	});

	const result = r.toolCalls[0].input as NextAction;
	return result;
}

// async function main() {
//   const r = await generateText({
//     model: model,

//     // 2. 将定义好的工具放入 tools 对象
//     tools: {
//       next_action: nextActionTool,
//     },

//     // 3. 关键点：强制模型必须调用这个工具，从而实现“结构化返回”
//     toolChoice: 'required',

//     prompt: '提取以下信息：张三，今年 25 岁，喜欢游泳和看书。',
//   })

//   console.log(r)

//   // 4. 获取结果
//   // 由于设置了 toolChoice: 'required'，第一个 toolCall 就是你要的结构化数据
//   const result = r.toolCalls[0].input

//   console.log('解析后的结构化对象:', result)
//   // 输出: { name: '张三', age: 25, hobbies: ['游泳', '看书'] }
// }
