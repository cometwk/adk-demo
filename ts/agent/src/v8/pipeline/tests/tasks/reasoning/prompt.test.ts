import { describe, it, expect } from 'vitest'
import { buildReasoningPrompt } from '../../../tasks/reasoning/prompt'
import type { PromptParams, PipelineTask } from '../../../core/types'
import type { Ontology } from '../../../../ontology/schema'

const mockOntology: Ontology = {
  version: '1.0.0',
  types: [
    { name: 'Merch', description: 'Merchant entity', properties: [{ name: 'name', type: 'string', description: 'Merchant name' }], methods: [] },
  ],
  relations: [
    { type: 'for_agent', fromType: 'Merch', toType: 'Agent', description: 'Merchant belongs to agent' },
  ],
}

const mockTask: PipelineTask = {
  type: 'reasoning',
  goal: '分析商户经营状况',
}

const mockRules = [
  { id: 'R001', version: '1.0', kind: 'soft_criterion' as const, appliesTo: ['Merch'], description: '风险评分规则', direction: 'risk_up' as const, weight: 0.8 },
]

describe('Reasoning Prompt Builder', () => {
  it('should include ontology summary', () => {
    const prompt = buildReasoningPrompt({
      task: mockTask,
      ontology: mockOntology,
    })
    expect(prompt).toContain('# Ontology Schema')
    expect(prompt).toContain('Merch')
    expect(prompt).toContain('for_agent')
  })

  it('should include task-specific instructions', () => {
    const prompt = buildReasoningPrompt({
      task: mockTask,
      ontology: mockOntology,
    })
    expect(prompt).toContain('# 任务：语义推理')
    expect(prompt).toContain('inspect_node')
    expect(prompt).toContain('bind_fact')
  })

  it('should include rules section when provided', () => {
    const prompt = buildReasoningPrompt({
      task: mockTask,
      ontology: mockOntology,
      rules: mockRules,
    })
    expect(prompt).toContain('# 规则摘要')
    expect(prompt).toContain('R001')
    expect(prompt).toContain('风险评分规则')
  })

  it('should not include rules section when empty', () => {
    const prompt = buildReasoningPrompt({
      task: mockTask,
      ontology: mockOntology,
      rules: [],
    })
    expect(prompt).not.toContain('# 规则摘要')
  })

  it('should inject customContext at end', () => {
    const prompt = buildReasoningPrompt({
      task: mockTask,
      ontology: mockOntology,
      customContext: '额外指令：请关注交易量趋势',
    })
    expect(prompt).toContain('额外指令：请关注交易量趋势')
  })

  it('should compose all sections together', () => {
    const prompt = buildReasoningPrompt({
      task: mockTask,
      ontology: mockOntology,
      rules: mockRules,
      customContext: '额外指令',
    })
    expect(prompt).toContain('# Ontology Schema')
    expect(prompt).toContain('# 规则摘要')
    expect(prompt).toContain('# 任务：语义推理')
    expect(prompt).toContain('额外指令')
  })
})