import { z } from 'zod'
import { Graph, BaseNode } from '../runtime/graph'
import { agentMethod, AgentMethodRegistry, MethodSchema } from '../runtime/decorator'

export class Person extends BaseNode {
  workload: number

  constructor(id: string, workload: number) {
    super(id)
    this.workload = workload
  }

  @agentMethod({
    returns: 'number',
    description: 'Returns the workload value for this person',
  })
  getWorkload() {
    return this.workload
  }

  getCapabilities(): MethodSchema[] {
    return AgentMethodRegistry.getMethodsForClass('Person')
  }
}

export class Project extends BaseNode {
  deadlineRisk: number

  constructor(id: string, deadlineRisk: number) {
    super(id)
    this.deadlineRisk = deadlineRisk
  }

  @agentMethod({
    params: z.object({ teamLoad: z.number() }),
    returns: "{ risk: 'HIGH' | 'LOW' }",
    description: 'Checks risk status based on team load and deadline risk',
  })
  checkRiskStatus(teamLoad: number) {
    if (teamLoad > 100 || this.deadlineRisk > 0.7) {
      return { risk: 'HIGH' }
    }
    return { risk: 'LOW' }
  }

  getCapabilities(): MethodSchema[] {
    return AgentMethodRegistry.getMethodsForClass('Project')
  }
}

export function seedGraph(): Graph {
  const g = new Graph()

  const p1 = new Person('person_1', 60)
  const p2 = new Person('person_2', 70)

  const project = new Project('project_1', 0.8)

  g.addNode(p1)
  g.addNode(p2)
  g.addNode(project)

  g.addEdge({ from: 'person_1', to: 'project_1', type: 'involved_in' })
  g.addEdge({ from: 'person_2', to: 'project_1', type: 'involved_in' })

  return g
}
