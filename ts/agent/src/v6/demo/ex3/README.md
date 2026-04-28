### demo/ex3（代理商-商户进件决策场景）

**领域建模：**

- `Agent`：属性 `agentNo / name / disabled / parentId`；代理商，负责商户进件和分润
- `Merch`：属性 `merchNo / name / rate / contactName / contactPhone`；商户，接入支付平台
- `Apply`：属性 `applyNo / agentNo / merchNo / status / statusReason / chanNo / rate`；进件申请
- `AgentRel`：属性 `agentNo / agentType / objNo / objName / rate / isApplier`；代理关系

关系：
- `Agent --applies--> Apply`（代理商发起进件）
- `Apply --for_merch--> Merch`（进件关联商户）
- `Agent --binds--> AgentRel --relates_to--> Merch`（代理绑定）
- `Agent --has_parent--> Agent`（层级关系）

**规则（registerAgentMerchRules）：**

| rule id | kind | direction | 描述 |
|---|---|---|---|
| `agent_disabled` | hard_constraint | risk_up | 代理商已禁用 → 无法进件，直接阻断 |
| `merch_info_incomplete` | soft_criterion | risk_up | 商户信息不完整 → 进件可能被通道拒绝 |
| `apply_status_fail` | soft_criterion | risk_up | 进件申请失败 → 需诊断失败原因 |

**因果图（buildAgentMerchCausalGraph）：**

- `merch_info_missing → channel_reject`（商户信息缺失 → 通道拒绝）
- `channel_reject → apply_fail`（通道拒绝 → 进件失败）
- `agent_disabled → apply_block → apply_fail`（代理商禁用 → 进件阻断 → 失败）
- `rate_check_fail → apply_fail`（费率校验失败 → 进件失败）

**事件时间线（EventStore seed）：**

- `@T-3d`：`agent_disabled`（代理商 A001 因违规被禁用）
- `@T-3d`：`merch_info_missing`（商户 M001 信息不完整）
- `@T-2d`：`channel_reject`（通道拒绝进件申请）
- `@T-1d`：`apply_fail`（进件申请状态变为 FAIL）
- `@T-0`：`apply_failure_discovered`（发现进件失败）

**`main.ts` 运行两轮：**

1. Predictive：`"评估代理商 A002 进件商户的风险"`
2. Diagnostic：`"商户 M001 的进件申请为什么失败"`

**查询统计能力（query.ts）：**

| 函数 | 说明 |
|---|---|
| `queryAgent(agentNo)` | 查询代理商详情（含下级列表） |
| `queryMerch(merchNo)` | 查询商户详情（含绑定代理商） |
| `queryApply(applyNo)` | 查询进件申请状态 |
| `queryAgentChildren(agentNo)` | 查询直接下级代理商 |
| `queryAgentDescendants(agentNo)` | 递归查询所有下级代理商 |
| `queryMerchBoundAgents(merchNo)` | 查询商户绑定的代理商 |
| `executeSql(sql)` | SQL 伪函数（mock，用户后续实现） |
| `queryProfitDaily(agentNo, start, end)` | 查询代理商分润统计（mock） |
| `queryOrderDaily(merchNo, start, end)` | 查询商户订单统计（mock） |

**运行方式：**

```bash
npx tsx src/v6/demo/ex3/main.ts
```

**输出示例：**

- Round 1 (Predictive)：输出风险评估结果（HIGH/MEDIUM/LOW）
- Round 2 (Diagnostic)：输出失败原因追溯（merch_info_missing → channel_reject → apply_fail）
- Query Demo：输出查询统计示例结果