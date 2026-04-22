---
title: Neuro-Symbolic Memory DSL Implementation
type: feat
status: active
date: 2026-04-22
origin: docs/brainstorms/2026-04-22-neuro-symbolic-memory-dsl-requirements.md
---

# Neuro-Symbolic Memory DSL Implementation

## Overview

实现一个 TypeScript DSL 层，让 LLM 通过 Prompt 协议在定义的知识图谱中"游走"推理。这是 MVP 验证版，不包含真正的 Runtime 执行引擎——LLM 通过读取 JSDoc 和遵循协议来"模拟执行"。

## Problem Frame

think.md 提出的设计：LLM 作为"指针"在 TypeScript 图谱中游走。
eval.md 的评审：设计很美，但执行语义是"伪确定性"的——LLM 不能真正执行 TypeScript runtime。

MVP 目标：先验证"Prompt 协议 + JSDoc 语义标签"的有效性，后续迭代再决定是否添加 Runtime。

## Requirements Trace

- R1. 定义 `BaseNode` 抽象类作为所有节点的基类
- R2. 提供 `linkTo(relation: string)` 方法用于节点间的关联遍历
- R3. 提供 `hasTrait(trait: string)` 方法用于特质判断
- R4. 所有方法使用 @semantic 标签标注语义元信息
- R5. 实现 `Concept` 节点：知识单元，包含 name、definition、keywords、difficulty
- R6. 实现 `Topic` 节点：概念的主题分组
- R7. 实现 `Source` 节点：概念的学习来源
- R8. 实现 `Prerequisite` 边类：概念间的显式依赖关系
- R9. 每个节点类提供语义化的游走方法
- R10. 提供推理方法（如 `evaluateReadiness()`）
- R11. 所有方法使用 @semantic 标签标注完整语义
- R12. 内嵌示例节点数据（至少 5 Concept、2 Topic、3 Source）
- R13. 数据覆盖编程学习路径场景
- R14. 编写 CLAUDE.md，定义 Graph Reasoning Protocol
- R15. 协议包含 Discovery、Traversal、Constraint-Based Inference、Output Format
- R16. 定义推理路径可视化格式

## Scope Boundaries

- 不包含真正的 Runtime 执行引擎
- 不包含状态持久化机制
- 不包含复杂推理算法
- 不包含 JSON 数据加载

## Context & Research

### Relevant Code and Patterns

这是一个全新项目，src 目录为空。需要从头构建 TypeScript 项目结构。

### External References

- TypeScript JSDoc 支持自定义标签（如 @semantic, @edge），遵循标准注释模式
- TypeScript 5.x 支持抽象类 (`abstract class`) 和继承 (`extends`)
- eval.md 建议：使用结构化语义标签标注 relation、traversal_cost、cardinality 等

## Key Technical Decisions

- **@semantic 标签格式**：使用多行注释格式，标注 relation、traversal_cost、cardinality、risk_signal 等字段
- **@edge 标签格式**：标注 from、to、type、cardinality 用于边关系
- **示例数据领域**：编程语言学习（TypeScript/React 等），包含清晰的前置依赖链
- **CLAUDE.md 位置**：项目根目录，便于 Claude Code 自动加载
- **TypeScript 配置**：使用 TypeScript 5.x，strict mode

### Resolved During Planning

- **@semantic 标签字段设计**：采用 eval.md 建议的结构化格式，包含 relation、traversal_cost、cardinality、risk_signal
- **示例数据领域**：编程语言学习路径（JS → TypeScript → React）
- **CLAUDE.md 位置**：项目根目录

### Deferred to Implementation

- **具体节点属性名称**：实现时根据语义清晰度调整
- **示例数据的具体内容**：实现时创建具体的概念定义和关系

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

**架构层次：**

```
src/
├── base.ts          # 核心抽象层：BaseNode 抽象类
├── nodes.ts         # 业务 Node Classes：Concept, Topic, Source
├── edges.ts         # 边关系：Prerequisite
├── data.ts          # 示例数据：编程学习路径
└── index.ts         # 导出入口

CLAUDE.md            # Graph Reasoning Protocol（项目根目录）
```

**@semantic 标签格式示例：**

```typescript
/**
 * 获取与当前概念相关的其他概念
 *
 * @semantic
 * relation: related_to
 * traversal_cost: low
 * cardinality: many
 * risk_signal: none
 *
 * @returns 关联的概念列表
 */
getRelatedConcepts(): Concept[]
```

**@edge 标签格式示例：**

```typescript
/**
 * @edge
 * from: Concept
 * to: Concept
 * type: prerequisite
 * cardinality: many
 * bidirectional: false
 */
```

**推理路径格式：**

```
[Path]: Concept(React) --(prerequisite)--> Concept(TypeScript) --(prerequisite)--> Concept(JavaScript) --(action:evaluateReadiness)--> Result: ready
```

## Implementation Units

- [ ] **Unit 1: 项目配置**

**Goal:** 建立 TypeScript 项目基础环境

**Requirements:** 无直接对应，是基础设施

**Dependencies:** None

**Files:**
- Modify: `package.json` - 添加 TypeScript 依赖和脚本
- Create: `tsconfig.json` - TypeScript 编译配置
- Create: `src/index.ts` - 导出入口（空文件，后续填充）

**Approach:**
- 安装 TypeScript 5.x
- 配置 strict mode、ES Module、目标 ES2020
- 设置 src 作为源码目录

**Patterns to follow:**
- 标准 TypeScript 项目配置

**Test scenarios:**
- Happy path: `tsc --noEmit` 通过类型检查
- Edge case: 无 TypeScript 文件时也能运行

**Verification:**
- TypeScript 编译无错误
- 项目结构清晰可读

---

- [ ] **Unit 2: 核心抽象层**

**Goal:** 定义 BaseNode 抽象类，提供游走和感知协议

**Requirements:** R1, R2, R3, R4

**Dependencies:** Unit 1

**Files:**
- Create: `src/base.ts` - BaseNode 抽象类
- Test: Not applicable（纯类型定义，无运行逻辑）

**Approach:**
- 定义抽象类 `BaseNode`，包含 `id` 属性
- 抽象方法 `linkTo(relation: string): BaseNode[]`
- 抽象方法 `hasTrait(trait: string): boolean`
- 使用 @semantic 标签标注每个方法的语义元信息
- 添加辅助方法如 `getType()`、`getId()` 用于调试

**Technical design:**

```typescript
/**
 * 记忆图谱基础节点
 *
 * 所有节点类型继承此抽象类，
 * 提供统一的游走和感知协议。
 */
abstract class BaseNode {
  id: string;

  /**
   * 游走函数：寻找与当前节点关联的其他节点
   *
   * @semantic
   * relation: dynamic (子类指定)
   * traversal_cost: varies
   * cardinality: many
   *
   * @param relation 关系类型，如 'prerequisite', 'belongs_to'
   * @returns 关联的节点列表
   */
  abstract linkTo(relation: string): BaseNode[];

  /**
   * 感知函数：判断当前节点是否具备某种特质
   *
   * @semantic
   * operation: trait_check
   * cost: low
   *
   * @param trait 特质名称，如 'foundational', 'advanced'
   * @returns 是否具备该特质
   */
  abstract hasTrait(trait: string): boolean;
}
```

**Patterns to follow:**
- TypeScript 抽象类语法 (`abstract class`, `abstract method`)
- JSDoc 多行注释格式

**Test scenarios:**
- 类型检查：继承类必须实现所有抽象方法

**Verification:**
- `tsc --noEmit` 通过
- 所有抽象方法有 @semantic 标签

---

- [ ] **Unit 3: 业务 Node Classes (src/nodes.ts)**

**Goal:** 实现 Concept、Topic、Source 节点类

**Requirements:** R5, R6, R7, R9, R10, R11

**Dependencies:** Unit 2

**Files:**
- Create: `src/nodes.ts` - Concept, Topic, Source 类定义
- Test: Not applicable（纯类型定义）

**Approach:**
- `Concept` 类：name, definition, keywords, difficulty, traits
- `Topic` 类：name, description, concepts (引用列表)
- `Source` 类：name, type (book/course/article), url, reliability
- 每个类实现 `linkTo` 和 `hasTrait`
- 添加语义化游走方法如 `getPrerequisites()`, `getTopics()`, `getSources()`
- 添加推理方法 `evaluateReadiness()` (Concept)

**Technical design:**

```typescript
class Concept extends BaseNode {
  name: string;
  definition: string;
  keywords: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  traits: string[];

  /**
   * 获取学习当前概念所需的前置概念
   *
   * @semantic
   * relation: prerequisite
   * traversal_cost: low
   * cardinality: many
   * risk_signal: missing_prerequisite
   *
   * @returns 前置概念列表
   */
  getPrerequisites(): Concept[] { ... }

  /**
   * 评估是否满足学习当前概念的前置知识要求
   *
   * @semantic
   * operation: readiness_evaluation
   * cost: medium
   * returns: confidence_score + reason
   *
   * @param knownConcepts 已掌握的概念列表
   * @returns 评估结果：{ ready: boolean, score: number, missing: Concept[] }
   */
  evaluateReadiness(knownConcepts: Concept[]): ReadinessResult { ... }
}
```

**Patterns to follow:**
- 继承 BaseNode，实现所有抽象方法
- 所有公共方法添加 @semantic 标签

**Test scenarios:**
- 类型检查：Concept 正确继承 BaseNode
- 类型检查：所有方法有正确的返回类型

**Verification:**
- `tsc --noEmit` 通过
- 每个类至少有 3 个 @semantic 标签标注的方法

---

- [ ] **Unit 4: 边关系**

**Goal:** 定义 Prerequisite 边关系结构

**Requirements:** R8

**Dependencies:** Unit 3

**Files:**
- Create: `src/edges.ts` - Prerequisite 边类

**Approach:**
- 定义 `Prerequisite` 类表示概念间的依赖关系
- 包含 from, to, strength (必需/推荐), notes
- 使用 @edge 标签标注边语义

**Technical design:**

```typescript
/**
 * 前置依赖关系
 *
 * @edge
 * from: Concept
 * to: Concept
 * type: prerequisite
 * cardinality: many
 * bidirectional: false
 */
class Prerequisite {
  from: Concept;
  to: Concept;
  strength: 'required' | 'recommended';
  notes?: string;
}
```

**Patterns to follow:**
- @edge 标签格式

**Test scenarios:**
- 类型检查：Prerequisite 类型正确

**Verification:**
- `tsc --noEmit` 通过
- Prerequisite 类有 @edge 标签

---

- [ ] **Unit 5: 示例数据**

**Goal:** 内嵌编程学习路径的示例节点数据

**Requirements:** R12, R13

**Dependencies:** Unit 3, Unit 4

**Files:**
- Create: `src/data.ts` - 示例数据定义

**Approach:**
- 创建至少 5 个 Concept：JavaScript, TypeScript, React, Node.js, CSS
- 创建 2 个 Topic：Frontend Development, Backend Development
- 创建 3 个 Source：MDN Docs, TypeScript Handbook, React Docs
- 创建 Prerequisite 关系：JS → TypeScript → React

**Patterns to follow:**
- TypeScript 内嵌数据，使用 const 定义

**Test scenarios:**
- 类型检查：所有数据类型正确
- 数据完整性：Concept 数量 ≥ 5, Topic ≥ 2, Source ≥ 3

**Verification:**
- `tsc --noEmit` 通过
- 数据覆盖典型的编程学习路径

---

- [ ] **Unit 6: 协议配置 (CLAUDE.md)**

**Goal:** 定义 Graph Reasoning Protocol，指导 Claude Code 进行图谱推理

**Requirements:** R14, R15, R16

**Dependencies:** Unit 1-5 完成

**Files:**
- Create: `CLAUDE.md` (项目根目录)

**Approach:**
- 定义 Discovery Phase：识别 Entry Node，读取可用 Actions 和 Links
- 定义 Traversal Phase：模拟调用 linkTo 和游走方法
- 定义 Constraint-Based Inference：调用 evaluateXXX 方法获取数据
- 定义 Output Format：`[Path]: Node(A) --(relation)--> Node(B) --(action)--> Result`

**Technical design:**

```markdown
## Graph Reasoning Protocol

### 1. Discovery Phase
- Identify Entry Node from user query
- Read src/nodes.ts to understand available Actions and Links

### 2. Traversal Phase
- Use linkTo() or getXXX() methods to traverse
- Multi-hop logic for complex queries

### 3. Constraint-Based Inference
- Call evaluateXXX() methods before decisions
- Use return data as ONLY source of truth

### 4. Output Format
- [Path]: Node(A) --(relation)--> Node(B) --(action)--> Result
```

**Patterns to follow:**
- think.md 提出的协议结构
- 清晰的指令格式，便于 LLM 理解

**Test scenarios:**
- Happy path: Claude Code 能正确识别协议并遵循
- Manual verification: 提问"学习 React 需要什么前置知识"，观察推理路径格式

**Verification:**
- CLAUDE.md 存在于项目根目录
- 协议包含 Discovery、Traversal、Constraint-Based Inference、Output Format 四个阶段

---

- [ ] **Unit 7: 导出和整合**

**Goal:** 完善 src/index.ts 导出，确保整体可用

**Requirements:** 无直接对应，是整合工作

**Dependencies:** Unit 1-6

**Files:**
- Modify: `src/index.ts` - 导出所有类和数据

**Approach:**
- 导出 BaseNode, Concept, Topic, Source, Prerequisite
- 导出示例数据
- 确保整体类型检查通过

**Test scenarios:**
- Happy path: import * from './src' 可用
- 类型检查: `tsc --noEmit` 全项目通过

**Verification:**
- TypeScript 编译无错误
- 所有类和数据可正确导出

## System-Wide Impact

- **Interaction graph:** 新项目，无现有交互
- **Error propagation:** 纯类型定义，无运行时错误
- **State lifecycle risks:** 静态数据，无状态变化
- **API surface parity:** 新 API，无历史兼容问题
- **Integration coverage:** 无跨层集成

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| LLM 不遵循协议 | JSDoc 清晰标注，协议格式简洁易懂 |
| @semantic 标签格式不被识别 | 使用标准 JSDoc 多行注释格式 |
| 示例数据不够丰富 | 至少 5 Concept，覆盖典型学习路径 |

## Documentation / Operational Notes

- CLAUDE.md 是协议配置的核心，需要定期更新以优化 LLM 行为
- 示例数据可作为测试用例验证推理路径

## Sources & References

- **Origin document:** docs/brainstorms/2026-04-22-neuro-symbolic-memory-dsl-requirements.md
- **Design reference:** docs/think.md (原始设计)
- **Evaluation reference:** docs/eval.md (设计评审)
- **External docs:** TypeScript JSDoc Reference, TypeScript 5.x Handbook