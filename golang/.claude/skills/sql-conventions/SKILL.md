---
name: sql-conventions
description: 强制本仓库的 MySQL SQL 规范。用于生成或审查 SQL 语句、迁移或查询片段，确保严格遵循 @/openspec/specs/conventions/spec.md（时间/日期规则、UTC 使用、Upsert 语法约束）。
scope:
  - sql-generation
  - sql-review
intent: enforce-conventions
---

# SQL 规范

## 概述
生成或审查 SQL 时严格遵循本仓库的 MySQL 规范。

## 必读参考
在编写或修改任何 SQL 之前先阅读 `@/openspec/specs/conventions/spec.md`。

## 工作流程
1. 识别需要生成或修改的每条 SQL。
2. 严格应用参考规范中的约定。
3. 返回前用下方清单校验最终 SQL。

## 校验清单（必须通过）
- 时间点字段使用 `DATETIME`，禁止使用 `TIMESTAMP`。
- 将 `DATETIME` 视为 UTC；应用层与 session 预期也使用 UTC。
- `DATE` 仅用于业务日期，映射为 `YYYY-MM-DD` 字符串。
- 允许按需使用 `NOW()` / `CURRENT_TIMESTAMP`。
- `INSERT ... SELECT ... ON DUPLICATE KEY UPDATE` 中避免 `JOIN ... ON`（含 `CROSS JOIN`）紧邻 `ON DUPLICATE KEY UPDATE`；优先用逗号笛卡尔积或把 `SELECT` 包一层子查询以隔离 `ON DUPLICATE`。

## 输出规则
- 输出的 SQL 必须已符合清单。
- 如需求与规则冲突，说明冲突并给出合规替代方案。

