---
date: 2026-06-14
topic: search-entities-tool-redesign
---

# 方案 A：search_entities 替代 discover_entities

## Problem Frame

当前 `discover_entities` 工具一次性返回所有 Cube 实体的全部字段定义，将大量无关 schema 信息灌入 LLM 上下文。这违反了"Agent 工具应按需返回信息"的设计原则——当用户问"商户交易趋势"时，LLM 被迫接收代理商层级、进件申请、通道等无关实体的字段定义，浪费有限的上下文窗口。

CLAUDE.md 已经设计了 `search_entities` 的接口描述，但 `tools.ts` 仍实现的是旧版 `discover_entities`。本需求将代码实现对齐到设计意图，并将原单一工具拆为职责更清晰的两个工具。

## Requirements

**工具拆分**

- R1. 将 `discover_entities` 拆为两个工具：`search_entities`（keyword 模糊搜索）和 `get_entity_schema`（entity_names 精确拉取字段详情）
- R2. `search_entities` 接受 `keyword` 参数，返回匹配实体的简要信息（name、title、description 摘要），不返回完整字段列表
- R3. `get_entity_schema` 接受 `entity_names` 数组参数，仅返回指定实体的完整 dimensions + measures 定义
- R4. 删除 `discover_entities` 工具及其导出

**CLAUDE.md 同步更新**

- R5. 更新 CLAUDE.md 中工具使用规范部分，反映拆分后的两个工具及其用法
- R6. 更新工作流示例，展示 `search_entities` → `get_entity_schema` → `execute_query` 的三步流程
- R7. 更新设计准则中关于工具层的描述

**Extra 注册**

- R8. 在 `extra.ts` 的 `createTools` 中注册 `search_entities` 和 `get_entity_schema`，替换 `discover_entities`

**向后兼容**

- R9. 删除 `DISCOVER_ENTITIES_TOOL` 常量导出，检查外部引用并清理

## Success Criteria

- 用户问"商户交易趋势"时，LLM 只需调用 `search_entities({ keyword: "交易" })` 即可获得相关实体列表，无需加载全部 schema
- LLM 确认目标实体后，调用 `get_entity_schema({ entity_names: ["order_daily"] })` 获取精确字段定义
- 两个工具的上下文占用总量显著低于原 `discover_entities` 的一次性全量返回
- CLAUDE.md 与代码实现一致，无过时描述

## Scope Boundaries

- 不改动 `execute_query` 工具（方案 B 的工作流封装不在本范围内）
- 不改动 `query.ts` 中的 `ExecuteQueryArgs` 类型和 `buildCubeQuery` 函数
- 不引入新的依赖
- 不改动测试文件结构（`tools.test.ts` 中的测试用例需更新以匹配新接口）

## Key Decisions

- **拆分而非合并**：将搜索与精确拉取拆为两个工具而非合并在一个工具中，因为两种模式的使用时机不同（探索 vs 确认），参数结构差异大，拆分后每个工具的参数更简单、LLM 构造错误率更低
- **保留 keyword 搜索**：`search_entities` 的 keyword 搜索覆盖实体名、标题、描述，给 LLM 一个低成本的实体发现入口

## Outstanding Questions

### Deferred to Planning

- [Affects R2][Technical] keyword 匹配算法的具体实现：是否需要模糊匹配（如拼音、前缀），还是简单的 includes 就够用？当前建议先用 includes，后续按需增强

## Next Steps

→ `/ce:plan` for structured implementation planning
