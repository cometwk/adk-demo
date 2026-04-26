import { describe, expect, it } from "vitest";
import {
	type ErrorCode,
	type PageInfo,
	type Paginated,
	type ToolResult,
	type ToolResultError,
	type ToolResultSuccess,
	toolErr,
	toolOk,
} from "./types";

describe("ToolResult envelope", () => {
	it("toolOk preserves typed data", () => {
		const r = toolOk({ risk: "HIGH", reasons: ["overloaded"] });
		expect(r.ok).toBe(true);
		expect(r.data).toEqual({ risk: "HIGH", reasons: ["overloaded"] });
	});

	it("toolOk includes optional meta", () => {
		const r = toolOk(42, { source: "aggregation" });
		expect(r.ok).toBe(true);
		expect(r.data).toBe(42);
		expect(r.meta).toEqual({ source: "aggregation" });
	});

	it("toolOk omits meta when not provided", () => {
		const r = toolOk("hello");
		expect(r).not.toHaveProperty("meta");
	});

	it("toolErr preserves code, message, retryable, and expected", () => {
		const r = toolErr("NOT_FOUND", "Node 'xyz' not found", {
			retryable: false,
			expected: { availableNodes: ["a", "b"] },
		});
		expect(r.ok).toBe(false);
		expect(r.code).toBe("NOT_FOUND");
		expect(r.message).toBe("Node 'xyz' not found");
		expect(r.retryable).toBe(false);
		expect(r.expected).toEqual({ availableNodes: ["a", "b"] });
	});

	it("toolErr defaults retryable to false", () => {
		const r = toolErr("INTERNAL_ERROR", "unexpected failure");
		expect(r.retryable).toBe(false);
	});

	it("toolErr omits expected when not provided", () => {
		const r = toolErr("INVALID_ARGS", "bad input");
		expect(r).not.toHaveProperty("expected");
	});

	it("error codes are stable string values", () => {
		const codes: ErrorCode[] = [
			"NOT_FOUND",
			"INVALID_ARGS",
			"EMPTY_RESULT",
			"UNSUPPORTED_FIELD",
			"INTERNAL_ERROR",
			"METHOD_NOT_FOUND",
			"MISSING_FACT",
			"WORKSPACE_MISSING",
		];
		for (const code of codes) {
			const r = toolErr(code, "test");
			expect(r.code).toBe(code);
		}
	});

	it("discriminated union narrows correctly", () => {
		const r: ToolResult<number> = toolOk(10);
		if (r.ok) {
			const val: number = r.data;
			expect(val).toBe(10);
		} else {
			throw new Error("should be ok");
		}

		const e: ToolResult<number> = toolErr("NOT_FOUND", "nope");
		if (!e.ok) {
			const code: ErrorCode = e.code;
			expect(code).toBe("NOT_FOUND");
		} else {
			throw new Error("should be error");
		}
	});
});

describe("PageInfo", () => {
	it("can express hasMore: false without a known total", () => {
		const page: PageInfo = { offset: 0, limit: 10, hasMore: false };
		expect(page.hasMore).toBe(false);
		expect(page.total).toBeUndefined();
	});

	it("can include total when known", () => {
		const page: PageInfo = { offset: 0, limit: 10, hasMore: true, total: 42 };
		expect(page.total).toBe(42);
		expect(page.hasMore).toBe(true);
	});
});

describe("Paginated", () => {
	it("wraps items with page info", () => {
		const result: Paginated<string> = {
			items: ["a", "b"],
			page: { offset: 0, limit: 10, hasMore: false, total: 2 },
		};
		expect(result.items).toHaveLength(2);
		expect(result.page.hasMore).toBe(false);
	});
});
