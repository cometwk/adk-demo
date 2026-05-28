---
date: 2026-02-22
topic: golang-adk-onboarding
---

# Golang ADK 入门（面向仓库上手）

## What We're Building
围绕 `adk-demo/golang` 目录设计一条"以小改动驱动理解"的上手路径，目标不是 Go 语法入门，而是快速建立该仓库 ADK Go 示例的运行与改造心智模型。

本次最小可交付结果（MVP）聚焦在"模型与配置链路"：能够修改模型、参数、Prompt 或配置加载方式，并理解这些改动如何从入口传递到 `llmagent.Config` 并影响运行行为。

## Why This Approach
候选方案有三类：读代码主导、改代码主导、抽象主导。最终选择"改代码主导（B）"，因为用户已有中高级 Go 基础，语法不是瓶颈，主要障碍是仓库上下文与 ADK 运行链路。

通过一项小而真实的改动（模型/配置变更）来驱动理解，能最短路径覆盖入口、环境变量、agent 配置、运行器行为和调试路径，同时避免过早扩展到不必要模块，符合 YAGNI。

## Key Decisions
- 以仓库 `golang/` 为主线，不在 `bi/` 里另起一套学习项目：现有可复用示例最完整，减少上下文切换成本。
- 路线采用"先跑通，再小改，再验证"：优先获得可执行反馈，而不是先写大量总结。
- 学习对象优先级定为 `cmd/hello` 与 `cmd/learn/v2`：二者都直接使用 `env.MustModel()` 与 `llmagent.New(...)`，覆盖核心链路。
- 首个改动主题固定为"模型配置链路"：`OPENAI_API_BASE`、`OPENAI_API_KEY`、`OPENAI_MODEL` -> `env.MustModel()` -> `llmagent.Config.Model`。
- 验收标准聚焦能力而非代码量：能解释配置流向、能安全改一处并验证行为变化、能定位常见失败点。

## Resolved Questions
- 学习目标：为看懂/修改本仓库 Go（ADK）示例，而非泛 Go 入门。
- 当前水平：中高级 Go，具备并发与工程化经验。
- 偏好方式：选择 B（改代码主导，边改边学）。
- 本次 MVP：优先掌握"模型/参数/Prompt/配置加载"的修改能力。
- 首个练手改动切入层：选择 `env.MustModel()` 封装层，优先增强配置加载逻辑与可观测性。
- 学习节奏：1 次短冲刺（30-60 分钟），本轮即完成跑通 + 一次改动验证。

## Open Questions
- 无。

## Next Steps
→ 进入 `/workflows:plan`，把本 brainstorm 转成可执行步骤（包含具体改动点、验证步骤、回滚与排错清单）。

## Sprint Notes (Execution)

### Sprint 1（mustOpenAIConfig 重构）
- 改动层：`golang/lib/pkg/env/model.go`，新增 `mustOpenAIConfig(includeModel bool)`，统一校验环境变量。
- 改动目标：提升错误可读性，缺配置时一次性报告缺失 key 列表。
- 影响入口：所有使用 `env.MustModel()` / `env.MustModelWith()` 的入口。

### Sprint 2（flag 覆盖 + 测试）
- 新增 `env.MustModelWithFlag(flagModel string)`：优先使用 flag 值，为空时回退 `OPENAI_MODEL`。
- 修改 `cmd/learn/v2/main.go`：增加 `-model` flag，可通过 `go run ./cmd/learn/v2 -model gpt-4o-mini` 切换模型。
- 清理：移除未使用的包级变量 `MODEL`，删除不相关的 `cmd/learn/v2/Makefile`。
- 新增 `lib/pkg/env/model_test.go`：3 个测试用例（全缺、部分缺、不要求 model），全部通过。
- 环境：Go 1.26.0，编译与 `go vet` 全部通过。

### Sprint 3（外部 System Prompt 注入）
- 修改 `cmd/learn/v2/main.go`：增加 `-prompt` flag，支持从外部文件加载 system prompt。
- 引入占位符：支持 `{{.WORKDIR}}` 自动替换为当前工作目录。
- 交付产物：`cmd/learn/v2/system.md` 作为默认 prompt 模板。
- 效果：无需重新编译即可快速迭代 Prompt。

## Next Learning Cuts
- 让 `getSystemPrompt()` 支持外部文件注入，便于 Prompt 快速迭代。
- ~~增加 `flag` 覆盖模型名~~ ✅ Sprint 2 已完成。
- ~~为 `env` 包补一个最小测试用例~~ ✅ Sprint 2 已完成。
