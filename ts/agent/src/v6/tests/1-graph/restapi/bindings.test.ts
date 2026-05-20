import { describe, expect, it } from 'vitest'
import { buildOntology } from '../../../runtime/ontology-builder'
import { validateRelationBindings } from '../../../ontology/validate-bindings'
import { paymentRelationBindings } from './bindings'
import { paymentAccessBindings } from './access-bindings'
import './ontology'

describe('payment bindings validation', () => {
  const ontology = buildOntology({ version: 'payment-test' })

  it('covers all physical RelationSchema types in paymentRelationBindings', () => {
    // 过滤出支付域相关的 relations
    const paymentRelations = ontology.relations.filter((r) =>
      ['Agent', 'Merch', 'Apply', 'AgentRel', 'AgentClosure', 'OrderDaily', 'ProfitDaily'].includes(r.fromType),
    )
    expect(() => validateRelationBindings(paymentRelations, paymentRelationBindings)).not.toThrow()
  })

  it('verifies paymentAccessBindings align with L1 Ontology', () => {
    const paymentRelations = ontology.relations.filter((r) =>
      ['Agent', 'Merch', 'Apply', 'AgentRel', 'AgentClosure', 'OrderDaily', 'ProfitDaily'].includes(r.fromType),
    )

    // 1. 每个声明的 relation (out 方向) 都在 paymentAccessBindings 中有定义
    for (const rel of paymentRelations) {
      const key = `${rel.fromType}:${rel.type}:out`
      const binding = paymentAccessBindings[key]
      expect(binding, `Missing access binding for ${key}`).toBeDefined()
      expect(binding.fromType).toBe(rel.fromType)
      expect(binding.toType).toBe(rel.toType)
      expect(binding.relation).toBe(rel.type)
    }

    // 2. 检查 paymentAccessBindings 中定义的每一个 binding 都在 L1 Ontology 声明中存在
    for (const [key, binding] of Object.entries(paymentAccessBindings)) {
      if (binding.direction === 'out') {
        const match = paymentRelations.find(
          (r) => r.fromType === binding.fromType && r.type === binding.relation && r.toType === binding.toType,
        )
        expect(
          match,
          `Access binding ${key} does not exist in Ontology declarations`,
        ).toBeDefined()
      } else if (binding.direction === 'in') {
        // 对于 in 方向关系，比如 Agent:child_of:in，应存在其反向 out 的 relation 声明 (也就是 Agent:child_of:out)
        const match = paymentRelations.find(
          (r) => r.fromType === binding.toType && r.type === binding.relation && r.toType === binding.fromType,
        )
        expect(
          match,
          `Inward Access binding ${key} does not have a corresponding backward relation in Ontology`,
        ).toBeDefined()
      }
    }
  })
})
