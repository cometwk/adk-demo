# 对话选项与选择记录

> 主题：RestQueryComputeStore（`react-query-compute.ts`）Brainstorm + Plan  
> 日期：2026-05-27

---

## 1. ComputeQuery.source 如何映射到 REST API prefix？

| 选项 | 说明 |
| --- | --- |
| A. 复用 GraphStore 的 typeRegistry | source 名 = 实体类型名，共用 prefix |
| B. 独立 computeSourceRegistry | 与 typeRegistry 分离，可只注册 OLAP 表 |
| C. 构造函数直接传入 source→prefix 映射表 | 最简单，无 registry 抽象 |

**你的选择：A — 复用 GraphStore 的 typeRegistry**

---

## 2. getSourceSchema() 的字段元数据从哪里来？

| 选项 | 说明 |
| --- | --- |
| A. 静态配置 | 构造函数传入 source→FieldSchema[] 映射 |
| B. 从 ontology 实体属性推导 | aggregatable 按类型推断 |
| C. 调用 REST schema/metadata 接口 | 若后端有 |
| D. Phase 1 最小实现 | getSourceSchema 返回空 fields，仅 aggregate 可用 |

**你的选择：B — 从 ontology 实体属性推导**

---

## 3. REST 聚合 API 返回扁平行，RestQueryComputeStore 应如何处理？

| 选项 | 说明 |
| --- | --- |
| A. 归一化 | REST 扁平行 → ComputeRow（groupBy 字段放入 group 对象，与 InMemory 一致） |
| B. 透传 | 直接返回 REST 扁平行，不包装 group（需改 ComputeRow 约定） |

**你的选择：A — 归一化为 ComputeRow（含 group 包装）**

---

## 4. 本次交付范围？

| 选项 | 说明 |
| --- | --- |
| A. 仅实现 provider 层 | react-query-compute.ts + apiAggregate + helpers，不改 demo |
| B. 同步更新 rest demo | helper.ts 改用 RestQueryComputeStore |
| C. provider + 单元测试 | mock axios，demo 暂不改 |

**你的选择：A — 仅实现 provider 层**

---

## 5. getSources() 应返回哪些数据源？

| 选项 | 说明 |
| --- | --- |
| A. 返回 typeRegistry 中所有实体类型 | 全部作为可用 source |
| B. 仅返回有 aggregatable 字段的实体 | 从 ontology 推导后过滤 |
| C. 构造函数显式指定 | 如 [OrderDaily, ProfitDaily] |

**你的选择：B — 仅返回有 aggregatable 字段的实体**

---

## 6. Brainstorm 完成后，接下来做什么？

| 选项 | 说明 |
| --- | --- |
| A. Proceed to planning（推荐） | 运行 /ce:plan 生成实现计划 |
| B. Review and refine | 审查并完善需求文档 |
| C. Ask more questions | 继续澄清细节 |
| D. Done for now | 暂存，稍后继续 |

**你的选择：A — Proceed to planning**

---

## 7. Plan 完成后，接下来做什么？

| 选项 | 说明 |
| --- | --- |
| A. Start /ce:work | 开始实现 |
| B. Open plan in editor | 打开计划文档审查 |
| C. Run document-review | 结构化审查计划 |
| D. Done for now | 稍后继续 |

**你的选择：D — Done for now**

---

## 产出文档

| 文档 | 路径 |
| --- | --- |
| 需求文档 | `docs/brainstorms/2026-05-27-rest-query-compute-store-requirements.md` |
| 实现计划 | `docs/plans/2026-05-27-001-feat-rest-query-compute-store-plan.md` |
