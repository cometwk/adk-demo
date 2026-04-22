# Neuro-Symbolic Memory DSL

这是一个 TypeScript 实现的知识图谱 DSL，用于 LLM-guided graph traversal。

## 🧠 Graph Reasoning Protocol (核心协议)

当用户提出需要推理的问题时，遵循以下协议进行图谱游走。

### 1. Discovery Phase (发现阶段)

**目标：识别入口节点，了解可用的动作和关系**

1. **识别入口节点**
   - 从用户问题中提取关键概念名称（如 "React", "TypeScript", "JavaScript"）
   - 使用 `findConceptByName(name)` 或 `findConceptById(id)` 查找节点
   - 如果节点不存在，明确告知用户

2. **了解可用动作**
   - 读取 `src/nodes.ts` 了解节点的可用方法
   - 关注带有 `@semantic` 标签的方法，这些是语义化的游走/推理方法
   - 关键方法：
     - `getPrerequisites()` - 获取前置概念
     - `getTopics()` - 获取所属主题
     - `getSources()` - 获取学习来源
     - `evaluateReadiness()` - 评估知识准备度

3. **了解关系类型**
   - 查看 `@semantic` 标签中的 `relation` 字段
   - 主要关系类型：
     - `prerequisite` - 前置依赖（学习顺序）
     - `belongs_to_topic` - 所属主题
     - `has_source` - 学习来源

### 2. Traversal Phase (游走阶段)

**目标：通过语义化方法进行图谱遍历，不猜测关系**

1. **调用方法进行游走**
   - 使用节点的 `getXXX()` 方法获取关联节点
   - 不要猜测关系，必须调用定义的方法

2. **多跳逻辑**
   - 对于复杂问题，需要进行多跳遍历
   - 例如："学习 React 需要什么前置知识？"
     - 路径：`React.getPrerequisites()` → `[jsConcept, tsConcept]`
     - 继续遍历：`tsConcept.getPrerequisites()` → `[jsConcept]`
     - 最终结果：学习路径 = [JavaScript → TypeScript → React]

3. **使用辅助函数**
   - `getLearningPath(targetConcept)` - 获取完整学习路径
   - `findConceptById(id)` - 根据 ID 查找概念
   - `findConceptByName(name)` - 根据名称查找概念

### 3. Constraint-Based Inference (约束推理阶段)

**目标：调用推理方法获取数据，作为决策的唯一依据**

1. **必须调用推理方法**
   - 在做出判断之前，必须调用节点的 `evaluateXXX()` 或 `hasXXX()` 方法
   - 例如：评估是否能学习 React
     - 调用 `reactConcept.evaluateReadiness(knownConcepts)`
     - 使用返回的 `{ ready, score, missing, reason }` 作为判断依据

2. **不猜测推理结果**
   - 推理结果必须来自方法的返回值
   - 不要根据直觉判断，必须依赖方法返回的数据

3. **特质判断**
   - 使用 `hasTrait(trait)` 判断节点特质
   - 支持的特质：
     - Concept: `foundational`, `advanced`, `practical`, `typed`, `component-based`
     - Source: `official`, `reliable`, `beginner_friendly`

### 4. Output Format (输出格式)

**目标：以可追踪的路径格式输出推理结果**

推理结果必须包含路径追踪：

```
[Path]: Node(A) --(relation)--> Node(B) --(relation)--> Node(C) --(action)--> Result
```

**示例输出：**

```
[Path]: Concept(React) --(prerequisite)--> Concept(TypeScript) --(prerequisite)--> Concept(JavaScript) --(action:evaluateReadiness)--> Result: ready=false, score=60, missing=[JavaScript]
```

**输出结构：**
- 每一步用 `--(relation/action)-->` 连接
- 关系类型标注在括号内
- 最终结果标注 `Result:` 后的内容

---

## 📚 可用数据

示例数据包含编程学习路径：

### Concepts (概念)
- `JavaScript` (concept_js) - 基础前端语言
- `TypeScript` (concept_ts) - JS 的类型化超集
- `React` (concept_react) - UI 组件库
- `Node.js` (concept_node) - 服务器运行时
- `CSS` (concept_css) - 样式语言

### Topics (主题)
- `Frontend Development` - 前端开发
- `Backend Development` - 后端开发

### Sources (来源)
- `MDN Web Docs` - JS/CSS 官方文档
- `TypeScript Handbook` - TS 官方手册
- `React Official Documentation` - React 官方文档

### Prerequisites (前置依赖)
- JavaScript → TypeScript (必须)
- TypeScript → React (推荐)
- JavaScript → React (必须)
- JavaScript → Node.js (必须)
- CSS → React (推荐)

---

## 🔧 使用示例

### 示例 1：查询学习路径

**用户问题：** "学习 React 需要什么前置知识？"

**推理过程：**
1. Discovery: 找到 `reactConcept` (id: concept_react)
2. Traversal: 调用 `reactConcept.getPrerequisites()` → `[jsConcept, tsConcept]`
3. 继续遍历: `tsConcept.getPrerequisites()` → `[jsConcept]`
4. 使用辅助函数: `getLearningPath(reactConcept)` → `[jsConcept, tsConcept, reactConcept]`

**输出：**
```
[Path]: Concept(React) --(prerequisite)--> Concept(JavaScript, TypeScript) --(prerequisite:TypeScript)--> Concept(JavaScript)

学习 React 的路径：
1. JavaScript (基础，必须掌握)
2. TypeScript (推荐掌握，能提升开发体验)
3. React (目标概念)
```

### 示例 2：评估知识准备度

**用户问题：** "我已经掌握了 JavaScript，可以学习 React 吗？"

**推理过程：**
1. Discovery: 找到 `reactConcept` 和 `jsConcept`
2. 构造已知概念列表: `knownConcepts = [jsConcept]`
3. Constraint-Based: 调用 `reactConcept.evaluateReadiness([jsConcept])`
4. 获取结果: `{ ready: false, score: 80, missing: [], reason: "..." }`
   - 注：React 的前置只有 JavaScript（必须），TypeScript 是推荐而非必须

**输出：**
```
[Path]: Concept(React) --(action:evaluateReadiness)--> {known: [JavaScript]} --> Result

评估结果：
- ready: true (JavaScript 已覆盖必须的前置)
- score: 80
- reason: 所有前置知识已具备，可以学习 React
- 推荐：先学习 TypeScript 能获得更好的开发体验
```

---

## 🎯 协议核心原则

1. **不猜测关系** - 必须调用定义的方法进行游走
2. **不猜测推理** - 必须调用推理方法获取判断依据
3. **路径可追踪** - 输出必须包含完整的推理路径
4. **数据为依据** - 使用方法返回的数据作为唯一判断来源