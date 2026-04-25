import { z } from "zod";
import {
	AgentMethodRegistry,
	AgentPropertyRegistry,
	RuleRegistry,
} from "./registry";
import type {
	MethodSchema,
	MethodSchemaConfig,
	PropertySchema,
	PropertySchemaConfig,
	RuleSchema,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────────
// @agentMethod: 注册 agent 可调用的方法
// V5 扩展：支持 requiredFacts 和 relatedRuleIds
// ─────────────────────────────────────────────────────────────────────────────────

export function agentMethod(config: MethodSchemaConfig) {
	return (
		target: any,
		propertyKey: string,
		descriptor: PropertyDescriptor,
	): PropertyDescriptor => {
		const className = target.constructor.name;

		const schema: MethodSchema = {
			methodName: propertyKey,
			params: config.params ?? z.object({}),
			returns: config.returns,
			description: config.description,
			requiredFacts: config.requiredFacts,
			relatedRuleIds: config.relatedRuleIds,
		};

		AgentMethodRegistry.register(className, propertyKey, schema);

		return descriptor;
	};
}

// ─────────────────────────────────────────────────────────────────────────────────
// @agentProperty: 注册 agent 可读取的属性
// ─────────────────────────────────────────────────────────────────────────────────

export function agentProperty(config: PropertySchemaConfig) {
	return (target: any, propertyKey: string): void => {
		const className = target.constructor.name;

		const schema: PropertySchema = {
			propertyName: propertyKey,
			returns: config.returns,
			description: config.description,
		};

		AgentPropertyRegistry.register(className, propertyKey, schema);
	};
}

// ─────────────────────────────────────────────────────────────────────────────────
// @agentRule: 注册可查询的规则/准则 (V5 新增)
// ─────────────────────────────────────────────────────────────────────────────────

export function agentRule(schema: RuleSchema): void {
	RuleRegistry.register(schema);
}

// ─────────────────────────────────────────────────────────────────────────────────
// 导出
// ─────────────────────────────────────────────────────────────────────────────────

export {
	AgentMethodRegistry,
	AgentPropertyRegistry,
	RuleRegistry,
} from "./registry";
export type {
	MethodSchema,
	MethodSchemaConfig,
	PageInfo,
	PropertySchema,
	PropertySchemaConfig,
	RuleSchema,
	ToolError,
	ToolErrorCode,
	ToolResult,
	ToolResultMeta,
} from "./types";
export { failure, paginated, success } from "./types";
