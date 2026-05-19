import type { PolicyContext } from '../policy/context'
import { checkEntityAccess, checkTypeAccess, redactProperties } from '../policy/filters'
import { projectFields } from './graph-filters'
import type { GraphStore } from './graph-store'
import type { FactStore } from './eventStore'
import { toolErr, toolOk, type ToolResult } from './types'
import type {
  AggregateMetric,
  GraphQuery,
  GraphQueryResult,
  QueryAggregateRow,
  QueryRow,
  TraverseStep,
} from './query-types'

const MAX_LIMIT = 200
const MAX_WORKING_SET = 1000

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

export class GraphQueryEngine {
  constructor(
    private readonly store: GraphStore,
    private readonly policy: PolicyContext,
    private readonly facts?: FactStore,
  ) {}

  async execute(query: GraphQuery): Promise<ToolResult> {
    const workingSets = new Map<string, Set<string>>()
    const startAlias = query.match.alias ?? '_start'

    const matchResult = await this.matchNodes(query.match)
    if (!matchResult.ok) return matchResult
    workingSets.set(startAlias, matchResult.data)

    let currentAlias = startAlias
    for (const step of query.traverse ?? []) {
      const fromAlias = step.from ?? currentAlias
      const fromSet = workingSets.get(fromAlias)
      if (!fromSet) {
        return toolErr(
          'INVALID_ARGS',
          `TRAVERSE: 未找到 alias "${fromAlias}"，已知 alias: [${[...workingSets.keys()].join(', ')}]`,
        )
      }

      const stepResult = await this.traverseStep(fromSet, step)
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

    return this.buildReturn(workingSets, query.return, currentAlias)
  }

  private async matchNodes(match: GraphQuery['match']): Promise<ToolResult<Set<string>>> {
    if (!checkTypeAccess(match.type, this.policy)) {
      return toolErr('POLICY_DENIED', `MATCH: type "${match.type}" 被策略拒绝`)
    }

    const page = await this.store.findNodes({
      type: match.type,
      where: match.where,
      limit: MAX_WORKING_SET,
      offset: 0,
    })

    const result = new Set<string>()
    for (const node of page.items) {
      if (!checkEntityAccess(node.id, this.policy)) continue
      result.add(node.id)
    }

    return toolOk(result)
  }

  private async traverseStep(
    fromSet: Set<string>,
    step: TraverseStep,
  ): Promise<ToolResult<{ survivors: Set<string>; targets: Set<string> }>> {
    if (step.targetType && !checkTypeAccess(step.targetType, this.policy)) {
      return toolErr('POLICY_DENIED', `TRAVERSE: targetType "${step.targetType}" 被策略拒绝`)
    }

    const survivors = new Set<string>()
    const targets = new Set<string>()

    for (const fromId of fromSet) {
      const neighbors = await this.store.getNeighbors(fromId, {
        relation: step.relation,
        direction: step.direction ?? 'out',
        targetType: step.targetType,
        where: step.where,
        limit: MAX_WORKING_SET,
        offset: 0,
      })

      let hasMatch = false
      for (const neighbor of neighbors.items) {
        if (!checkEntityAccess(neighbor.nodeId, this.policy)) continue
        if (!checkTypeAccess(neighbor.type, this.policy)) continue
        hasMatch = true
        targets.add(neighbor.nodeId)
      }

      if (hasMatch) {
        survivors.add(fromId)
      }
    }

    return toolOk({ survivors, targets })
  }

  private async buildReturn(
    workingSets: Map<string, Set<string>>,
    ret: GraphQuery['return'],
    defaultAlias: string,
  ): Promise<ToolResult> {
    const alias = ret?.alias ?? defaultAlias
    const nodeSet = workingSets.get(alias)
    if (!nodeSet) {
      return toolErr(
        'INVALID_ARGS',
        `RETURN: 未找到 alias "${alias}"，已知 alias: [${[...workingSets.keys()].join(', ')}]`,
      )
    }

    const limit = Math.min(ret?.limit ?? 50, MAX_LIMIT)
    const offset = ret?.offset ?? 0

    const allRows: QueryRow[] = []
    let truncated = false

    for (const nodeId of nodeSet) {
      if (allRows.length >= MAX_WORKING_SET) {
        truncated = true
        break
      }
      const node = await this.store.getNode(nodeId)
      if (!node) continue

      const rawProps = await this.getNodeProperties(nodeId, node.properties)
      const props = redactProperties(rawProps, this.policy)
      const projected =
        ret?.fields && ret.fields.length > 0 ? projectFields(props, ret.fields) : props

      allRows.push({ nodeId, type: node.type, properties: projected })
    }

    if (ret?.aggregate) {
      const aggRows = applyAggregate(allRows, ret.aggregate.metrics, ret.aggregate.groupBy)
      const result: GraphQueryResult = { mode: 'aggregate', rows: aggRows }
      return toolOk(result)
    }

    const paged = allRows.slice(offset, offset + limit)
    const result: GraphQueryResult = {
      mode: 'nodes',
      rows: paged,
      total: allRows.length,
      truncated,
    }
    return toolOk(result)
  }

  private async getNodeProperties(
    nodeId: string,
    baseProps: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    let props = { ...baseProps }
    if (this.facts) {
      for (const bf of this.facts.forEntity(nodeId)) {
        props = { ...props, [bf.property]: bf.value }
      }
    }
    return props
  }
}
