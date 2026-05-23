import { tool } from 'ai'
import { z } from 'zod'
import type { NodeInstanceContainer, BaseNode } from './base-node'
import type { FactStore } from '../engine/stores/fact-store'
import { AgentMethodRegistry } from './registry'
import { type ToolResult, toolErr, toolOk } from '../engine/runtime/types'
import type { PolicyContext } from '../policy/context'
import { checkEntityAccess, maybeLogToolCall } from '../policy/filters'

// ── Zod v4 compatible schemaToJsonSchema ──

function schemaToJsonSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  // Zod v4: use global toJSONSchema function
  try {
    return z.toJSONSchema(schema) as Record<string, unknown>
  } catch {
    return {}
  }
}

// ── Preconditions validation ──

function assertPreconditions(
  nodeId: string,
  methodName: string,
  args: Record<string, unknown>,
  facts: FactStore,
): string | null {
  const node_facts = facts.forEntity(nodeId)
  const factsByProperty = new Map(node_facts.map((f) => [f.property, f.value]))

  // 0-default-value safety guard
  for (const [paramName, paramValue] of Object.entries(args)) {
    if (paramValue === 0) {
      const bound = factsByProperty.get(paramName)
      if (bound !== undefined && bound !== 0) {
        return (
          `Precondition failed for ${methodName}(${nodeId}): ` +
          `arg '${paramName}' is 0 but FactStore has bound value ${JSON.stringify(bound)}. ` +
          `Use lookup_fact to get the correct value before calling this method.`
        )
      }
      if (bound === undefined) {
        return (
          `Precondition failed for ${methodName}(${nodeId}): ` +
          `arg '${paramName}' is 0 but no fact binding found for ${nodeId}.${paramName}. ` +
          `Collect the fact with inspect_node / bind_fact first.`
        )
      }
    }
  }

  return null
}

// ── Method Tools Factory ──

export function createMethodTools(
  container: NodeInstanceContainer,
  facts: FactStore,
  policy: PolicyContext,
) {
  const describe_method = tool({
    description:
      'Get method schema: parameters, return type, description, required facts, related rules, and preconditions. ' +
      'Always call this before invoking unfamiliar methods.',
    inputSchema: z.object({
      nodeId: z.string().describe('Node that owns the method'),
      method: z.string().describe('Method name to describe'),
    }),
    execute: async ({ nodeId, method }): Promise<ToolResult> => {
      maybeLogToolCall('describe_method', { nodeId, method }, policy)

      // Policy check
      if (!checkEntityAccess(nodeId, policy)) {
        return toolErr('POLICY_DENIED', `Access to entity '${nodeId}' is denied`)
      }

      // Get BaseNode instance
      const node = await container.getBaseNode(nodeId)
      if (!node) return toolErr('NOT_FOUND', `Node '${nodeId}' not found`)

      // Get class name (use agentTypeName for minification safety)
      const className = (node as unknown as { agentTypeName?: string }).agentTypeName ?? node.constructor.name
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
      'Invoke registered method on a graph node. Pass arguments as key-value pairs. ' +
      'Important: Before calling, get all parameter values from FactStore (lookup_fact) or inspect_node - ' +
      'never pass 0 for numeric parameters you haven\'t retrieved.',
    inputSchema: z.object({
      nodeId: z.string().describe('Node to call method on'),
      method: z.string().describe('Method name'),
      args: z.record(z.string(), z.unknown()).default({}).describe('Arguments as { paramName: value }'),
    }),
    execute: async ({ nodeId, method, args }): Promise<ToolResult> => {
      maybeLogToolCall('call_method', { nodeId, method, args }, policy)

      // Policy check
      if (!checkEntityAccess(nodeId, policy)) {
        return toolErr('POLICY_DENIED', `Access to entity '${nodeId}' is denied`)
      }

      // Get BaseNode instance
      const node = await container.getBaseNode(nodeId)
      if (!node) return toolErr('NOT_FOUND', `Node '${nodeId}' not found`)

      // Get class name (use agentTypeName for minification safety)
      const className = (node as unknown as { agentTypeName?: string }).agentTypeName ?? node.constructor.name
      const schema = AgentMethodRegistry.get(className, method)
      if (!schema) {
        const available = AgentMethodRegistry.getMethodsForClass(className).map((m) => m.methodName)
        return toolErr('METHOD_NOT_FOUND', `Method '${method}' not found on ${className}`, {
          expected: { availableMethods: available },
        })
      }

      // Preconditions validation
      const preconditionError = assertPreconditions(nodeId, method, args, facts)
      if (preconditionError) {
        return toolErr('PRECONDITION_FAILED', preconditionError, { retryable: false })
      }

      // Zod validation
      const parseResult = schema.params.safeParse(args)
      if (!parseResult.success) {
        const issues = parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
        return toolErr('INVALID_ARGS', `Invalid args for ${method}: ${issues.join('; ')}`, {
          expected: {
            params: Object.keys((schemaToJsonSchema(schema.params).properties as Record<string, unknown>) ?? {}),
          },
        })
      }

      // Reflection call
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