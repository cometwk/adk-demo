
TODO:

@src/v8/provider/rest-query/react-query-store.ts:267-388 

```ts
  // ── GraphTraversalQuery Execution ──
  async query(query: GraphTraversalQuery, policy: PolicyContext = OPEN_POLICY): Promise<ToolResult<GraphQueryResult>> {
  }
```

场景的话


```ts
  it('graph', async () => {
    const fn = tools.graph_query.execute!
    const r = await fn(
      {
        match: {
          type: 'AgentRel',
          where: [
            { property: 'apply', op: 'eq', value: 1 },
            { property: 'agent_type', op: 'eq', value: 'MERCH' },
          ],
        },
        traverse: [
          { relation: 'for_agent', direction: 'out', alias: 'agent' },
          { relation: 'for_merch', direction: 'out', alias: 'merch' },
        ],
        return: { fields: ['agent_no', 'obj_no', 'obj_name'], limit: 200 },
      },
      { toolCallId: 'graph_query', messages: [] }
    )
    console.log('graph_query result =================================')
    console.log(JSON.stringify(r, null, 2))
  })
```


若 AgentRel 数据量巨大，这个查询需要很多次请求。。。

请给出可选的优化方案


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
