import type { Ontology } from '../../ontology/schema'

// ── dbt data pipeline ontology ──

export const dbtOntology: Ontology = {
  version: '1.0.0',
  types: [
    {
      name: 'DataModel',
      description: 'dbt 模型，代表数据管道中的一张表或视图',
      properties: [
        {
          name: 'freshnessSlaHours',
          type: 'number',
          description: '数据 SLA 刷新时间窗口（小时）',
          agentVisible: true,
        },
        {
          name: 'testCoverage',
          type: 'number',
          description: '测试覆盖率 0-1',
          agentVisible: true,
        },
        {
          name: 'hasOwner',
          type: 'boolean',
          description: '是否有数据负责人',
          agentVisible: true,
        },
        {
          name: 'rowCount',
          type: 'number',
          description: '模型行数',
          agentVisible: true,
        },
      ],
      methods: [
        {
          name: 'assessFreshnessRisk',
          description: '评估数据新鲜度风险（需要 hoursSinceLastRefresh 参数）',
        },
      ],
    },
    {
      name: 'DataSource',
      description: '上游数据源（API、数据库、流式）',
      properties: [
        {
          name: 'sourceType',
          type: "'api' | 'database' | 'streaming'",
          description: '数据源类型',
          agentVisible: true,
        },
        {
          name: 'avgUpdateIntervalHours',
          type: 'number',
          description: '平均更新间隔（小时）',
          agentVisible: true,
        },
      ],
      methods: [
        {
          name: 'checkReliability',
          description: '检查数据源当前延迟是否超标（需要 currentDelayHours 参数）',
        },
      ],
    },
    {
      name: 'Dashboard',
      description: 'BI 看板，消费 DataModel 数据',
      properties: [
        {
          name: 'criticalityLevel',
          type: "'low' | 'medium' | 'high' | 'critical'",
          description: '业务关键度',
          agentVisible: true,
        },
        {
          name: 'dependencyCount',
          type: 'number',
          description: '依赖的 DataModel 数量',
          agentVisible: true,
        },
      ],
      methods: [],
    },
    {
      name: 'DataOwner',
      description: '数据负责人/团队',
      properties: [
        {
          name: 'teamName',
          type: 'string',
          description: '负责团队名称',
          agentVisible: true,
        },
        {
          name: 'modelCount',
          type: 'number',
          description: '负责的模型数量',
          agentVisible: true,
        },
      ],
      methods: [],
    },
  ],
  relations: [
    {
      type: 'depends_on',
      from: 'DataModel',
      to: 'DataModel',
      description: '数据血缘：下游模型依赖上游模型',
    },
    {
      type: 'feeds',
      from: 'DataModel',
      to: 'Dashboard',
      description: '模型数据输入看板',
    },
    {
      type: 'owned_by',
      from: 'DataModel',
      to: 'DataOwner',
      description: '模型归属负责人',
    },
    {
      type: 'sourced_by',
      from: 'DataSource',
      to: 'DataModel',
      description: '数据源为模型提供原始数据',
    },
  ],
}
