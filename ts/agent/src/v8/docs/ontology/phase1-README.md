文档涵盖了以下内容：

  - Schema 体系 — TypeSchema / RelationSchema / Ontology 类型定义 + 辅助函数，agentVisible 默认值从 false 改为 true，新增 getRelationByType()
  - Registry — 4 个 Registry + AgentRegistry Facade，保持全局静态模式
  - Decorator — 保留 @agentType / @agentProperty / @agentMethod / @agentRelations
  - BaseNode — 移除 WeakMap/GraphStore 耦合，纯抽象基类
  - Builder — buildOntology() 逻辑不变
  - RelationBinding + Validation — 直接移植
  - Tools — inspect_schema 适配 V8 tool 体系
  - Prompt 集成 — 新增 buildOntologyPrompt()
  - 迁移清单 — 分直接移植 / 需修改 / 新增 / 废弃四类
  - 与 Engine 的集成点 — 明确 Ontology → Engine 和 Engine → Ontology 的交互

  关键设计决策：
  1. 保留 Decorator + 全局静态 Registry 模式
  2. BaseNode 移除 GraphStore 耦合，通过 NodeInstanceContainer 解耦
  3. agentVisible 默认改为 true（Agent 主导推理，属性默认可见）
  4. ontology 模块独立于 engine，无循环依赖
