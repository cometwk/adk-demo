// ── Policy Context ──
// 控制实体/类型访问权限、属性脱敏和审计日志

export type Principal = {
  userId: string      // 用户 ID
  roles: string[]     // 用户角色列表
  tenantId?: string   // 租户 ID（多租户场景）
}

export type ScopePolicy = {
  allowedTypes?: string[]      // 允许访问的节点类型列表
  deniedTypes?: string[]       // 禁止访问的节点类型列表
  allowedEntityIds?: string[]  // 允许访问的实体 ID 列表
  deniedEntityIds?: string[]   // 禁止访问的实体 ID 列表
}

export type RedactionMode = 'drop' | 'mask' | 'summarize'  // 脱敏模式：丢弃/遮盖/摘要

export type RedactionPolicy = {
  sensitiveProperties: string[]  // 敏感属性名称列表
  mode: RedactionMode            // 脱敏处理模式
  maskValue?: string             // 遮盖模式下的替换值（如 '***'）
}

export type AuditPolicy = {
  logToolCalls: boolean   // 是否记录工具调用日志
  logFactReads: boolean   // 是否记录事实读取日志
}

export type PolicyContext = {
  principal: Principal      // 当前用户主体信息
  scope: ScopePolicy        // 访问范围策略
  redaction: RedactionPolicy // 属性脱敏策略
  audit: AuditPolicy        // 审计日志策略
}

// ── Default (permissive) policy ──
// 默认宽松策略：不限制任何类型/实体，不脱敏，不记录审计

export const OPEN_POLICY: PolicyContext = {
  principal: { userId: 'demo_user', roles: ['admin'] },
  scope: {},
  redaction: { sensitiveProperties: [], mode: 'drop' },
  audit: { logToolCalls: false, logFactReads: false },
}

// ── Policy helpers ──
// 策略辅助函数

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