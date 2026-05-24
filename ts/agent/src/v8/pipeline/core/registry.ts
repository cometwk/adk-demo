// ── Task Registry ──
// Registry for task plugin management

import type { TaskType, TaskPlugin } from './types'

// ── TaskRegistry Interface ──

export interface TaskRegistry {
  /** Register a task plugin */
  register(plugin: TaskPlugin): void

  /** Get plugin by task type */
  get(type: TaskType): TaskPlugin | undefined

  /** List all registered task types */
  list(): TaskType[]
}

// ── InMemory Task Registry ──

export class InMemoryTaskRegistry implements TaskRegistry {
  private plugins: Map<TaskType, TaskPlugin>

  constructor(initialPlugins?: TaskPlugin[]) {
    this.plugins = new Map()
    if (initialPlugins) {
      for (const plugin of initialPlugins) {
        this.register(plugin)
      }
    }
  }

  register(plugin: TaskPlugin): void {
    // Replace if already registered (no error like InMemoryRuleRegistry)
    this.plugins.set(plugin.type, plugin)
  }

  get(type: TaskType): TaskPlugin | undefined {
    return this.plugins.get(type)
  }

  list(): TaskType[] {
    return Array.from(this.plugins.keys())
  }
}

// ── Factory function ──

export function createTaskRegistry(initialPlugins?: TaskPlugin[]): TaskRegistry {
  return new InMemoryTaskRegistry(initialPlugins)
}