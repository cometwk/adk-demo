
### demo/ex2（dbt 数据管道场景）

**领域建模：**

- `DataModel`：属性 `freshnessSlaHours / testCoverage / hasOwner / rowCount`；方法 `assessFreshnessRisk()`
- `DataSource`：属性 `sourceType / avgUpdateIntervalHours`；方法 `checkReliability()`
- `Dashboard`：属性 `criticalityLevel / dependencyCount`
- `DataOwner`：属性 `teamName / modelCount`

关系：
- `DataModel --depends_on--> DataModel`（lineage）
- `DataModel --feeds--> Dashboard`
- `DataModel --owned_by--> DataOwner`
- `DataSource --sourced_by--> DataModel`

**规则（registerDbtRules）：**

| rule id | kind | direction | 描述 |
|---|---|---|---|
| `data_freshness_violation` | hard_constraint | risk_up | 数据超过 SLA 未刷新 → 下游 dashboard 数据错误风险 |
| `low_test_coverage` | soft_criterion | risk_up | 测试覆盖率 < 0.6 → 数据质量风险上升 |
| `unowned_model` | soft_criterion | risk_up | 无 owner 的模型 → 治理风险 |
| `high_downstream_impact` | inference_rule | risk_up | 下游 dashboard 数量 > 3 → 故障影响面扩大 |
| `source_reliability_low` | soft_criterion | risk_up | 上游数据源平均延迟超阈值 |

**因果图（buildDbtCausalGraph）：**
- `late_refresh → stale_data`
- `stale_data → dashboard_incorrect`
- `schema_drift → model_failure`
- `model_failure → downstream_blocked`
- `source_incident → late_refresh`

**事件时间线（EventStore seed）：**
- `@T-5d`：`source_incident`（upstream API latency spike）
- `@T-4d`：`late_refresh`（orders_daily 未按时刷新）
- `@T-3d`：`schema_drift`（revenue_summary 字段变更）
- `@T-1d`：`model_failure`（revenue_summary 跑失败）
- `@T-0`：`dashboard_incorrect`（CFO Dashboard 数据错误）

**`main.ts` 运行两轮：**
1. Predictive：`"评估 orders_daily 模型的数据质量风险"`
2. Diagnostic：`"CFO Dashboard 数据为什么错误"`