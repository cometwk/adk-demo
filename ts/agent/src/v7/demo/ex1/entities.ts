import { z } from 'zod'
import { agentMethod, agentProperty } from '../../runtime/decorator'
import { BaseNode } from '../../runtime/graph'

// ── Engineer ──

export class Engineer extends BaseNode {
  @agentProperty({ returns: 'number', description: '每周工作小时数' })
  workload: number

  @agentProperty({
    returns: "'junior' | 'mid' | 'senior'",
    description: '资历等级',
  })
  seniority: 'junior' | 'mid' | 'senior'

  constructor(id: string, workload: number, seniority: 'junior' | 'mid' | 'senior') {
    super(id)
    this.workload = workload
    this.seniority = seniority
  }

  @agentMethod({
    returns: "{ risk: 'HIGH' | 'LOW'; threshold: number }",
    description: '基于资历阈值评估倦怠风险 (senior: 80h, mid: 70h, junior: 55h)',
    requiredFacts: ['workload', 'seniority'],
    relatedRuleIds: ['engineer_burnout_threshold'],
  })
  assessBurnoutRisk(_args: Record<string, never> = {}): {
    risk: 'HIGH' | 'LOW'
    threshold: number
  } {
    const thresholds = { senior: 80, mid: 70, junior: 55 } as const
    const threshold = thresholds[this.seniority]
    return { risk: this.workload > threshold ? 'HIGH' : 'LOW', threshold }
  }
}

// ── Team ──

export class Team extends BaseNode {
  @agentProperty({ returns: 'string', description: '所属部门' })
  department: string

  @agentProperty({ returns: 'number', description: '最大并行项目数' })
  capacity: number

  constructor(id: string, department: string, capacity: number) {
    super(id)
    this.department = department
    this.capacity = capacity
  }

  @agentMethod({
    params: z.object({ memberCount: z.number() }),
    returns: '{ overloaded: boolean; surplus: number }',
    description: '检查团队是否超载',
    requiredFacts: ['memberCount', 'capacity'],
    relatedRuleIds: ['team_capacity_overload'],
    preconditions: [
      {
        param: 'memberCount',
        check: 'must_be_positive',
        description: 'memberCount must come from a real graph query',
      },
    ],
  })
  checkOverload(args: { memberCount: number }): {
    overloaded: boolean
    surplus: number
  } {
    const surplus = this.capacity - args.memberCount
    return { overloaded: surplus < 0, surplus }
  }
}

// ── Project ──

export class Project extends BaseNode {
  @agentProperty({
    returns: "'low' | 'medium' | 'high'",
    description: '业务优先级',
  })
  priority: 'low' | 'medium' | 'high'

  deadlineRisk: number

  constructor(id: string, priority: 'low' | 'medium' | 'high', deadlineRisk: number) {
    super(id)
    this.priority = priority
    this.deadlineRisk = deadlineRisk
  }

  @agentMethod({
    params: z.object({ teamLoad: z.number(), seniorCount: z.number() }),
    returns: "{ risk: 'HIGH' | 'MEDIUM' | 'LOW'; reasons: string[] }",
    description: '基于团队总负载、高级工程师数量和截止日期压力评估交付风险',
    requiredFacts: ['teamLoad', 'seniorCount'],
    relatedRuleIds: ['project_team_load', 'senior_coverage', 'high_priority_pressure'],
    preconditions: [
      {
        param: 'teamLoad',
        check: 'must_be_positive',
        description: 'teamLoad must be aggregated from real engineer workloads',
      },
    ],
  })
  evaluateRisk(args: { teamLoad: number; seniorCount: number }): {
    risk: 'HIGH' | 'MEDIUM' | 'LOW'
    reasons: string[]
  } {
    const reasons: string[] = []
    if (args.teamLoad > 200) reasons.push(`团队超载 (${args.teamLoad}h 总计)`)
    if (args.seniorCount === 0) reasons.push('没有高级工程师')
    if (this.deadlineRisk > 0.75) reasons.push(`截止日期压力严重 (${this.deadlineRisk})`)
    else if (this.deadlineRisk > 0.5) reasons.push(`截止日期压力升高 (${this.deadlineRisk})`)
    const risk: 'HIGH' | 'MEDIUM' | 'LOW' = reasons.length >= 2 ? 'HIGH' : reasons.length === 1 ? 'MEDIUM' : 'LOW'
    return { risk, reasons }
  }
}
