# Query optimization for large AgentRel data
_Exported on 2026/5/27 at GMT+8 16:27:38 from Cursor (3.5.33)_

---

see: https://chatgpt.com/g/g-p-69f85781cd4c8191a95249159ea1cb89-ben-ti/c/6a16ac60-7f30-83ec-a7b4-d117d1ba9dcd



**User**

@src/v8/provider/rest-query/react-query-store.ts:267-388 

若类似 
 @src/v8/demo/case/rest/tests/tools.test.ts:30-52 

若 AgentRel 数据量巨大，这个查询需要很多次请求。。。


请给出可选的优化方案

---

**Cursor**

让我先完整了解相关代码的上下文。

现在我完整理解了问题。让我分析一下请求量的瓶颈点。

## 性能分析

以你的测试用例为例：

```
MATCH AgentRel (where apply=1, agent_type=MERCH)  →  假设匹配到 N=500 条
TRAVERSE for_agent (out)                           →  N 次 getNeighbors，每次内部 1~2 次 HTTP
TRAVERSE for_merch (out)                           →  N 次 getNeighbors，每次内部 1~2 次 HTTP
RETURN (limit 200)                                 →  最多 200 次 getNode（逐个拿属性）
```

**最坏情况：1 + 500×2 + 500×2 + 200 ≈ 2200+ 次 HTTP 请求**，全部是串行 `for...of` + `await`，完全没有并行和批量。

瓶颈主要在三处：

| 阶段 | 瓶颈 | 根因 |
|------|------|------|
| TRAVERSE | 逐节点 `getNeighbors` | N+1 串行请求 |
| TRAVERSE 内部 | `getNeighbors` 先 `getNode` 拿源节点 | 重复获取已知节点 |
| RETURN | 逐节点 `getNode` | N+1 串行请求，且 `fetchManyImpl` 已存在但未被利用 |

---

## 可选优化方案（从轻到重排列）

### 方案 A：并发化 + 批量 getNode（改动最小，收益明显）

**核心思路**：不改数据流，只优化执行方式。

```typescript
// TRAVERSE: 并发化 getNeighbors（带并发控制）
const CONCURRENCY = 10
const fromIds = Array.from(fromSet)
const chunks = chunkArray(fromIds, CONCURRENCY)
for (const chunk of chunks) {
  await Promise.all(chunk.map(async (fromId) => {
    const neighbors = await this.getNeighbors(fromId, { ... })
    // ... 更新 survivors / targets
  }))
}

// RETURN: 用已有的 fetchManyImpl 批量获取
const nodeIds = Array.from(nodeSet).slice(offset, offset + limit)
const parsed = nodeIds.map(id => parseGlobalId(id)!)
const byType = groupBy(parsed, p => p.type)
const allNodes = new Map<string, NodeData>()
for (const [type, items] of byType) {
  const nodes = await this.fetchManyImpl(type, items.map(i => i.rawId))
  for (const n of nodes) allNodes.set(n.id, n)
}
```

**请求量**：TRAVERSE 从 N 次串行 → N/10 轮并发；RETURN 从 200 次 → 按 type 分组的 1~3 次批量请求。
**估算**：2200 → ~120 次，且大部分并发。

---

### 方案 B：Binding 级批量查询（中等改动，收益大）

**核心思路**：在 binding 层新增 `batchNeighbors`，一次 REST 调用用 `where.id.in` 批量查关联。

```typescript
// GraphStore 接口扩展
interface GraphStore {
  // 新增批量版本
  getNeighborsBatch?(
    nodeIds: string[],
    opts: GetNeighborsOpts
  ): Promise<Map<string, Paginated<NeighborData>>>
}

// RestQueryGraphStore 实现
async getNeighborsBatch(nodeIds: string[], opts: GetNeighborsOpts) {
  // 解析所有源节点，提取 rawId
  // 用 where.source_id.in=id1,id2,id3 一次性查回所有关联
  // 按源节点分组返回
}
```

对 TRAVERSE 阶段改造：

```typescript
// 一次批量调用替代 N 次逐个调用
const neighborsMap = await this.getNeighborsBatch(
  Array.from(fromSet),
  { relation: step.relation, direction: step.direction ?? 'out', ... }
)
for (const [fromId, neighbors] of neighborsMap) {
  // ... 填充 survivors / targets
}
```

**请求量**：每个 TRAVERSE 步骤从 N 次 → 1 次（或按 batch size 分页的几次）。
**估算**：2200 → ~5 次。

---

### 方案 C：RETURN 阶段提前投影 + 延迟加载（小改动，避免冗余请求）

**核心思路**：TRAVERSE 阶段的 `getNeighbors` 已经通过 binding 拿到了目标节点数据，但现在丢掉了，RETURN 又重新逐个 `getNode`。可以在 TRAVERSE 阶段就缓存节点数据。

```typescript
// TRAVERSE 阶段：缓存遍历过程中已拿到的节点数据
const nodeDataCache = new Map<string, NodeData>()

// 在 matchPage 的结果就缓存
for (const node of matchPage.items) {
  nodeDataCache.set(node.id, node)
}

// 在 getNeighbors 返回后，如果 binding 已经带回 properties，也缓存
// （需要让 getNeighbors 调用时传 fields 参数）

// RETURN 阶段：优先从缓存取，批量 fetch 缺失的
for (const nodeId of nodeSet) {
  const node = nodeDataCache.get(nodeId) ?? await this.getNode(nodeId)
  // ...
}
```

**请求量**：RETURN 阶段从 200 次 → 0 次（大部分命中缓存）。
这个方案可以和 A/B 组合使用。

---

### 方案 D：服务端 Compound Query（改动大，彻底解决）

**核心思路**：如果 REST 后端支持（或可以扩展），把整个 `GraphTraversalQuery` 下推到服务端执行。

```typescript
async query(query: GraphTraversalQuery, policy: PolicyContext) {
  // 检查是否可以下推
  if (this.canPushDown(query)) {
    // 将 graph_query 翻译为后端 compound API
    const params = this.translateToCompoundQuery(query)
    const result = await apiSearch('/compound-query', params)
    return toolOk(result)
  }
  // fallback: 现有客户端遍历逻辑
  return this.clientSideQuery(query, policy)
}
```

**请求量**：1 次。
**代价**：需要后端配合，且 policy 过滤逻辑需要在服务端实现或在客户端后置。

---

## 推荐组合

| 阶段 | 推荐 | 预期收益 |
|------|------|---------|
| 立即可做 | **A + C**：并发化 + 批量 fetch + 缓存 | 2200 → ~50-120 次，大部分并发 |
| 短期优化 | **B**：binding 层批量查询 | 2200 → ~5 次 |
| 长期方案 | **D**：服务端下推 | 1 次 |

如果你想，我可以直接实现 **方案 A + C** 的代码改造——这是投入产出比最高的方案，不需要改接口定义，只改 `query` 方法内部实现。要继续吗？

