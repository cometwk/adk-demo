---
title: "feat: 完善 cube.js 数据模型"
type: feat
status: active
date: 2026-06-13
origin: docs/design.md, docs/bi-requirement.md
---

# feat: 完善 cube.js 数据模型

## Overview

根据业务设计文档（`docs/design.md`）和 BI 需求文档（`docs/bi-requirement.md`），完善当前 cube.js 模型中的跨表 join 定义、新增维度/度量、新增视图，使模型能够支撑 BI 分析需求。

当前模型现状：7 个 cube 各自独立，几乎无跨表 join，无法支撑跨域分析查询。

## Problem Frame

支付代理分润平台需要支撑交易分析、分润分析、代理商分析、进件分析、费率分析等 30+ 个 BI 需求点。但当前 cube.js 模型存在以下问题：

1. **跨表 join 缺失**：`agent_closure`、`apply`、`profit_daily`、`order_daily`、`agent` 均无 join 定义，跨域查询无法执行
2. **维度/度量不足**：缺少计算型度量（净分润率、退款率等）和业务语义维度（层级名称、状态名称等）
3. **视图缺失**：只有 1 个 `inactive_merch_view`，无法支撑常用分析场景
4. **通道维度数据缺失**：DDL 中无 `chan` 表，通道属性需从 `order_daily` 冗余字段间接获取

## Requirements Trace

来自 `docs/bi-requirement.md` 的需求映射：

| 需求域 | 关键需求点 | 涉及的 cube join 路径 |
|--------|-----------|---------------------|
| 1. 交易分析 | 趋势、排名、通道、活跃度 | order_daily, merch, agent_rel→agent |
| 2. 分润分析 | 总览、排名、结构、退款 | profit_daily→agent, agent_rel |
| 3. 代理商分析 | 层级、业绩、活跃度 | agent_closure→agent, agent_rel→order_daily |
| 4. 进件分析 | 转化率、趋势、通知 | apply→agent, apply→merch |
| 5. 费率分析 | 结构、利润空间 | merch, agent_rel, order_daily |
| 6. 交叉分析 | 三维、时间、风险 | 全域 join |
| 7. 运营看板 | 管理层/代理商/运营 | 视图聚合 |

## Scope Boundaries

- **不含**：新增数据库表或 DDL 变更（通道表缺失是上游问题，cube.js 层用 order_daily 的冗余字段替代）
- **不含**：前端 Dashboard 开发
- **不含**：pre-aggregation 性能优化（留作后续迭代）
- **含**：在现有 7 个 cube 上补充 join、维度、度量
- **含**：新增视图文件支撑常用分析场景
- **含**：新增 `chan` 维度 cube（从 order_daily 提取通道维度）

## Context & Research

### Relevant Code and Patterns

- 现有 cube 模型：`model/cubes/*.yaml` — 标准 cube.js YAML 格式
- 现有视图：`model/views/inactive_merch_view.yml` — join_path + includes 模式
- join 定义模式（参考 `agent_rel.yaml`）：
  ```yaml
  joins:
    - name: agent
      sql: "{CUBE}.agent_no = {agent.agent_no}"
      relationship: many_to_one
    - name: merch
      sql: "{CUBE}.obj_no = {merch.merch_no} AND {CUBE}.agent_type = 'MERCH'"
      relationship: many_to_one
  ```
- sub_query 模式（参考 `merch.yaml` 的 `order_daily_count_in_period`）：
  ```yaml
  dimensions:
    - name: order_daily_count_in_period
      sql: "{order_daily.count}"
      type: number
      sub_query: true
      propagate_filters_to_sub_query: true
  ```

### Data Source

- MySQL 8.x，schema: `tmpdb`
- cube.js Docker 镜像: `cubejs/cube:latest`
- CUBEJS_EXTERNAL_DEFAULT=true, CUBEJS_SCHEDULED_REFRESH_DEFAULT=true

### External References

- Cube.js 官方文档: join 定义、view 定义、sub_query
- 多对多关系需通过关联表（如 agent_rel）链式 join

## Key Technical Decisions

1. **通道维度使用 `chan` 表**：DDL 中已有 `chan` 主表，直接基于 `sql_table: tmpdb.chan` 创建 chan cube，提供通道编号、类型、费率、名称等维度属性。(see origin: ddl/chan.sql)
2. **agent_closure join 通过 agent.id 桥接**：`agent_closure` 使用 BIGINT id（agent.id），而其他表用 `agent_no`（VARCHAR）。join 路径必须是 `agent_closure→agent(id)→profit_daily(agent_no)` 两步桥接。
3. **profit_daily 单向 join 到 agent**：`profit_daily` 以 `agent_no` 为维度关联 `agent`，不反向 join，避免 one_to_many 导致度量膨胀。
4. **apply join 到 agent 和 merch**：通过 `agent_no` 关联 agent，通过 `merch_no` 关联 merch（成功记录才有 merch_no）。
5. **不引入 pre-aggregation**：当前阶段聚焦模型完整性，性能优化留作后续迭代。

## Open Questions

### Resolved During Planning

- **通道维度如何处理？** → 创建基于 SQL 的 `chan` cube（从 order_daily 提取去重通道），不依赖上游建表
- **agent_closure 的 id vs agent_no 不一致如何处理？** → 通过 agent 表桥接：agent_closure join agent（id↔id），agent join profit_daily/agent_rel（agent_no↔agent_no）
- **代理类型互斥（CHAN/MERCH 二选一）如何影响 join？** → agent_rel 的 merch join 带 `agent_type='MERCH'` 条件，CHAN 类型走 chan 路径

### Deferred to Implementation

- **pre-aggregation 策略**：依赖实际查询性能测试结果
- **order_daily 外部导入的数据完整性**：不在 cube.js 层处理

## Implementation Units

- [ ] **Unit 1: 补全 agent cube 的 join 定义**

**Goal:** 让 agent 表可以关联 agent_closure（层级）、agent_rel（代理关系）、apply（进件）、profit_daily（分润）

**Requirements:** 代理商分析(3.1, 3.2, 3.3)、分润分析(2.2)、进件分析(4.2)

**Dependencies:** None

**Files:**
- Modify: `model/cubes/agent.yaml`

**Approach:**
- agent 添加 join 到 agent_closure：`{CUBE}.id = {agent_closure.descendant_id}`，relationship: one_to_many
- agent 添加 join 到 agent_rel：`{CUBE}.agent_no = {agent_rel.agent_no}`，relationship: one_to_many
- agent 添加 join 到 apply：`{CUBE}.agent_no = {apply.agent_no}`，relationship: one_to_many
- agent 添加 join 到 profit_daily：`{CUBE}.agent_no = {profit_daily.agent_no}`，relationship: one_to_many
- 注意：agent 作为维度表是 "一" 方，多个事实表是 "多" 方，所以 agent→这些表都是 one_to_many

**Patterns to follow:**
- 参考 `agent_rel.yaml` 的 join 格式
- 使用 `{CUBE}` 和 `{cube_name.field}` 引用语法

**Verification:**
- agent cube 可以通过 join 查询到 agent_closure、agent_rel、apply、profit_daily 的字段
- 无度量膨胀（agent 作为维度侧使用时度量正确）

---

- [ ] **Unit 2: 补全 agent_closure cube 的 join 定义**

**Goal:** 让 agent_closure 可以通过 agent 表桥接到其他业务表

**Requirements:** 代理商层级分析(3.1)、层级分润贡献(3.1)

**Dependencies:** Unit 1

**Files:**
- Modify: `model/cubes/agent_closure.yaml`

**Approach:**
- agent_closure 添加 join 到 agent（通过 descendant_id）：`{CUBE}.descendant_id = {agent.id}`，relationship: many_to_one
- 这样 agent_closure→agent→profit_daily/agent_rel 路径可达
- 添加 `hierarchy_level` 计算维度：从根节点到当前节点的绝对层级深度，使用 SQL 子查询或关联 agent.parent_id 逻辑

**Technical design:**
> 方向性指导：hierarchy_level 维度可以通过 SQL 实现：查找每个 descendant_id 在 agent_closure 中 ancestor_id 为根节点（agent.parent_id=0）时的 depth 值。实现时可能需要使用 agent 表的 parent_id 字段辅助判断根节点。

**Patterns to follow:**
- agent.yaml 的 join 格式

**Verification:**
- 通过 agent_closure 可以查到 agent 的名称、编号
- hierarchy_level 维度返回正确的层级深度值

---

- [ ] **Unit 3: 补全 apply cube 的 join 定义**

**Goal:** 让 apply 表可以关联 agent（进件人）和 merch（进件结果）

**Requirements:** 进件分析(4.1, 4.2, 4.3)

**Dependencies:** None

**Files:**
- Modify: `model/cubes/apply.yaml`

**Approach:**
- apply 添加 join 到 agent：`{CUBE}.agent_no = {agent.agent_no}`，relationship: many_to_one
- apply 添加 join 到 merch：`{CUBE}.merch_no = {merch.merch_no}`，relationship: many_to_one
- 添加维度 `status_name`：将数值状态码映射为中文/英文名称（0:初始化, 1:审核中, 2:成功, 3:失败）
- 添加维度 `notify_status_name`：将通知状态映射为名称（1:待通知, 2:成功, 3:失败）
- 添加度量 `success_count`：`count` 加过滤 `status = 2`
- 添加度量 `fail_count`：`count` 加过滤 `status = 3`
- 添加度量 `success_rate`：`success_count / count`

**Patterns to follow:**
- order_daily.yaml 的 `over_1000_count` 和 `over_1000_percentage` 过滤度量模式

**Verification:**
- apply 可以关联查询 agent 的名称和 merch 的信息
- success_rate 度量计算正确
- status_name 维度返回可读标签

---

- [ ] **Unit 4: 补全 profit_daily cube 的 join 定义和度量**

**Goal:** 让 profit_daily 可以关联 agent 维度，并添加计算型度量

**Requirements:** 分润分析(2.1, 2.2, 2.3, 2.4)

**Dependencies:** None

**Files:**
- Modify: `model/cubes/profit_daily.yaml`

**Approach:**
- profit_daily 添加 join 到 agent：`{CUBE}.agent_no = {agent.agent_no}`，relationship: many_to_one
- 添加度量 `net_profit_rate`：`net_profit / total_trade_amt`，type: number，format: percent
- 添加度量 `refund_impact_rate`：`total_refund_deduct / total_profit`，type: number，format: percent
- 添加度量 `own_profit_ratio`：`own_net_profit / net_profit`，type: number，format: percent
- 添加度量 `refund_rate`：`refund_cnt / order_cnt`，type: number，format: percent
- 添加度量 `refund_amount_ratio`：`total_refund_amt / total_trade_amt`，type: number，format: percent
- 添加维度 `status_name`：将结算状态映射为名称（0:未结算, 1:审批中, 2:已结算）
- 添加维度 `settle_date`：基于 stat_date 的时间维度（如需与 order_daily 对齐）

**Patterns to follow:**
- order_daily.yaml 的 `over_1000_percentage` 计算度量模式
- agent_rel.yaml 的 join 格式

**Verification:**
- profit_daily 可以关联查询 agent 名称、层级等维度
- 各计算型度量公式正确，无除零错误
- status_name 维度返回可读标签

---

- [ ] **Unit 5: 补全 order_daily cube 的 join 定义**

**Goal:** 让 order_daily 可以关联 merch 维度

**Requirements:** 交易分析(1.2, 1.3, 1.4)、费率分析(5.1)

**Dependencies:** None

**Files:**
- Modify: `model/cubes/order_daily.yaml`

**Approach:**
- order_daily 添加 join 到 merch：`{CUBE}.merch_no = {merch.merch_no}`，relationship: many_to_one
- 注意：order_daily 已通过 merch→agent_rel→agent 路径间接关联代理商维度

**Patterns to follow:**
- merch.yaml 的 join 格式

**Verification:**
- order_daily 可以通过 join 查询 merch 的名称、费率等维度

---

- [ ] **Unit 6: 新增 chan cube（通道维度）**

**Goal:** 提供通道维度的属性，支撑通道分析需求

**Requirements:** 交易分析(1.3)、交叉分析(6.1)、费率分析(5.2)

**Dependencies:** None

**Files:**
- Create: `model/cubes/chan.yaml`

**Approach:**
- 基于 SQL 去重创建 chan cube：
  ```yaml
  cubes:
    - name: chan
      sql: >
        SELECT DISTINCT chan_no, chan_id, chan_merch_no
        FROM tmpdb.order_daily
      data_source: default
  ```
- 维度：chan_no（通道编号，primary_key）、chan_id（通道ID）、chan_merch_no（机构商户号）
- 度量：count
- 添加 join 到 order_daily：`{CUBE}.chan_no = {order_daily.chan_no}`，relationship: one_to_many

**Technical design:**
> 方向性指导：chan cube 是一个从 order_daily 提取的维度 cube。SQL 去重确保每个通道编号只有一条记录。未来如果有通道主表可以直接替换 sql 为 sql_table。

**Verification:**
- chan cube 可以独立查询通道列表
- 通过 join 可以查询每个通道的交易额、订单数

---

- [ ] **Unit 7: 新增交易总览视图**

**Goal:** 支撑交易分析常用查询场景

**Requirements:** 交易分析(1.1, 1.2, 1.3, 1.4)、运营看板(7.1)

**Dependencies:** Unit 1, Unit 5, Unit 6

**Files:**
- Create: `model/views/transaction_overview.yml`

**Approach:**
- 创建交易总览视图，组合 order_daily + merch + agent（通过 agent_rel）+ chan
  ```yaml
  views:
    - name: transaction_overview
      cubes:
        - join_path: order_daily
          includes:
            - report_date
            - total_count
            - total_amount
        - join_path: order_daily.merch
          includes:
            - name  # 商户名称
            - merch_no
            - rate
            - apply_date
        - join_path: order_daily.chan
          prefix: true
          includes:
            - chan_no
        - join_path: order_daily.merch.agent_rel
          prefix: true
          includes:
            - agent_no
            - obj_name  # 代理商名称
            - rate
            - apply
  ```
- 注意：merch→agent_rel 的 join 路径需要 merch 先 join agent_rel（已有的 merch→order_daily 需要确认方向）

**Patterns to follow:**
- `model/views/inactive_merch_view.yml` 的视图格式

**Verification:**
- 视图可以按日期、商户、通道、代理商维度查询交易数据

---

- [ ] **Unit 8: 新增分润总览视图**

**Goal:** 支撑分润分析常用查询场景

**Requirements:** 分润分析(2.1, 2.2, 2.3, 2.4)、运营看板(7.1, 7.2)

**Dependencies:** Unit 1, Unit 4

**Files:**
- Create: `model/views/profit_overview.yml`

**Approach:**
- 创建分润总览视图，组合 profit_daily + agent
  ```yaml
  views:
    - name: profit_overview
      cubes:
        - join_path: profit_daily
          includes:
            - stat_date
            - agent_type
            - net_profit_rate
            - refund_impact_rate
            - own_profit_ratio
            - total_trade_amt
            - total_profit
            - net_profit
            - own_net_profit
            - status_name
        - join_path: profit_daily.agent
          prefix: true
          includes:
            - name  # 代理商名称
            - agent_no
  ```

**Verification:**
- 视图可以按日期、代理商维度查询分润数据
- 计算型度量正确显示

---

- [ ] **Unit 9: 新增进件分析视图**

**Goal:** 支撑进件分析常用查询场景

**Requirements:** 进件分析(4.1, 4.2, 4.3)、运营看板(7.3)

**Dependencies:** Unit 1, Unit 3

**Files:**
- Create: `model/views/apply_overview.yml`

**Approach:**
- 创建进件分析视图，组合 apply + agent + merch
  ```yaml
  views:
    - name: apply_overview
      cubes:
        - join_path: apply
          includes:
            - created_at
            - status_name
            - success_rate
            - success_count
            - fail_count
            - count
        - join_path: apply.agent
          prefix: true
          includes:
            - name  # 代理商名称
            - agent_no
        - join_path: apply.merch
          prefix: true
          includes:
            - name  # 商户名称
            - merch_no
            - rate
  ```

**Verification:**
- 视图可以按日期、代理商维度查询进件数据
- 转化率度量正确

---

- [ ] **Unit 10: 新增代理商层级视图**

**Goal:** 支撑代理商层级分析场景

**Requirements:** 代理商层级分析(3.1, 3.2, 3.3)

**Dependencies:** Unit 1, Unit 2, Unit 4

**Files:**
- Create: `model/views/agent_hierarchy.yml`

**Approach:**
- 创建代理商层级视图，组合 agent_closure + agent + profit_daily
  ```yaml
  views:
    - name: agent_hierarchy
      cubes:
        - join_path: agent_closure
          includes:
            - depth
            - hierarchy_level
        - join_path: agent_closure.agent
          prefix: true
          includes:
            - name
            - agent_no
            - parent_id
        - join_path: agent_closure.agent.profit_daily
          prefix: true
          includes:
            - net_profit
            - total_trade_amt
            - stat_date
  ```
- 注意：agent_closure→agent→profit_daily 路径需要两步 join

**Verification:**
- 视图可以按层级维度查询代理商的分润贡献
- hierarchy_level 维度正确标识绝对层级

---

- [ ] **Unit 11: 更新 inactive_merch_view 并新增运营看板视图**

**Goal:** 完善现有视图，新增运营看板视图

**Requirements:** 运营看板(7.1, 7.2, 7.3)、商户活跃度(1.4)

**Dependencies:** Unit 1, Unit 4, Unit 7

**Files:**
- Modify: `model/views/inactive_merch_view.yml`
- Create: `model/views/management_dashboard.yml`
- Create: `model/views/agent_dashboard.yml`
- Create: `model/views/operations_dashboard.yml`

**Approach:**
- 更新 `inactive_merch_view.yml`：确保 join_path 正确（merch→order_daily 路径）
- 管理层看板：整合交易、分润、活跃商户/代理商数、进件转化率等核心 KPI
- 代理商看板：整合自进件分润、名下商户交易、分润趋势
- 运营看板：整合进件队列、沉睡商户、退款异常预警

**Verification:**
- 各看板视图核心 KPI 可查询
- inactive_merch_view 正确识别沉睡商户

## System-Wide Impact

- **Interaction graph:** 新增的 join 会使 agent 成为维度枢纽节点，影响所有通过 agent 关联的查询
- **Error propagation:** 计算型度量（净分润率等）需处理除零情况（分母为 0 时返回 NULL）
- **State lifecycle risks:** order_daily 为外部导入数据，可能存在缺失日、重复数据，视图层不做额外处理
- **API surface parity:** cube.js REST API 自动暴露所有 cube 和 view 的成员，新增维度/度量自动可用
- **Unchanged invariants:** 现有 7 个 cube 的基础维度和度量不变，仅新增 join 和计算字段

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| agent→profit_daily one_to_many 导致 agent 侧度量膨胀 | agent cube 仅作维度侧使用，不在 agent cube 上定义依赖 profit_daily 的度量 |
| chan cube 基于去重 SQL，order_daily 数据变更时需刷新 | 依赖 CUBEJS_SCHEDULED_REFRESH_DEFAULT=true 自动刷新 |
| 计算型度量除零风险 | 使用 `CASE WHEN denominator = 0 THEN NULL ELSE ... END` 模式 |
| 多步 join 路径（agent_closure→agent→profit_daily）查询性能 | 暂不引入 pre-aggregation，依赖后续性能迭代 |
| agent_rel 的条件 join（agent_type='MERCH'）可能遗漏 CHAN 类型关联 | chan cube 独立提供通道维度，agent_rel→chan 路径不走多态条件 |

## Documentation / Operational Notes

- cube.js 开发模式运行于 Docker，端口 4000（API）+ 15432（SQL）
- 模型修改后无需重启，cube.js Dev Mode 自动重载
- 新增 cube/view 文件直接放入 `model/cubes/` 和 `model/views/` 目录

## Sources & References

- **Origin documents:** [docs/design.md](../design.md), [docs/bi-requirement.md](../bi-requirement.md)
- DDL files: `ddl/*.sql`
- Cube.js docs: joins, views, sub_query
