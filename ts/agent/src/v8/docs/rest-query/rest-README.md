  架构决策：
  - 两阶段设计：Phase 1 纯迁移 → Phase 2 Runtime 集成
  - Ontology 独立：RestAccessBinding 保持原有机制，Ontology 仅用于 Prompt
  - HTTP 客户端不变：保持全局 axios + token 管理

  文件映射：
  - RestGraphStore.ts → RestQueryProvider.ts（类重命名）
  - types.ts → bindings.ts + context.ts（拆分）
  - axios.ts → http-client.ts（文件重命名）
