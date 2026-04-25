import { describe, expect, it } from "vitest";
import { failure, paginated, success } from "../runtime/decorator";
import type { ToolErrorCode, ToolResult } from "../runtime/types";

describe("ToolResult 统一契约", () => {
	describe("success result", () => {
		it("should create success result with data", () => {
			const result = success({ name: "test", value: 42 });
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data).toEqual({ name: "test", value: 42 });
			}
		});

		it("should create success result with meta", () => {
			const result = success({ items: [1, 2, 3] }, { source: "test" });
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.meta?.source).toBe("test");
			}
		});
	});

	describe("failure result", () => {
		it("should create failure result with error code", () => {
			const result = failure("not_found", "Node not found", false);
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.code).toBe("not_found");
				expect(result.error.message).toBe("Node not found");
				expect(result.error.retryable).toBe(false);
			}
		});

		it("should create failure result with expected metadata", () => {
			const result = failure("invalid_args", "Missing required field", false, {
				field: "teamLoad",
				type: "number",
			});
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.expected).toEqual({
					field: "teamLoad",
					type: "number",
				});
			}
		});
	});

	describe("paginated result", () => {
		it("should create paginated result with hasMore false when total is known", () => {
			const items = ["a", "b", "c"];
			const result = paginated(items, 10, 0, 3);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.data).toEqual(items);
				expect(result.meta?.page?.hasMore).toBe(false);
				expect(result.meta?.page?.total).toBe(3);
			}
		});

		it("should create paginated result with hasMore true when more items exist", () => {
			const items = ["a", "b", "c"];
			const result = paginated(items, 10, 0, 100);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.meta?.page?.hasMore).toBe(true);
			}
		});

		it("should infer hasMore from limit when total is unknown", () => {
			const items = ["a", "b", "c"];
			// exactly limit items -> may have more
			const resultFull = paginated(items, 3, 0);
			if (resultFull.ok) {
				expect(resultFull.meta?.page?.hasMore).toBe(true);
			}

			// fewer than limit items -> no more
			const resultPartial = paginated(items.slice(0, 2), 3, 0);
			if (resultPartial.ok) {
				expect(resultPartial.meta?.page?.hasMore).toBe(false);
			}
		});
	});

	describe("error codes", () => {
		it("should have stable error codes that tests can assert", () => {
			const errorCodes: ToolErrorCode[] = [
				"not_found",
				"invalid_args",
				"empty_result",
				"unsupported_field",
				"internal_failure",
				"method_not_found",
				"invalid_metric",
				"missing_fact",
				"workspace_missing",
			];

			for (const code of errorCodes) {
				const result = failure(code, "test message", false);
				if (!result.ok) {
					expect(result.error.code).toBe(code);
				}
			}
		});
	});
});
