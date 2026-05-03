export type NodeId = string;

export type Edge = {
	from: NodeId;
	to: NodeId;
	type: string;
};

// ── 统一工具结果封装 ──

export type ErrorCode =
	| "NOT_FOUND"
	| "INVALID_ARGS"
	| "EMPTY_RESULT"
	| "UNSUPPORTED_FIELD"
	| "INTERNAL_ERROR"
	| "METHOD_NOT_FOUND"
	| "MISSING_FACT"
	| "WORKSPACE_MISSING";

export type ToolResultSuccess<T = unknown> = {
	ok: true;
	data: T;
	meta?: Record<string, unknown>;
};

export type ToolResultError = {
	ok: false;
	code: ErrorCode;
	message: string;
	retryable: boolean;
	expected?: Record<string, unknown>;
};

export type ToolResult<T = unknown> = ToolResultSuccess<T> | ToolResultError;

export function toolOk<T>(
	data: T,
	meta?: Record<string, unknown>,
): ToolResultSuccess<T> {
	return meta ? { ok: true, data, meta } : { ok: true, data };
}

export function toolErr(
	code: ErrorCode,
	message: string,
	opts?: { retryable?: boolean; expected?: Record<string, unknown> },
): ToolResultError {
	return {
		ok: false,
		code,
		message,
		retryable: opts?.retryable ?? false,
		...(opts?.expected ? { expected: opts.expected } : {}),
	};
}

// ── 分页 ──

export type PageInfo = {
	offset: number;
	limit: number;
	hasMore: boolean;
	total?: number;
};

export type Paginated<T> = {
	items: T[];
	page: PageInfo;
};