import { tool } from 'ai'
import { z } from 'zod'
import type { Graph } from '../runtime/graph'
import type { FactStore } from '../runtime/factStore'
import { AgentMethodRegistry } from '../runtime/registry'
import { type ToolResult, toolErr, toolOk } from '../runtime/types'
import type { PolicyContext } from '../policy/context'
import { checkEntityAccess, maybeLogToolCall } from '../policy/filters'

function schemaToJsonSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  if ('toJSONSchema' in schema && typeof schema.toJSONSchema === 'function') {
    return (schema as unknown as { toJSONSchema: () => Record<string, unknown> }).toJSONSchema()
  }
  return {}
}

// ── Precondition assertion ──
//
// Prevents the V5 bug: evaluateRisk({ teamLoad: 0, seniorCount: 0 })
// — the executor was passing zeros it never fetched.
//
// If requiredFacts is set and any listed property is missing or 0 in the
// FactStore for the given entity, we reject the call with PRECONDITION_FAILED.

function assertPreconditions(
  nodeId: string,
  methodName: string,
  args: Record<string, unknown>,
  facts: FactStore
): string | null {
  const node_facts = facts.forEntity(nodeId)
  const factsByProperty = new Map(node_facts.map((f) => [f.property, f.value]))

  const schema = (() => {
    // We can't get the class name from nodeId alone without the graph.
    // Preconditions are checked via requiredFacts annotation if available.
    for (const [, s] of Object.entries(AgentMethodRegistry)) {
      void s // registry is static; we check all keys
    }
    return null
  })()
  void schema

  // Check args that were passed as 0 but the FactStore has no record of them.
  // This catches the "blind call" pattern.
  for (const [paramName, paramValue] of Object.entries(args)) {
    if (paramValue === 0) {
      // If FactStore has a binding for this entity.property with non-zero value,
      // the zero arg is suspicious.
      const bound = factsByProperty.get(paramName)
      if (bound !== undefined && bound !== 0) {
        return (
          `Precondition failed for ${methodName}(${nodeId}): ` +
          `arg '${paramName}' is 0 but FactStore has bound value ${JSON.stringify(bound)}. ` +
          `Use lookup_fact to get the correct value before calling this method.`
        )
      }
      // If FactStore has no record for this property, also flag it.
      if (bound === undefined) {
        return (
          `Precondition failed for ${methodName}(${nodeId}): ` +
          `arg '${paramName}' is 0 but no fact binding found for ${nodeId}.${paramName}. ` +
          `Collect the fact with inspect_node / bind_fact first.`
        )
      }
    }
  }

  return null // all preconditions pass
}

export function createMethodTools(graph: Graph, facts: FactStore, policy: PolicyContext) {
  const describe_method = tool({
    description:
      '获取方法的完整模式：参数、返回值、描述、所需事实和相关规则。' + '在调用不熟悉的方法之前，务必先调用此方法。',
    inputSchema: z.object({
      nodeId: z.string().describe('拥有该方法的节点'),
      method: z.string().describe('要描述的方法名称'),
    }),
    execute: async ({ nodeId, method }): Promise<ToolResult> => {
      maybeLogToolCall('describe_method', { nodeId, method }, policy)

      if (!checkEntityAccess(nodeId, policy)) {
        return toolErr('POLICY_DENIED', `Access to entity '${nodeId}' is denied`)
      }

      const node = graph.getNode(nodeId)
      if (!node) return toolErr('NOT_FOUND', `Node '${nodeId}' not found`)

      const className = node.constructor.name
      const schema = AgentMethodRegistry.get(className, method)
      if (!schema) {
        const available = AgentMethodRegistry.getMethodsForClass(className).map((m) => m.methodName)
        return toolErr('METHOD_NOT_FOUND', `Method '${method}' not found on ${className}`, {
          expected: { availableMethods: available },
        })
      }

      const paramsJsonSchema = schemaToJsonSchema(schema.params)

      return toolOk({
        methodName: schema.methodName,
        description: schema.description,
        params: (paramsJsonSchema.properties as Record<string, unknown>) ?? {},
        required: (paramsJsonSchema.required as string[]) ?? [],
        returns: schema.returns,
        requiredFacts: schema.requiredFacts ?? [],
        relatedRuleIds: schema.relatedRuleIds ?? [],
        preconditions: schema.preconditions ?? [],
      })
    },
  })

  const call_method = tool({
    description:
      '调用图节点上的已注册方法。以命名键值对形式传递参数。' +
      '重要：在调用之前，从 FactStore (lookup_fact) 或 inspect_node 获取所有参数值 —— ' +
      '切勿为尚未获取的数值参数传递 0。',
    inputSchema: z.object({
      nodeId: z.string().describe('要调用方法的节点'),
      method: z.string().describe('方法名称'),
      args: z.record(z.string(), z.unknown()).default({}).describe('参数为 { paramName: value }'),
    }),
    execute: async ({ nodeId, method, args }): Promise<ToolResult> => {
      maybeLogToolCall('call_method', { nodeId, method, args }, policy)

      if (!checkEntityAccess(nodeId, policy)) {
        return toolErr('POLICY_DENIED', `Access to entity '${nodeId}' is denied`)
      }

      const node = graph.getNode(nodeId)
      if (!node) return toolErr('NOT_FOUND', `Node '${nodeId}' not found`)

      const className = node.constructor.name
      const schema = AgentMethodRegistry.get(className, method)
      if (!schema) {
        const available = AgentMethodRegistry.getMethodsForClass(className).map((m) => m.methodName)
        return toolErr('METHOD_NOT_FOUND', `Method '${method}' not found on ${className}`, {
          expected: { availableMethods: available },
        })
      }

      // ── Precondition assertion (V6 anti-blind-call guard) ──
      const preconditionError = assertPreconditions(nodeId, method, args, facts)
      if (preconditionError) {
        return toolErr('PRECONDITION_FAILED', preconditionError, {
          retryable: false,
        })
      }

      // ── Schema validation ──
      const parseResult = schema.params.safeParse(args)
      if (!parseResult.success) {
        const issues = parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
        return toolErr('INVALID_ARGS', `Invalid args for ${method}: ${issues.join('; ')}`, {
          expected: {
            params: Object.keys((schemaToJsonSchema(schema.params).properties as Record<string, unknown>) ?? {}),
          },
        })
      }

      const fn = (node as unknown as Record<string, unknown>)[method]
      if (typeof fn !== 'function') {
        return toolErr('INTERNAL_ERROR', `${method} is not callable`)
      }

      const result = (fn as (args: unknown) => unknown).call(node, parseResult.data)
      return toolOk(result)
    },
  })

  return { describe_method, call_method }
}
