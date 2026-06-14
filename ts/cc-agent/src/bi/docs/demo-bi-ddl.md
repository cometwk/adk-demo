# 业务表 DDL 关系分析与业务说明

> 基于 `ddl/1.md`、`ddl/2.md` 及各 SQL DDL 文件整理

---

## 1. 业务域概述

本系统是一个**支付代理分润平台**，核心业务流程为：

1. **代理商拓展商户** → 进件申请 → 商户入驻
2. **商户发起交易** → 通道处理 → 日交易统计
3. **日终结算** → 按代理关系计算分润 → 分润日报

涉及四大角色：代理商、商户、机构商户（通道侧映射）、通道。

---

## 2. 表清单与职责

| 表名 | 职责 | 类型 | 核心业务含义 |
|------|------|------|-------------|
| `agent` | 代理商主表 | 实体表 | 分润体系核心角色，负责拓展商户或通道 |
| `agent_closure` | 代理商层级闭包表 | 关系表 | 存储所有祖先-后代关系，支持多级代理树查询 |
| `agent_rel` | 代理商与商户/通道绑定关系 | 关系表 | 多态关联，驱动分润计算的核心纽带 |
| `merch` | 商户主表 | 实体表 | 接入支付平台的商家，发起支付请求 |
| `apply` | 进件申请记录 | 流程表 | 代理商为商户提交入驻申请的完整记录 |
| `order_daily` | 商户日交易统计 | 统计表 | 按商户+通道+日期维度的交易汇总（外部导入） |
| `chan` | 通道主表 | 实体表 | 底层支付渠道/机构（如微信支付、支付宝、建行等） |
| `profit_daily` | 代理商日分润统计 | 统计表 | 按代理商+日期维度的分润结算结果 |

---

## 3. 实体关系详析

### 3.1 代理商层级体系：`agent` ↔ `agent_closure`

```
agent (代理商)
  ├── parent_id → 直接父节点（辅助字段，根节点 parent_id = 0）
  └── agent_closure (闭包表)
        ├── ancestor_id → 祖先节点 ID
        ├── descendant_id → 后代节点 ID
        └── depth → 祖先到后代的层级距离
```

**设计模式**：Closure Table（闭包表）

- `agent.parent_id`：仅记录直接父节点，用于查直接下级
- `agent_closure`：记录所有祖先-后代对，支持：
  - 查全部子孙：`WHERE ancestor_id = ?`
  - 查全部祖先：`WHERE descendant_id = ?`
  - 查层级深度：`depth` 字段
  - 自身关系：`depth = 0` 的行表示节点自身

**关联方式**：`agent.id = agent_closure.ancestor_id` 或 `agent.id = agent_closure.descendant_id`

### 3.2 代理关系：`agent_rel`（多态关联）

```
agent_rel (代理关系)
  ├── agent_no → agent.agent_no    (哪个代理商)
  ├── agent_type → 'MERCH' / 'CHAN' (代理什么类型)
  ├── obj_no → merch.merch_no / chan.chan_no (代理的具体对象)
  ├── rate → 实际分润费率（十万分比）  ← 唯一参与分润计算的费率字段
  ├── mode → 费率模式（1:占比, 2:固定）
  ├── rate_value → 用户设置值（不参与计算，仅记录）
  └── apply → 进件人标志（1=自己进件的商户）
```

**多态设计**：

| agent_type | obj_no 含义 | obj_id 含义 | 业务含义 |
|------------|-------------|-------------|---------|
| `MERCH` | 商户编号 | 商户 ID | 代理商代理商户 |
| `CHAN` | 通道编号 | 通道 ID | 代理商代理通道 |

**约束**：
- `UK(agent_no, obj_no)`：同一代理商对同一对象只有一条关系
- 一个对象可绑定多个代理商（n:n）
- 一个代理商只能绑定 chan 或 merch 二选一

**关联方式**：
- `agent_rel.agent_no = agent.agent_no`
- `agent_rel.obj_no = merch.merch_no`（当 `agent_type = 'MERCH'`）

### 3.3 进件流程：`apply` → `merch`

```
apply (进件申请)
  ├── agent_no → agent.agent_no    (谁提交的申请)
  ├── merch_no → merch.merch_no    (申请成功后关联的商户)
  ├── status → 0:INIT, 1:PENDING, 2:SUCCESS, 3:FAIL
  └── rate → 签约费率（十万分比）
```

**流程**：
1. 代理商提交进件申请 → `apply` 记录创建，`status = PENDING`
2. 通道审核通过 → `status = SUCCESS`
3. 创建商户 → `merch` 记录生成
4. 创建代理关系 → `agent_rel` 记录生成，`apply = 1`

**关联方式**：
- `apply.agent_no = agent.agent_no`
- `apply.merch_no = merch.merch_no`（申请成功后）

### 3.4 商户与交易：`merch` → `order_daily`

```
merch (商户)
  ├── merch_no → 唯一编号
  ├── rate → 商户费率（十万分比）
  ├── chan_merch_no → 机构商户编号（通道侧映射）
  └── apply_date → 进件/签约日期

order_daily (日交易统计)
  ├── merch_no → merch.merch_no
  ├── chan_no → 通道编号
  ├── report_date → 结算日期
  ├── total_count → 总订单数
  └── total_amount → 总交易额（分）
```

**关联方式**：`order_daily.merch_no = merch.merch_no`

**唯一约束**：`UK(report_date, merch_no, chan_no)` — 每个商户在每个通道每天一条统计

**数据来源**：外部导入，非系统内生成

### 3.5 分润结算：`order_daily` + `agent_rel` → `profit_daily`

```
profit_daily (日分润统计)
  ├── stat_date → 统计日期
  ├── agent_no → 代理商编号
  ├── agent_type → MERCH / CHAN
  ├── rate → 分润比例（十万分比）
  │
  ├── total_* → 名下所有商户的分润统计
  │     ├── total_trade_amt     交易总金额
  │     ├── order_cnt           成功订单数
  │     ├── total_profit        分润总收入
  │     ├── total_refund_amt    退款总金额
  │     ├── refund_cnt          退款笔数
  │     ├── total_refund_deduct 退款扣除分润
  │     └── net_profit          净分润 = total_profit - total_refund_deduct
  │
  ├── own_* → 仅 apply=1（自己进件商户）的分润统计
  │     ├── own_trade_amt       自己进件商户交易金额
  │     ├── own_order_cnt       自己进件商户订单数
  │     ├── own_profit          自己进件商户分润收入
  │     ├── own_refund_amt      自己进件商户退款金额
  │     ├── own_refund_cnt      自己进件商户退款笔数
  │     ├── own_refund_deduct   自己进件商户退款扣除分润
  │     └── own_net_profit      自己进件商户净分润
  │
  ├── status → 0:未结算, 1:审批中, 2:已审批/已结算
  └── profit_settle_id → 关联结算记录
```

**唯一约束**：`UK(stat_date, agent_type, agent_no)` — 每个代理商每天一条分润记录

**双重统计设计**：
- `total_*`：该代理商名下**所有**关联商户的分润（含下级代理进件的）
- `own_*`：仅统计 `apply=1`（自己直接进件的商户）的分润

**关联方式**：
- `profit_daily.agent_no = agent.agent_no`
- 间接关联：通过 `agent_rel` 将 `order_daily` 的交易数据聚合计算为 `profit_daily`

---

## 4. 完整关联关系图

```
                        ┌──────────────┐
                        │    agent     │
                        │   (代理商)    │
                        └──┬───┬───┬───┘
                           │   │   │
              parent_id ───┘   │   └── agent_no
                           │   │         │
                    ┌──────▼───▼──┐      │
                    │agent_closure│      │
                    │ (层级闭包)   │      │
                    └─────────────┘      │
                                         │
              agent_no ──────────────────┤
              (进件人)                    │
                │                        │
         ┌──────▼──────┐          ┌──────▼──────┐
         │    apply    │          │  agent_rel   │
         │  (进件申请)  │          │  (代理关系)   │
         └──────┬──────┘          └──────┬──────┘
                │                        │
         merch_no (成功后)         obj_no (MERCH类型)
                │                        │
         ┌──────▼────────────────────────▼──┐
         │            merch                  │
         │           (商户)                  │
         └──────────────┬────────────────────┘
                        │
                 merch_no
                        │
              ┌─────────▼─────────┐
              │    order_daily    │
              │   (日交易统计)     │
              └─────────┬─────────┘
                        │
              计算分润 (agent_rel.rate)
                        │
              ┌─────────▼─────────┐
              │   profit_daily    │
              │  (日分润统计)      │
              └───────────────────┘
```

---

## 5. 费率体系详解

### 5.1 费率单位

所有费率以**十万分比**（basis = 100,000）存储。例如：
- `rate = 3000` 表示 3%（3000/100000 = 0.03）
- `rate = 50` 表示 0.05%（50/100000 = 0.0005）

### 5.2 费率公式

```
平台净利润 = 商户费率 - 通道费率 - Σ(通道代理费率) - Σ(商户代理费率) > 0
```

其中：
- **商户费率**（`merch.rate`）：平台向商户收取的费率（收入端）
- **通道费率**（`chan.rate`）：平台向通道支付的成本（成本端）
- **代理费率**（`agent_rel.rate`）：分润给代理商的成本（成本端）
- 平台净利润必须 > 0

### 5.3 分润模式

| mode | 名称 | rate 计算方式 | rate_value 含义 |
|------|------|--------------|----------------|
| 1 | PERCENT（收益占比） | `rate = (merch.rate - chan.rate) * rate_value` | 百分比占比 | |
| 2 | FIXED（固定模式） | `rate = rate_value` | 十万分比固定值 | |

**关键**：`agent_rel.rate` 是唯一参与分润计算的字段，`rate_value` 仅记录用户原始设置值。

---

## 6. 数据流向

### 6.1 进件流程

```
代理商提交申请 → apply (status=PENDING)
                    ↓
              通道审核通过 → apply (status=SUCCESS)
                    ↓
              创建商户 → merch
                    ↓
              创建代理关系 → agent_rel (apply=1)
```

### 6.2 交易统计

```
外部系统导入 → order_daily (按商户+通道+日期)
```

### 6.3 分润结算

```
order_daily (商户日交易)
      ↓ 按 merch_no 关联 agent_rel
      ↓ 按 agent_rel.rate 计算分润
profit_daily (代理商日分润)
      ↓
  结算审批 → status: 0→1→2
```

---

## 7. 关键业务规则

1. **多级代理**：通过闭包表实现任意层级代理体系，支持查询全部上级/下级
2. **分润计算**：`agent_rel.rate` 是唯一参与分润计算的费率字段
3. **进件追踪**：`agent_rel.apply = 1` 标识该代理商是商户的直接进件人
4. **双重统计**：`profit_daily` 同时统计 total（全部）和 own（仅自己进件）两个维度
5. **日级结算**：T+1 结算流程，`profit_daily.status` 跟踪结算状态
6. **代理类型互斥**：一个代理商只能绑定 chan 或 merch 二选一
7. **商户-通道多对多**：一个商户可通过不同 `chan_merch_no` 接入多个通道。**注意：`merch` 表仅存储一个 `chan_merch_no`（当前机构商户映射），完整的商户-通道多对多关系需通过 `order_daily` 的 `chan_no` 维度获取**
8. **通道表**：`chan` 表存储通道属性（编号、类型、费率、名称等），`order_daily` 中的 `chan_no`/`chan_id` 为冗余字段。通道费率（`chan.rate`）可用于平台利润空间计算
