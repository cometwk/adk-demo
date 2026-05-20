# 0519


**Cursor**


# **REST-CRUD 混合 Binding (声明 + 保底) 方案**

---

## 🚀 重构成果与收益

1. **去硬编码与高对称美**：
   - 彻底移除了原 `RestCrudGraph.ts` 中手写堆叠的 300+ 行命令式 `buildRelationHandlers` 硬编码。
   - `RestCrudGraphStore` 的实现代码缩减至 **110 行以内**，只负责路由，极其精简可维护。
2. **声明式与编程式（保底）完美共存**：
   - 使用 **`paymentAccessBindings` (Access Binding)** 全面描述支付域的接口关联图谱。
   - 对于通用的关联（如 `Agent` 到 `Apply`、`Apply` 到 `Merch` 等），直接采用 `kind: 'search'` 声明式处理。
   - 对于不对外直接公开 `search`、或需要特殊业务逻辑的关系（如闭包表 `descendant_of`、`ancestor_of`、`binds_merch` 多态关联等），使用 `kind: 'custom'` 注册 `handler`，以 **`NeighborHandler` 的形式进行编程式 Fallback 保底**。
3. **ID 统一剥离前缀**：
   - `AccessContext` 内部通过 `ctx.rawId(source)` 自动、统一地剔除全局唯一 ID 的类型前缀（如 `Agent:2028360156416315392` -> `2028360156416315392`），消除因混合 ID 导致 REST 请求 404 的隐患。
4. **批量 Resolve 的安全上限**：
   - 通用执行器控制 `agentsByIds`、`merchsByIds` 批量查询时，底层强制通过 `.slice(0, 100)` 控制，防止在大结果集下引发多跳 N+1 查询爆炸。
5. **高度鲁棒的概要探测 ( getEdgeSummary )**：
   - 在 `getEdgeSummary` 中，加入了优雅的 `try/catch` 和 `apiSearchSafe` 穿透设计。
   - 如果遇到未上线、或不公开的端点（如 404 / 401 / 403 异常），直接记录日志并安全跳过，防止探测全图时整个服务崩溃。
6. **精密的防漂移测试**：
   - 在 `bindings.test.ts` 中引入双层校验：物理 SQL `paymentRelationBindings` 与 接口层 `paymentAccessBindings` 必须双向一致覆盖 L1 Ontology 声明的所有关系，彻底切断了未来的代码漂移。

---

## 🛠 详细修改细节

* **新建 `restapi/access-bindings.ts`**：
  - 定义了 `RestAccessBinding` 类型和 `paymentAccessBindings` 的关系声明与 custom Fallback 逻辑。
* **新建 `restapi/access-executor.ts`**：
  - 承载 `executeAccessBinding` 核心执行器与 `sharedAccessContext` 上下文对象（剥离前缀、控制上限、执行请求）。
* **重构 `restapi/RestCrudGraph.ts`**：
  - 清理所有脏手写 handler，重构为完全由 bindings & executor 驱动。
* **更新 `restapi/bindings.ts`**：
  - 补全了 L1 注册关系中包含的所有物理映射，确保 SQL 层语义高度严谨。
* **重写 `restapi/search-helpers.ts`**：
  - 增强 `apiSearchSafe`，提供自动捕获 404 端点熔断功能，缓存已确认不可用的路径（优化网络开销）。
* **新增 `restapi/bindings.test.ts`**：
  - 测试物理 SQL 绑定及 HTTP REST 绑定的双层无漂移校验。
* **更新 `docs/design/1-graph-layers.md`**：
  - 追加了 **§5.4 `RestAccessBinding`** 的独立设计规范与核心机制说明，沉淀原型知识，确保文档同步。
