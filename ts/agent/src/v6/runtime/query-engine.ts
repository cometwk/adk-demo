import type { PolicyContext } from '../policy/context'
import { checkEntityAccess, checkTypeAccess, redactProperties } from '../policy/filters'
import type { FactStore } from './eventStore'
import type { Graph } from './graph'
import { toolErr, toolOk, type ToolResult } from './types'
import type {
  AggregateMetric,
  GraphQuery,
  GraphQueryResult,
  PropertyFilter,
  QueryAggregateRow,
  QueryRow,
  TraverseStep,
} from './query-types'

const MAX_LIMIT = 200
const MAX_WORKING_SET = 1000

// ── 属性过滤器 ──

function evalFilter(value: unknown, filter: PropertyFilter): boolean {
  const { op, value: v } = filter
  switch (op) {
    case 'eq':
      return value === v
    case 'ne':
      return value !== v
    case 'gt':
      return (value as number) > (v as number)
    case 'gte':
      return (value as number) >= (v as number)
    case 'lt':
      return (value as number) < (v as number)
    case 'lte':
      return (value as number) <= (v as number)
    case 'contains':
      return String(value).includes(String(v))
    case 'in':
      return Array.isArray(v) && v.includes(value)
  }
}

function matchesFilters(props: Record<string, unknown>, filters: PropertyFilter[]): boolean {
  return filters.every((f) => evalFilter(props[f.property], f))
}

// ── 聚合计算 ──

function applyAggregate(
  rows: QueryRow[],
  metrics: AggregateMetric[],
  groupBy?: string,
): QueryAggregateRow[] {
  if (!groupBy) {
    const out: QueryAggregateRow = {}
    for (const m of metrics) {
      const alias = m.as ?? `${m.fn}_${m.field}`
      const values = rows.map((r) => (m.field === '*' ? 1 : r.properties[m.field]))
      out[alias] = computeMetric(m.fn, values)
    }
    return [out]
  }

  const groups = new Map<unknown, QueryRow[]>()
  for (const row of rows) {
    const key = row.properties[groupBy]
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }

  return Array.from(groups.entries()).map(([key, group]) => {
    const out: QueryAggregateRow = { group: key }
    for (const m of metrics) {
      const alias = m.as ?? `${m.fn}_${m.field}`
      const values = group.map((r) => (m.field === '*' ? 1 : r.properties[m.field]))
      out[alias] = computeMetric(m.fn, values)
    }
    return out
  })
}

function computeMetric(fn: AggregateMetric['fn'], values: unknown[]): number {
  const nums = values.filter((v) => typeof v === 'number') as number[]
  switch (fn) {
    case 'count':
      return values.length
    case 'sum':
      return nums.reduce((a, b) => a + b, 0)
    case 'avg':
      return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
    case 'min':
      return nums.length ? Math.min(...nums) : 0
    case 'max':
      return nums.length ? Math.max(...nums) : 0
  }
}

// ── 查询引擎 ──

export class GraphQueryEngine {
  constructor(
    private readonly graph: Graph,
    private readonly policy: PolicyContext,
    private readonly facts?: FactStore,
  ) {}

  execute(query: GraphQuery): ToolResult {
    // 1. MATCH: 起点选择
    const workingSets = new Map<string, Set<string>>()
    const startAlias = query.match.alias ?? '_start'

    const matchResult = this.matchNodes(query.match)
    if (!matchResult.ok) return matchResult
    workingSets.set(startAlias, matchResult.data)

    // 2. TRAVERSE: 多步遍历
    let currentAlias = startAlias
    for (const step of query.traverse ?? []) {
      const fromAlias = step.from ?? currentAlias
      const fromSet = workingSets.get(fromAlias)
      if (!fromSet) {
        return toolErr('INVALID_ARGS', `TRAVERSE: 未找到 alias "${fromAlias}"，已知 alias: [${[...workingSets.keys()].join(', ')}]`)
      }

      const stepResult = this.traverseStep(fromSet, step)
      if (!stepResult.ok) return stepResult
      const { survivors, targets } = stepResult.data

      if (step.require === 'exists') {
        workingSets.set(fromAlias, survivors)
      } else if (step.require === 'none') {
        const original = workingSets.get(fromAlias)!
        const noMatch = new Set([...original].filter((id) => !survivors.has(id)))
        workingSets.set(fromAlias, noMatch)
      }

      if (step.alias) {
        workingSets.set(step.alias, targets)
      }
      currentAlias = step.alias ?? fromAlias
    }

    // 3. RETURN: 投影 + 聚合 + 分页
    return this.buildReturn(workingSets, query.return, currentAlias)
  }

  // ── MATCH ──

  private matchNodes(match: GraphQuery['match']): ToolResult<Set<string>> {
    if (!checkTypeAccess(match.type, this.policy)) {
      return toolErr('POLICY_DENIED', `MATCH: type "${match.type}" 被策略拒绝`)
    }

    const result = new Set<string>()
    for (const [nodeId, node] of this.graph.nodes) {
      if (node.constructor.name !== match.type) continue
      if (!checkEntityAccess(nodeId, this.policy)) continue

      if (match.where && match.where.length > 0) {
        const props = this.getNodeProperties(nodeId)
        if (!matchesFilters(props, match.where)) continue
      }

      result.add(nodeId)
    }

    return toolOk(result)
  }

  // ── TRAVERSE ──

  private traverseStep(
    fromSet: Set<string>,
    step: TraverseStep,
  ): ToolResult<{ survivors: Set<string>; targets: Set<string> }> {
    if (step.targetType && !checkTypeAccess(step.targetType, this.policy)) {
      return toolErr('POLICY_DENIED', `TRAVERSE: targetType "${step.targetType}" 被策略拒绝`)
    }

    // survivors: fromSet 中"至少有一个满足条件的目标"的节点
    const survivors = new Set<string>()
    // targets: 所有满足条件的目标节点
    const targets = new Set<string>()

    for (const fromId of fromSet) {
      const neighbors = this.graph.queryNeighbors(fromId, {
        relation: step.relation,
        direction: step.direction ?? 'out',
        typeFilter: step.targetType,
        limit: MAX_WORKING_SET,
        offset: 0,
      })

      let hasMatch = false
      for (const neighbor of neighbors.items) {
        if (!checkEntityAccess(neighbor.nodeId, this.policy)) continue
        if (!checkTypeAccess(neighbor.type, this.policy)) continue

        if (step.where && step.where.length > 0) {
          const props = this.getNodeProperties(neighbor.nodeId)
          if (!matchesFilters(props, step.where)) continue
        }

        hasMatch = true
        targets.add(neighbor.nodeId)
      }

      if (hasMatch) {
        survivors.add(fromId)
      }
    }

    return toolOk({ survivors, targets })
  }

  // ── RETURN ──

  private buildReturn(
    workingSets: Map<string, Set<string>>,
    ret: GraphQuery['return'],
    defaultAlias: string,
  ): ToolResult {
    const alias = ret?.alias ?? defaultAlias
    const nodeSet = workingSets.get(alias)
    if (!nodeSet) {
      return toolErr('INVALID_ARGS', `RETURN: 未找到 alias "${alias}"，已知 alias: [${[...workingSets.keys()].join(', ')}]`)
    }

    const limit = Math.min(ret?.limit ?? 50, MAX_LIMIT)
    const offset = ret?.offset ?? 0

    // 构造所有行
    const allRows: QueryRow[] = []
    let truncated = false

    for (const nodeId of nodeSet) {
      if (allRows.length >= MAX_WORKING_SET) {
        truncated = true
        break
      }
      const node = this.graph.getNode(nodeId)
      if (!node) continue

      const rawProps = this.getNodeProperties(nodeId)
      const props = redactProperties(rawProps, this.policy)
      const projected = ret?.fields && ret.fields.length > 0
        ? Object.fromEntries(ret.fields.map((f) => [f, props[f]]))
        : props

      allRows.push({ nodeId, type: node.constructor.name, properties: projected })
    }

    // 聚合模式
    if (ret?.aggregate) {
      const aggRows = applyAggregate(allRows, ret.aggregate.metrics, ret.aggregate.groupBy)
      const result: GraphQueryResult = { mode: 'aggregate', rows: aggRows }
      return toolOk(result)
    }

    // 普通节点列表 + 分页
    const paged = allRows.slice(offset, offset + limit)
    const result: GraphQueryResult = {
      mode: 'nodes',
      rows: paged,
      total: allRows.length,
      truncated,
    }
    return toolOk(result)
  }

  // ── 工具方法 ──

  private getNodeProperties(nodeId: string): Record<string, unknown> {
    const node = this.graph.getNode(nodeId)
    if (!node) return {}
    let props = node.getProperties()
    if (this.facts) {
      for (const bf of this.facts.forEntity(nodeId)) {
        props = { ...props, [bf.property]: bf.value }
      }
    }
    return props
  }
}
