// ── Policy Context ──
// Controls entity/type access, property redaction, and audit logging

export type Principal = {
  userId: string
  roles: string[]
  tenantId?: string
}

export type ScopePolicy = {
  allowedTypes?: string[]
  deniedTypes?: string[]
  allowedEntityIds?: string[]
  deniedEntityIds?: string[]
}

export type RedactionMode = 'drop' | 'mask' | 'summarize'

export type RedactionPolicy = {
  sensitiveProperties: string[]
  mode: RedactionMode
  maskValue?: string
}

export type AuditPolicy = {
  logToolCalls: boolean
  logFactReads: boolean
}

export type PolicyContext = {
  principal: Principal
  scope: ScopePolicy
  redaction: RedactionPolicy
  audit: AuditPolicy
}

// ── Default (permissive) policy ──

export const OPEN_POLICY: PolicyContext = {
  principal: { userId: 'demo_user', roles: ['admin'] },
  scope: {},
  redaction: { sensitiveProperties: [], mode: 'drop' },
  audit: { logToolCalls: false, logFactReads: false },
}

// ── Policy helpers ──

export function isEntityAllowed(entityId: string, policy: PolicyContext): boolean {
  const { scope } = policy
  if (scope.deniedEntityIds?.includes(entityId)) return false
  if (scope.allowedEntityIds && !scope.allowedEntityIds.includes(entityId)) return false
  return true
}

export function isTypeAllowed(typeName: string, policy: PolicyContext): boolean {
  const { scope } = policy
  if (scope.deniedTypes?.includes(typeName)) return false
  if (scope.allowedTypes && !scope.allowedTypes.includes(typeName)) return false
  return true
}