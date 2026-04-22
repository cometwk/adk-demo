---
date: 2026-04-22
topic: neuro-symbolic-memory-dsl
---

# Neuro-Symbolic Memory DSL (MVP)

## Problem Frame

think.md 提出了一个优雅的设计：让 LLM 作为"指针"在 TypeScript 定义的图谱中"游走"，通过预设的 DSL 进行推理。

eval.md 深刻评审指出：设计很美，但执行语义是"伪确定性"的——LLM 不能真正执行 TypeScript runtime，只能被 Prompt 约束去"模拟执行"。

**核心问题：** 如何构建一个 LLM 可理解的符号层（DSL），让推理路径可追踪、可调试，同时不依赖真正的 Runtime 执行引擎。

**MVP 目标：** 先实现纯 DSL 层，验证"Prompt 协议 + JSDoc 语义标签"的有效性，后续迭代再决定是否添加真正的 Runtime。

## Requirements

**核心抽象层 (src/base.ts)**

- R1. 定义 `BaseNode` 抽象类作为所有节点的基类
- R2. 提供 `linkTo(relation: string)` 方法用于节点间的关联遍历
- R3. 提供 `hasTrait(trait: string)` 方法用于特质判断
- R4. 所有方法使用结构化语义标签（@semantic）标注，包含 relation、traversal_cost、cardinality 等元信息

**业务 Node Classes (src/nodes.ts)**

- R5. 实现 `Concept` 节点：知识单元，包含 name、definition、keywords、difficulty 等属性
- R6. 实现 `Topic` 节点：概念的主题分组，支持按领域导航
- R7. 实现 `Source` 节点：概念的学习来源，支持知识溯源
- R8. 实现 `Prerequisite` 边类：概念间的显式依赖关系，支持学习路径推理
- R9. 每个节点类提供语义化的游走方法（如 `getRelatedConcepts()`、`getTopics()` 等）
- R10. 提供推理方法（如 `evaluateReadiness()` 判断前置知识是否满足）
- R11. 所有方法使用 @semantic 标签标注完整的语义元信息

**示例数据**

- R12. 内嵌一组示例节点数据（至少 5 个 Concept、2 个 Topic、3 个 Source、若干 Prerequisite 关系）
- R13. 数据覆盖典型的知识图谱场景（如编程学习路径）

**协议配置**

- R14. 编写 CLAUDE.md（或类似配置文件），定义 Graph Reasoning Protocol
- R15. 协议包含：Discovery Phase、Traversal Phase、Constraint-Based Inference、Output Format 规范
- R16. 定义推理路径的可视化格式：`[Path]: Node(A) --(relation)--> Node(B) --(action)--> Result`

## Success Criteria

- Claude Code 能正确识别 Node 类的可用 Actions 和 Links
- 对于"学习某个概念需要什么前置知识"这类问题，能输出可追踪的推理路径
- 推理路径格式符合协议定义
- 同一问题的推理路径具有基本的一致性（路径起点和关键节点相同）

## Scope Boundaries

- **不包含真正的 Runtime 执行引擎** - LLM 通过 Prompt 协议"模拟执行"
- **不包含状态持久化机制** - 暂不支持动态更新节点数据
- **不包含复杂推理算法** - 只支持基于 linkTo 和推理方法的基础遍历
- **不包含 JSON 数据加载** - 使用 TypeScript 内嵌数据

## Key Decisions

- **架构方向：纯 DSL 层，暂不实现 Runtime** - 先验证 Prompt 协议的有效性，降低初始复杂度
- **验证场景：知识/概念图谱** - 与通用框架定位一致，语义更清晰
- **数据存储：TypeScript 内嵌** - 静态加载，适合 MVP 验证
- **JSDoc 风格：结构化语义标签** - 采用 @semantic 标签，让 LLM 更易解析语义信息

## Dependencies / Assumptions

- Claude Code 具备读取和理解 TypeScript JSDoc 的能力
- Prompt 协议能有效约束 LLM 的推理路径选择
- @semantic 标签格式对 LLM 足够直观

## Outstanding Questions

### Deferred to Planning

- [Affects R4][Needs research] @semantic 标签的具体字段设计 - 需要参考 eval.md 建议，确定 relation、traversal_cost、risk_signal 等字段的标准化格式
- [Affects R12][Needs research] 示例数据的具体内容 - 选择什么领域作为示例（编程学习？数学概念？其他？）
- [Affects R15][Technical] CLAUDE.md 的具体位置 - 是放在项目根目录还是 src 目录下？

## Next Steps

→ `/ce:plan` for structured implementation planning