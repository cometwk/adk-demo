// ── Policy Context ──
//
// Attached to every DecisionTask.  All graph tools must be decorated with
// withPolicy() from policy/filters.ts before being exposed to the executor.

export type Principal = {
	userId: string;
	roles: string[];
	tenantId?: string;
};

export type ScopePolicy = {
	allowedTypes?: string[];          // if set, only these node types are accessible
	deniedTypes?: string[];
	allowedEntityIds?: string[];      // if set, only these specific node IDs are accessible
	deniedEntityIds?: string[];       // always blocked, even if in allowedEntityIds
};

export type RedactionMode = "drop" | "mask" | "summarize";

export type RedactionPolicy = {
	sensitiveProperties: string[];    // e.g. ["salary", "pii_email", "performance_score"]
	mode: RedactionMode;
	maskValue?: string;               // used when mode = "mask"; defaults to "***"
};

export type AuditPolicy = {
	logToolCalls: boolean;
	logFactReads: boolean;
};

export type PolicyContext = {
	principal: Principal;
	scope: ScopePolicy;
	redaction: RedactionPolicy;
	audit: AuditPolicy;
};

// ── Default (permissive) policy — for demo/testing ──

export const OPEN_POLICY: PolicyContext = {
	principal: { userId: "demo_user", roles: ["admin"] },
	scope: {},
	redaction: { sensitiveProperties: [], mode: "drop" },
	audit: { logToolCalls: false, logFactReads: false },
};

// ── Policy helpers ──

export function isEntityAllowed(entityId: string, policy: PolicyContext): boolean {
	const { scope } = policy;
	if (scope.deniedEntityIds?.includes(entityId)) return false;
	if (scope.allowedEntityIds && !scope.allowedEntityIds.includes(entityId)) return false;
	return true;
}

export function isTypeAllowed(typeName: string, policy: PolicyContext): boolean {
	const { scope } = policy;
	if (scope.deniedTypes?.includes(typeName)) return false;
	if (scope.allowedTypes && !scope.allowedTypes.includes(typeName)) return false;
	return true;
}

export function redactProperties(
	properties: Record<string, unknown>,
	policy: PolicyContext,
): Record<string, unknown> {
	if (policy.redaction.sensitiveProperties.length === 0) return properties;
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(properties)) {
		if (policy.redaction.sensitiveProperties.includes(key)) {
			if (policy.redaction.mode === "drop") continue;
			if (policy.redaction.mode === "mask") {
				result[key] = policy.redaction.maskValue ?? "***";
			} else {
				result[key] = "[redacted]";
			}
		} else {
			result[key] = value;
		}
	}
	return result;
}
