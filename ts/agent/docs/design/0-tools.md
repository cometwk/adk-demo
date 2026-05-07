# src/v6/agent/tools 工具清单

## candidates.ts — 候选与证据工具

- `propose_candidates`: 为决策提出互斥的候选答案（如 HIGH/MEDIUM/LOW），必须在记录证据前调用一次
- `record_evidence`: 记录证据并关联到候选答案，含来源类型、置信度及规则引用
- `list_workspace`: 列出工作区状态：候选列表、证据摘要、未解决的不确定性
- `declare_uncertainty`: 记录缺失事实或模糊信号导致的不确定性，系统会在最终响应中展示

## method.ts — 方法调用工具

- `describe_method`: 获取节点方法的完整模式（参数、返回值、所需事实、相关规则），调用前必先查看
- `call_method`: 调用图节点上的已注册方法，含前置条件检查防止"盲零"错误

## ontology.ts — 本体查询工具

- `inspect_schema`: 查询本体类型和关系 Schema，可按类型过滤或返回全量摘要

## rules.ts — 规则评估工具

- `inspect_rules`: 列出适用于实体类型/意图的规则元数据（权重、所需事实、触发条件等）
- `evaluate_rule`: 针对 Entity 用 FactStore 评估单个规则，返回触发状态、严重度、解释

## counterfactual.ts — 反事实模拟工具

- `simulate`: 生成反事实提议：`what_if`（属性覆盖）或 `but_for`（擦除事件），编排器决定是否执行

## graph.ts — 图导航工具

- `inspect_node`: 检查节点字段（type/properties/outEdges/inEdges/methods），支持时间旅行覆盖
- `query_neighbors`: 查询邻居节点，可按关系/方向/类型过滤并分页
- `search_nodes`: 搜索节点（ID 子串、类型过滤、或锚点邻居），返回匹配节点列表

## events.ts — 诊断/事件工具

- `query_events`: 查询实体在时间窗口内的 EventTimeline，按事件类型过滤
- `walk_causal_graph`: 沿因果图向前/向后遍历，返回因果路径链
- `propose_causes`: 为诊断结果提出候选原因，引用因果路径边和时间线证据
- `record_event`: 将新事件记录到 EventStore（领域知识补充）

## facts.ts — 事实绑定工具

- `bind_fact`: 将实体属性值记录到 FactStore（唯一入口），含置信度和有效期
- `lookup_fact`: 查询已绑定的属性值，调用 `call_method` 前必须先 lookup 避免"盲零"
- `aggregate_facts`: 对多实体属性进行聚合计算（sum/avg/count/min/max）
