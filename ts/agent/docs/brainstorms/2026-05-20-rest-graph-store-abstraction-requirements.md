---
date: 2026-05-20
topic: rest-graph-store-abstraction
---

# RestGraphStore 抽象重构

## Problem Frame

当前 `RestCrudGraph.ts` 包含了声明式 bindings 驱动的 GraphStore 实现核心逻辑，但与业务具体绑定 (`paymentAccessBindings`) 紧密耦合。需要抽象出一个通用的 `RestGraphStore` 基类，让业务代码 (`RestCrudGraph`) 只需定义 bindings 并传入构造函数。

## Requirements

**RestGraphStore 基类**
- R1. 创建 `src/v6/provider/rest/rest.ts`，定义 `RestGraphStore` 类实现 `GraphStore` 接口
- R2. 构造函数接受 `bindings: RestAccessBindingMap` 和 `typeToPrefix: Record<string, string>` 参数
- R3. 构造函数可选接受 `accessContext?: Partial<AccessContext>` 用于扩展上下文
- R4. 提供 `getNode`, `findNodes`, `getNeighbors`, `getEdgeSummary` 方法实现

**类型定义迁移**
- R5. `RestAccessBinding`, `RestAccessBindingMap`, `AccessContext`, `CustomHandler` 类型定义移至 `provider/rest/rest.ts`
- R6. `AccessContext` 包含基础方法：`rawId`, `toGlobalId`, `apiSearch`, `apiSearchSafe`, `fetchOne`, `neighborsFromNodes`, `emptyNeighbors`
- R7. `AccessContext` 设计为可扩展，子类可添加业务专用方法

**axios 迁移**
- R8. `axios.ts` 移动到 `src/v6/provider/rest/axios.ts`，作为默认 REST 客户端实现

**RestCrudGraph 简化**
- R9. `RestCrudGraph` 继承 `RestGraphStore`
- R10. 构造函数传入 `paymentAccessBindings`, `TYPE_API_PREFIX`, 扩展的 `AccessContext`

**access-executor 保留**
- R11. `executeAccessBinding` 逻辑保留在 `access-executor.ts`，不移入 provider
- R12. `access-executor.ts` 引用 provider 中的类型定义

**业务文件保留**
- R13. `paymentAccessBindings` 保留在 `access-bindings.ts`
- R14. `TYPE_API_PREFIX` 保留在业务代码中（移出 `search-helpers.ts`）
- R15. DDL 文件 (`ddl/*.sql`) 保留在当前目录
- R16. `bindings.ts` 中的 `paymentRelationBindings` 待删除（与 SqlGraphStore 相关，本次无关）
- R17. Row types 和 GraphEntityType 保留在 `types.ts`

## Success Criteria
- RestGraphStore 可独立使用，不依赖业务代码
- RestCrudGraph 代码量大幅减少，只定义 bindings
- 类型定义集中且清晰
- 现有测试通过

## Scope Boundaries
- 不涉及 `paymentRelationBindings` 的 SqlGraphStore 相关逻辑
- 不修改 ontology.ts 实体定义
- 不修改 DDL 文件

## Key Decisions
- **继承模式**: RestCrudGraph 继承 RestGraphStore，而非组合注入
- **axios 位置**: 移动到 provider/rest/ 作为默认实现
- **TYPE_API_PREFIX 抽象**: 作为构造参数传入，而非内嵌在 binding 中
- **AccessContext 扩展**: 基础方法 + 子类扩展业务方法
- **executor 保留**: executeAccessBinding 不移入 provider，保留在业务目录

## Dependencies / Assumptions
- GraphStore 接口稳定不变
- 现有 API 搜索模式不变

## Outstanding Questions

### Deferred to Planning
- [Affects R6][Needs research] AccessContext 基础方法的具体范围是否需要调整
- [Affects R11][Technical] access-executor.ts 引用 provider 类型时的 import 路径设计

## Next Steps
→ /ce:plan