---
date: 2026-05-24
topic: v8-in-memory-provider-refactor
---

# V8 In-Memory Provider 重构

## Problem Frame

`src/v8/engine/` 目录下的 in-memory 实现文件应该归类到 `src/v8/provider/` 目录，与已有的 `rest-query` provider 保持一致的目录结构。

## Requirements

**实现文件移动**
- R1. 移动 `src/v8/engine/in-memory-graph.ts` 到 `src/v8/provider/in-memory/in-memory-graph.ts`
- R2. 移动 `src/v8/engine/in-memory-compute.ts` 到 `src/v8/provider/in-memory/in-memory-compute.ts`
- R3. 移动 `src/v8/engine/in-memory-vector.ts` 到 `src/v8/provider/in-memory/in-memory-vector.ts`
- R4. 创建 `src/v8/provider/in-memory/index.ts` 导出模块

**测试文件重构**
- R5. 移动 `src/v8/engine/tests/graph-store.test.ts` 到 `src/v8/provider/in-memory/tests/graph-store.test.ts`
- R6. 移动 `src/v8/engine/tests/compute-store.test.ts` 到 `src/v8/provider/in-memory/tests/compute-store.test.ts`
- R7. 移动 `src/v8/engine/tests/vector-store.test.ts` 到 `src/v8/provider/in-memory/tests/vector-store.test.ts`
- R8. 移动 `src/v8/engine/tests/fixtures/` 到 `src/v8/provider/in-memory/tests/fixtures/`

**Import 路径更新**
- R9. 更新所有 import 路径引用新位置
- R10. 更新 engine/tests 中剩余测试的 import 路径

## Success Criteria
- 编译无错误
- 所有现有测试通过
- import 路径正确指向新位置

## Scope Boundaries
- 不修改实现代码内容
- 不添加新功能

## Key Decisions
- **目录结构**: 与 `rest-query` provider 保持一致的 `provider/<type>/` 模式

## Next Steps
→ /ce:plan