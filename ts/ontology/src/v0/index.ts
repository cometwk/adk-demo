/**
 * Neuro-Symbolic Memory DSL
 *
 * 一个 TypeScript 实现的知识图谱 DSL，
 * 用于 LLM-guided graph traversal（LLM 引导的图谱遍历）。
 *
 * 核心概念：
 * - BaseNode: 所有节点的抽象基类，提供游走和感知协议
 * - Concept: 知识单元节点，包含定义、关键词、难度等
 * - Topic: 主题分组节点，用于组织概念
 * - Source: 学习来源节点，支持知识溯源
 * - Prerequisite: 前置依赖边，定义学习顺序
 *
 * 使用方式：
 * 1. 通过 findConceptByName() 或 findConceptById() 查找概念
 * 2. 使用 getPrerequisites()、getTopics()、getSources() 进行图谱遍历
 * 3. 使用 evaluateReadiness() 评估知识准备度
 * 4. 使用 getLearningPath() 获取完整学习路径
 *
 * 详细协议请参考 CLAUDE.md 中的 Graph Reasoning Protocol。
 */

// 核心抽象
export { BaseNode } from './base.js';

// 节点类
export { Concept, Topic, Source, ReadinessResult } from './nodes.js';

// 边关系
export { Prerequisite } from './edges.js';

// 示例数据
export {
  concepts,
  topics,
  sources,
  prerequisites,
  jsConcept,
  tsConcept,
  reactConcept,
  nodeConcept,
  cssConcept,
  frontendTopic,
  backendTopic,
  mdnSource,
  tsHandbookSource,
  reactDocsSource,
} from './data.js';

// 辅助函数
export { findConceptById, findConceptByName, getLearningPath } from './data.js';