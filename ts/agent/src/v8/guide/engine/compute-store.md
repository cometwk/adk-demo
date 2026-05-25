# ComputeStore 使用手册

ComputeStore 是 V8 OLAP 聚合数据的存储抽象层，提供列式聚合查询能力（sum/avg/count/min/max）。

## 接口定义

```typescript
interface ComputeStore {
  // 聚合查询
  aggregate(query: ComputeQuery): Promise<ComputeQueryResult>

  // 数据源元数据
  getSources(): Promise<ComputeSource[]>
  getSourceSchema(source: string): Promise<SourceSchema>
}
```

## 核心方法

### aggregate

执行 OLAP 聚合查询。

```typescript
const result = await store.aggregate({
  source: 'OrderDaily',
  filters: [{ field: 'region', op: 'eq', value: '华东' }],
  metrics: [
    { field: 'amount', fn: 'sum', as: 'totalAmount' },
    { field: '*', fn: 'count', as: 'orderCount' }
  ],
  groupBy: ['productId'],
  orderBy: [{ field: 'totalAmount', direction: 'desc' }],
  limit: 10
})
```

### getSources

获取可用的数据源列表。

```typescript
const sources = await store.getSources()
// [{ name: 'OrderDaily', description: '订单日报表', rowCount: 100000 }]
```

### getSourceSchema

获取数据源的 Schema（字段定义）。

```typescript
const schema = await store.getSourceSchema('OrderDaily')
// { fields: [{ name: 'amount', type: 'number', aggregatable: true }, ...] }
```

## ComputeQuery DSL

```typescript
type ComputeQuery = {
  source: string                      // 数据源名称
  filters?: ComputeFilter[]           // 行过滤
  metrics: AggregateMetric[]          // 聚合指标
  groupBy?: string[]                  // 分组维度
  orderBy?: OrderSpec[]               // 排序
  limit?: number                      // 上限
  offset?: number                     // 偏移
}
```

### ComputeFilter

行级过滤条件。

```typescript
type ComputeFilter = {
  field: string
  op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'between'
  value: unknown | unknown[]  // op='in'/'between' 时为数组
}
```

示例：
```typescript
{ field: 'region', op: 'eq', value: '华东' }
{ field: 'amount', op: 'between', value: [100, 500] }
{ field: 'status', op: 'in', value: ['paid', 'shipped'] }
```

### AggregateMetric

聚合指标定义。

```typescript
type AggregateMetric = {
  field: string    // '*' 表示 count
  fn: 'count' | 'sum' | 'avg' | 'min' | 'max'
  as?: string      // 输出别名
}
```

示例：
```typescript
{ field: 'amount', fn: 'sum', as: 'totalAmount' }
{ field: '*', fn: 'count', as: 'cnt' }
{ field: 'price', fn: 'avg', as: 'avgPrice' }
```

### OrderSpec

排序规则。

```typescript
type OrderSpec = {
  field: string
  direction: 'asc' | 'desc'
}
```

## 返回数据类型

### ComputeQueryResult

```typescript
type ComputeQueryResult = {
  rows: ComputeRow[]
  total: number
  truncated: boolean
  executionTimeMs: number
}
```

### ComputeRow

```typescript
type ComputeRow = {
  group?: Record<string, unknown>   // groupBy 值
  [metricAlias: string]: unknown    // 聚合结果
}
```

示例：
```typescript
{
  group: { productId: 'P001' },
  totalAmount: 15000,
  orderCount: 25
}
```

## 数据源元数据类型

### ComputeSource

```typescript
type ComputeSource = {
  name: string
  description?: string
  rowCount?: number
}
```

### SourceSchema

```typescript
type SourceSchema = {
  fields: FieldSchema[]
}
```

### FieldSchema

```typescript
type FieldSchema = {
  name: string
  type: 'number' | 'string' | 'date' | 'boolean'
  aggregatable: boolean  // 是否可用于聚合
}
```

## 使用示例

### 简单计数

```typescript
await store.aggregate({
  source: 'OrderDaily',
  metrics: [{ field: '*', fn: 'count', as: 'total' }]
})
// { rows: [{ total: 100000 }], ... }
```

### 按维度分组聚合

```typescript
await store.aggregate({
  source: 'OrderDaily',
  metrics: [
    { field: 'amount', fn: 'sum', as: 'totalAmount' },
    { field: '*', fn: 'count', as: 'count' }
  ],
  groupBy: ['region', 'productId'],
  orderBy: [{ field: 'totalAmount', direction: 'desc' }],
  limit: 20
})
```

### 条件过滤聚合

```typescript
await store.aggregate({
  source: 'OrderDaily',
  filters: [
    { field: 'region', op: 'in', value: ['华东', '华南'] },
    { field: 'amount', op: 'gte', value: 100 }
  ],
  metrics: [
    { field: 'amount', fn: 'avg', as: 'avgAmount' },
    { field: 'amount', fn: 'max', as: 'maxAmount' }
  ],
  groupBy: ['region']
})
```

## 设计要点

- **与 GraphStore 分工**：ComputeStore 处理 OLAP 列式聚合，GraphStore 处理图遍历
- **聚合函数**：支持 count、sum、avg、min、max 五种
- **分组聚合**：`groupBy` 按维度分组，每组返回聚合结果
- **分页**：`limit` / `offset` 控制返回行数，防止大结果集撑爆 context

## 相关文件

- 接口定义：`src/v8/engine/stores/compute-store.ts`
- 查询 DSL：`src/v8/engine/query/compute-query.ts`