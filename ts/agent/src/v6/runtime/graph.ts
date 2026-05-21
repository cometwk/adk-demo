import { AgentMethodRegistry, AgentPropertyRegistry, AgentRelationRegistry, type MethodSchema, type RelationRegistryEntry } from './registry'
import type { NodeId } from './types'

// Use a WeakMap with value type 'any' to avoid circular dependency on InMemoryGraphStore
const nodeGraphStores = new WeakMap<BaseNode, any>()

/** 节点加入 InMemoryGraphStore 后，行为层方法可通过此访问边数据 */
export function getNodeGraphStore(node: BaseNode): any {
  return nodeGraphStores.get(node)
}

/** 注册节点的 GraphStore 绑定关系 */
export function setNodeGraphStore(node: BaseNode, store: any): void {
  nodeGraphStores.set(node, store)
}

// ── BaseNode：本体注册 + 方法执行载体 ──

export abstract class BaseNode {
  private _id: NodeId

  constructor(id: NodeId) {
    this._id = id
  }

  get id(): NodeId {
    return this._id
  }

  set id(id: NodeId) {
    this._id = id
  }

  getCapabilities(): MethodSchema[] {
    const className = this.constructor.name
    return AgentMethodRegistry.getMethodsForClass(className)
  }

  getProperties(): Record<string, unknown> {
    const className = this.constructor.name
    const propSchemas = AgentPropertyRegistry.getPropertiesForClass(className)
    const result: Record<string, unknown> = {}
    for (const schema of propSchemas) {
      result[schema.propertyName] = (this as Record<string, unknown>)[schema.propertyName]
    }
    return result
  }

  getRelationSchemas(): RelationRegistryEntry[] {
    return AgentRelationRegistry.getRelationsForClass(this.constructor.name)
  }

  protected getGraphStore(): any {
    return getNodeGraphStore(this)
  }
}
