import { describe, it, expect } from 'vitest'
import { InMemoryTaskRegistry, createTaskRegistry } from '../core/registry'
import type { TaskPlugin, PromptParams, ToolParams, ExecuteParams, TaskExecuteResult } from '../core/types'

// Mock plugin for testing
const mockPlugin: TaskPlugin = {
  type: 'test',
  buildPrompt: (_params: PromptParams) => 'test prompt',
  buildTools: (_params: ToolParams) => ({ tool1: {} as any }),
  execute: async (_params: ExecuteParams): Promise<TaskExecuteResult> => ({
    facts: [],
    modelVerdict: {},
    rawText: '',
  }),
}

const mockPlugin2: TaskPlugin = {
  type: 'another',
  buildPrompt: (_params: PromptParams) => 'another prompt',
  buildTools: (_params: ToolParams) => ({ tool2: {} as any }),
  execute: async (_params: ExecuteParams): Promise<TaskExecuteResult> => ({
    facts: [],
    modelVerdict: {},
    rawText: '',
  }),
}

describe('TaskRegistry', () => {
  describe('InMemoryTaskRegistry', () => {
    it('should register plugin and get returns it', () => {
      const registry = new InMemoryTaskRegistry()
      registry.register(mockPlugin)
      const plugin = registry.get('test')
      expect(plugin).toBe(mockPlugin)
    })

    it('should list all registered types', () => {
      const registry = new InMemoryTaskRegistry()
      registry.register(mockPlugin)
      registry.register(mockPlugin2)
      const types = registry.list()
      expect(types).toContain('test')
      expect(types).toContain('another')
      expect(types).toHaveLength(2)
    })

    it('should return undefined for unknown type', () => {
      const registry = new InMemoryTaskRegistry()
      const plugin = registry.get('unknown')
      expect(plugin).toBeUndefined()
    })

    it('should replace previous when registering duplicate type', () => {
      const registry = new InMemoryTaskRegistry()
      registry.register(mockPlugin)

      const newPlugin: TaskPlugin = {
        type: 'test',
        buildPrompt: (_params: PromptParams) => 'new prompt',
        buildTools: (_params: ToolParams) => ({ newTool: {} as any }),
        execute: async (_params: ExecuteParams): Promise<TaskExecuteResult> => ({
          facts: [],
          modelVerdict: { new: true },
          rawText: '',
        }),
      }

      registry.register(newPlugin)
      const plugin = registry.get('test')
      expect(plugin).toBe(newPlugin)
      expect(plugin?.buildPrompt({} as PromptParams)).toBe('new prompt')
    })

    it('should accept initial plugins in constructor', () => {
      const registry = new InMemoryTaskRegistry([mockPlugin, mockPlugin2])
      expect(registry.list()).toHaveLength(2)
      expect(registry.get('test')).toBe(mockPlugin)
      expect(registry.get('another')).toBe(mockPlugin2)
    })
  })

  describe('createTaskRegistry factory', () => {
    it('should create empty registry', () => {
      const registry = createTaskRegistry()
      expect(registry.list()).toHaveLength(0)
    })

    it('should create registry with initial plugins', () => {
      const registry = createTaskRegistry([mockPlugin])
      expect(registry.list()).toHaveLength(1)
      expect(registry.get('test')).toBe(mockPlugin)
    })
  })
})