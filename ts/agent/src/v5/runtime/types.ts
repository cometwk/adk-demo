import type { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────────
// ToolResult 统一契约
// V4 的 tool result 有时是 { error }，有时是 { neighbors }，有时是 { result }
// V5 统一为 discriminated result，便于模型识别、测试断言和未来扩展
// ─────────────────────────────────────────────────────────────────────────────────

export type ToolResult<T> =
	| {
			ok: true;
			data: T;
			meta?: ToolResultMeta;
	  }
	| {
			ok: false;
			error: ToolError;
	  };

export type ToolResultMeta = {
	source?: string;
	page?: PageInfo;
	confidence?: number;
};

export type PageInfo = {
	limit: number;
	offset: number;
	total?: number;
	hasMore: boolean;
};

export type ToolError = {
	code: ToolErrorCode;
	message: string;
	retryable: boolean;
	expected?: unknown;
};

export type ToolErrorCode =
	| "not_found"
	| "invalid_args"
	| "empty_result"
	| "unsupported_field"
	| "internal_failure"
	| "method_not_found"
	| "invalid_metric"
	| "missing_fact"
	| "workspace_missing";

// ─────────────────────────────────────────────────────────────────────────────────
// 工具函数：创建 success/error result
// ─────────────────────────────────────────────────────────────────────────────────

export function success<T>(data: T, meta?: ToolResultMeta): ToolResult<T> {
	return { ok: true, data, meta };
}

export function failure<T>(
	code: ToolErrorCode,
	message: string,
	retryable: boolean = false,
	expected?: unknown,
): ToolResult<T> {
	return {
		ok: false,
		error: { code, message, retryable, expected },
	};
}

export function paginated<T>(
	items: T[],
	limit: number,
	offset: number,
	total?: number,
): ToolResult<T[]> {
	const hasMore =
		total !== undefined ? offset + items.length < total : items.length >= limit;
	return success(items, {
		page: { limit, offset, total, hasMore },
	});
}

// ─────────────────────────────────────────────────────────────────────────────────
// Method Schema 类型
// ─────────────────────────────────────────────────────────────────────────────────

export type MethodSchema = {
	methodName: string;
	params: z.ZodType<any>;
	returns: string;
	description: string;
	requiredFacts?: string[];
	relatedRuleIds?: string[];
};

export type MethodSchemaConfig = {
	params?: z.ZodType<any>;
	returns: string;
	description: string;
	requiredFacts?: string[];
	relatedRuleIds?: string[];
};

// ─────────────────────────────────────────────────────────────────────────────────
// Rule Schema 类型 (V5 新增)
// ─────────────────────────────────────────────────────────────────────────────────

export type RuleSchema = {
	id: string;
	kind: string;
	appliesTo: string[];
	description: string;
	requiredFacts: string[];
	weight?: number;
	priority?: number;
};

export type PropertySchema = {
	propertyName: string;
	returns: string;
	description: string;
};

export type PropertySchemaConfig = {
	returns: string;
	description: string;
};

// ─────────────────────────────────────────────────────────────────────────────────
// Edge 类型
// ─────────────────────────────────────────────────────────────────────────────────

export type NodeId = string;

export type Edge = {
	from: NodeId;
	to: NodeId;
	type: string;
};
