import { Concept, Topic, Source } from './nodes.js';
import { Prerequisite } from './edges.js';

// ============================================
// Concepts (概念节点)
// ============================================

/**
 * JavaScript 基础概念
 *
 * @semantic
 * position: foundational
 * difficulty: beginner
 */
export const jsConcept = new Concept(
  'concept_js',
  'JavaScript',
  'JavaScript 是一种动态类型的编程语言，主要用于 Web 开发，支持函数式和面向对象编程范式。',
  ['编程语言', '动态类型', 'Web开发', '前端'],
  'beginner',
  ['foundational', 'practical', 'web']
);

/**
 * TypeScript 概念
 *
 * @semantic
 * position: intermediate
 * difficulty: intermediate
 * prerequisite: JavaScript
 */
export const tsConcept = new Concept(
  'concept_ts',
  'TypeScript',
  'TypeScript 是 JavaScript 的超集，添加了静态类型系统和高级特性，提升代码可维护性和开发体验。',
  ['编程语言', '静态类型', '类型系统', 'JavaScript超集'],
  'intermediate',
  ['practical', 'typed', 'enterprise']
);

/**
 * React 概念
 *
 * @semantic
 * position: advanced
 * difficulty: intermediate
 * prerequisite: JavaScript, TypeScript
 */
export const reactConcept = new Concept(
  'concept_react',
  'React',
  'React 是一个用于构建用户界面的 JavaScript 库，采用组件化思想和虚拟 DOM 技术。',
  ['UI库', '组件化', '虚拟DOM', '前端框架'],
  'intermediate',
  ['practical', 'component-based', 'declarative']
);

/**
 * Node.js 概念
 *
 * @semantic
 * position: intermediate
 * difficulty: intermediate
 * prerequisite: JavaScript
 */
export const nodeConcept = new Concept(
  'concept_node',
  'Node.js',
  'Node.js 是一个基于 JavaScript 的运行时环境，用于构建服务器端应用程序。',
  ['运行时', '服务器端', 'JavaScript', '后端'],
  'intermediate',
  ['practical', 'server-side', 'backend']
);

/**
 * CSS 概念
 *
 * @semantic
 * position: foundational
 * difficulty: beginner
 */
export const cssConcept = new Concept(
  'concept_css',
  'CSS',
  'CSS (Cascading Style Sheets) 是用于描述 HTML 文档呈现样式的样式表语言。',
  ['样式', '布局', '前端', 'Web开发'],
  'beginner',
  ['foundational', 'practical', 'styling']
);

// ============================================
// Topics (主题节点)
// ============================================

/**
 * 前端开发主题
 *
 * @semantic
 * domain: frontend
 * concepts: JavaScript, TypeScript, React, CSS
 */
export const frontendTopic = new Topic(
  'topic_frontend',
  'Frontend Development',
  '前端开发涵盖用户界面的构建，包括 HTML、CSS、JavaScript 及现代前端框架。'
);

/**
 * 后端开发主题
 *
 * @semantic
 * domain: backend
 * concepts: JavaScript, Node.js, TypeScript
 */
export const backendTopic = new Topic(
  'topic_backend',
  'Backend Development',
  '后端开发涵盖服务器端应用程序的构建，包括 API 设计、数据库操作、服务器逻辑等。'
);

// ============================================
// Sources (学习来源节点)
// ============================================

/**
 * MDN Web Docs - JavaScript 学习来源
 *
 * @semantic
 * type: documentation
 * reliability: 5
 * official: true
 */
export const mdnSource = new Source(
  'source_mdn',
  'MDN Web Docs',
  'documentation',
  5,
  'https://developer.mozilla.org/'
);

/**
 * TypeScript Handbook - TypeScript 学习来源
 *
 * @semantic
 * type: documentation
 * reliability: 5
 * official: true
 */
export const tsHandbookSource = new Source(
  'source_ts_handbook',
  'TypeScript Handbook',
  'documentation',
  5,
  'https://www.typescriptlang.org/docs/handbook/'
);

/**
 * React Official Docs - React 学习来源
 *
 * @semantic
 * type: documentation
 * reliability: 5
 * official: true
 */
export const reactDocsSource = new Source(
  'source_react_docs',
  'React Official Documentation',
  'documentation',
  5,
  'https://react.dev/'
);

// ============================================
// Prerequisites (前置依赖关系)
// ============================================

/**
 * JavaScript → TypeScript (必须依赖)
 *
 * @edge
 * from: JavaScript
 * to: TypeScript
 * strength: required
 */
export const jsToTsPrereq = new Prerequisite(
  jsConcept,
  tsConcept,
  'required',
  'TypeScript 基于 JavaScript，必须先掌握 JS 基础语法和概念'
);

/**
 * TypeScript → React (推荐依赖)
 *
 * @edge
 * from: TypeScript
 * to: React
 * strength: recommended
 */
export const tsToReactPrereq = new Prerequisite(
  tsConcept,
  reactConcept,
  'recommended',
  'React 可用纯 JS 开发，但 TypeScript 能提供更好的类型安全和开发体验'
);

/**
 * JavaScript → React (必须依赖)
 *
 * @edge
 * from: JavaScript
 * to: React
 * strength: required
 */
export const jsToReactPrereq = new Prerequisite(
  jsConcept,
  reactConcept,
  'required',
  'React 基于 JavaScript，必须掌握 JS 基础'
);

/**
 * JavaScript → Node.js (必须依赖)
 *
 * @edge
 * from: JavaScript
 * to: Node.js
 * strength: required
 */
export const jsToNodePrereq = new Prerequisite(
  jsConcept,
  nodeConcept,
  'required',
  'Node.js 使用 JavaScript 语法，必须先掌握 JS'
);

/**
 * CSS → React (推荐依赖)
 *
 * @edge
 * from: CSS
 * to: React
 * strength: recommended
 */
export const cssToReactPrereq = new Prerequisite(
  cssConcept,
  reactConcept,
  'recommended',
  'React 组件需要样式，CSS 是基础'
);

// ============================================
// 关系绑定（将关系连接到节点）
// ============================================

// 设置 Concept 的前置依赖
tsConcept.setPrerequisites([jsConcept]);
reactConcept.setPrerequisites([jsConcept, tsConcept]);
nodeConcept.setPrerequisites([jsConcept]);

// 设置 Concept 所属的主题
jsConcept.setTopics([frontendTopic, backendTopic]);
tsConcept.setTopics([frontendTopic, backendTopic]);
reactConcept.setTopics([frontendTopic]);
nodeConcept.setTopics([backendTopic]);
cssConcept.setTopics([frontendTopic]);

// 设置 Topic 包含的概念
frontendTopic.setConcepts([jsConcept, tsConcept, reactConcept, cssConcept]);
backendTopic.setConcepts([jsConcept, tsConcept, nodeConcept]);

// 设置 Concept 的学习来源
jsConcept.setSources([mdnSource]);
tsConcept.setSources([tsHandbookSource]);
reactConcept.setSources([reactDocsSource]);

// 设置 Source 教授的概念
mdnSource.setConcepts([jsConcept, cssConcept]);
tsHandbookSource.setConcepts([tsConcept]);
reactDocsSource.setConcepts([reactConcept]);

// ============================================
// 数据集合导出
// ============================================

/**
 * 所有概念集合
 */
export const concepts: Concept[] = [jsConcept, tsConcept, reactConcept, nodeConcept, cssConcept];

/**
 * 所有主题集合
 */
export const topics: Topic[] = [frontendTopic, backendTopic];

/**
 * 所有学习来源集合
 */
export const sources: Source[] = [mdnSource, tsHandbookSource, reactDocsSource];

/**
 * 所有前置依赖关系集合
 */
export const prerequisites: Prerequisite[] = [
  jsToTsPrereq,
  tsToReactPrereq,
  jsToReactPrereq,
  jsToNodePrereq,
  cssToReactPrereq,
];

/**
 * 根据 ID 查找概念
 *
 * @semantic
 * operation: node_lookup
 * cost: low
 * returns: Concept | undefined
 *
 * @param id 概念 ID
 * @returns 匹配的概念，若不存在返回 undefined
 */
export function findConceptById(id: string): Concept | undefined {
  return concepts.find((c) => c.id === id);
}

/**
 * 根据名称查找概念
 *
 * @semantic
 * operation: node_lookup_by_name
 * cost: low
 * returns: Concept | undefined
 *
 * @param name 概念名称
 * @returns 匹配的概念，若不存在返回 undefined
 */
export function findConceptByName(name: string): Concept | undefined {
  return concepts.find((c) => c.name === name);
}

/**
 * 获取学习路径：从基础概念到目标概念的所有前置依赖链
 *
 * @semantic
 * operation: learning_path_traversal
 * cost: medium
 * returns: Concept[] (按学习顺序排列)
 * use_case: determine_learning_sequence
 *
 * @param targetConcept 目标概念
 * @returns 学习路径（包含所有前置概念，按依赖顺序排列）
 */
export function getLearningPath(targetConcept: Concept): Concept[] {
  const path: Concept[] = [];
  const visited = new Set<string>();

  function traverse(concept: Concept): void {
    if (visited.has(concept.id)) return;
    visited.add(concept.id);

    const prereqs = concept.getPrerequisites();
    for (const prereq of prereqs) {
      traverse(prereq);
    }

    path.push(concept);
  }

  traverse(targetConcept);
  return path;
}