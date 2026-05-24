---
date: 2026-05-24
topic: v8-rest-query-demo-case
---

# V8 RestQuery Demo Case: Payment Domain

## Problem Frame

V6 的 `restapi` 场景验证了 REST API GraphStore 实现。V8 引入了新的 `RestQueryProvider` 和 ontology 模块，需要将 payment domain 场景移植到 v8 架构，验证 rest-query 实现的正确性和完整性。

## Requirements

**Ontology 定义**
- R1. 使用 v8 ontology registry/builder 模式定义 Agent, Merch, Apply, AgentRel, AgentClosure, OrderDaily, ProfitDaily 实体
- R2. 定义实体属性（properties）和关系（relations）
- R3. 创建 `src/v8/demo/case/rest/ontology.ts`

**Access Bindings**
- R4. 将 v6 access-bindings.ts 移植为 v8 格式，适配新的 AccessContext 类型
- R5. 保留所有关系绑定：parent/children/descendant_of/ancestor_of/binds_merch/submitted_apply/has_profit_daily/bound_by/created_from/has_order_daily/submitted_by/creates/for_agent/for_merch/ancestor/descendant/for_merch/for_agent
- R6. 创建 `src/v8/demo/case/rest/bindings.ts`

**Type Registry**
- R7. 创建 typeRegistry，映射实体类型到 API prefix 和 NodeClass
- R8. 创建 `src/v8/demo/case/rest/context.ts`

**Demo 测试**
- R9. 创建 demo.ts，演示 RestQueryProvider 的使用：findNodes, getNode, getNeighbors, getEdgeSummary
- R10. 创建 `src/v8/demo/case/rest/demo.ts`

**单元测试**
- R11. 创建 helpers.test.ts 测试 filtersToSearchParams, neighborsFromNodes 等辅助函数
- R12. 创建 RestQueryProvider.test.ts 测试 getNode, getBaseNode, getNeighbors, parseGlobalId
- R13. 创建 `src/v8/demo/case/rest/tests/` 目录

## Success Criteria
- demo.ts 可运行，能查询 Agent/Merch 并遍历关系
- 所有单元测试通过
- 编译无错误

## Scope Boundaries
- 不修改 v8 provider/rest-query 核心实现
- 不引入新的实体类型
- 不实现 ComputeStore/VectorStore（仅 GraphStore 验证）

## Key Decisions
- **Ontology 方式**: 使用 v8 registry/builder 模式而非 decorator
- **实体范围**: 全部移植，完整验证
- **测试范围**: 单元测试 + 集成 demo

## Dependencies / Assumptions
- 依赖 v8 provider/rest-query 已实现完整
- 依赖 v8 ontology 模块可用
- 依赖后端 REST API 可访问

## Next Steps
→ /ce:plan