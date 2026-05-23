import type { PolicyContext } from './context'

// ── Policy enforcement functions ──

/**
 * Check if an entity ID is accessible under the given policy.
 */
export function checkEntityAccess(entityId: string, ctx: PolicyContext): boolean {
  if (ctx.scope.deniedEntityIds?.includes(entityId)) return false
  if (ctx.scope.allowedEntityIds && !ctx.scope.allowedEntityIds.includes(entityId)) return false
  return true
}

/**
 * Check if a node type is accessible under the given policy.
 */
export function checkTypeAccess(typeName: string, ctx: PolicyContext): boolean {
  if (ctx.scope.deniedTypes?.includes(typeName)) return false
  if (ctx.scope.allowedTypes && !ctx.scope.allowedTypes.includes(typeName)) return false
  return true
}

/**
 * Apply redaction to node properties.
 */
export function redactProperties(properties: Record<string, unknown>, ctx: PolicyContext): Record<string, unknown> {
  if (ctx.redaction.sensitiveProperties.length === 0) return properties
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(properties)) {
    if (ctx.redaction.sensitiveProperties.includes(key)) {
      if (ctx.redaction.mode === 'drop') continue
      if (ctx.redaction.mode === 'mask') {
        result[key] = ctx.redaction.maskValue ?? '***'
      } else {
        result[key] = '[redacted]'
      }
    } else {
      result[key] = value
    }
  }
  return result
}

/**
 * Log a tool call if audit policy requires it.
 */
export function maybeLogToolCall(toolName: string, input: unknown, ctx: PolicyContext): void {
  if (ctx.audit.logToolCalls) {
    console.log(`[AUDIT] tool=${toolName} user=${ctx.principal.userId}`, JSON.stringify(input))
  }
}