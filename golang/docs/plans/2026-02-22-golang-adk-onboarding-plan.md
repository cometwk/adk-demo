---
date: 2026-02-22
topic: golang-adk-onboarding
brainstorm: ../brainstorms/2026-02-22-golang-adk-onboarding-brainstorm.md
---

# 执行计划：Golang ADK 入门（模型与配置链路）

## 总览

基于 brainstorm 决议，以"改代码主导"的方式，在一次 30–60 分钟冲刺中完成以下目标：

1. **跑通**现有示例（验证运行路径）
2. **一次小改动**（`flag` 覆盖模型名）
3. **一次验证**（测试缺 key 报错行为）

完成标准：能解释 `OPENAI_*` → `env.MustModel()` → `llmagent.Config.Model` 全链路，能安全修改配置并观测行为变化。

---

## 前置条件

| 项目 | 当前状态 | 所需动作 |
|------|----------|----------|
| Go 版本 | 本机 1.24.2，仓库要求 ≥1.24.9 | 升级 Go 或允许自动下载 toolchain |
| `.env` 文件 | 存在（gitignored） | 确认含 `OPENAI_API_BASE`、`OPENAI_API_KEY`、`OPENAI_MODEL` |
| 网络 | 需访问 OpenAI-compatible API | 确认 `OPENAI_API_BASE` 对应服务可达 |

**阻塞判定**：若 Go 版本无法升级，所有"成功路径"验证将被阻断；但"失败路径"测试与代码改动仍可推进。

---

## 步骤

### Phase 0：环境就绪（5 min）

- [x] **0.1** 确认或升级 Go 版本至 ≥1.24.9
- [x] **0.2** 验证 `.env` 配置完整
- [x] **0.3** 编译检查（不运行）

### Phase 1：跑通 cmd/hello（10 min）

- [x] **1.1** 运行 `cmd/hello`，进入 console 模式
- [x] **1.2** 发送一条消息（如 "北京天气"），观察：
  - agent 是否调用 `WeatherTool`
  - 模型返回是否正常
  - 终端日志中 `.env` 加载路径是否正确
- [x] **1.3** 退出后，记录成功/失败及关键日志。

### Phase 2：跑通 cmd/learn/v2（10 min）

- [x] **2.1** 运行 `cmd/learn/v2`
- [x] **2.2** 测试基本对话（如 "列出当前目录文件"），观察：
  - bash 工具是否被调用
  - reminder 注入是否出现
  - TodoWrite 工具是否可用
- [x] **2.3** 退出后，记录成功/失败。

### Phase 3：增加 flag 覆盖模型名（15 min）

- [x] **3.1** 修改 `lib/pkg/env/model.go`，新增 `MustModelWithFlag()` 函数
- [x] **3.2** 修改 `cmd/learn/v2/main.go`，在 `main()` 中增加 flag 解析
- [x] **3.3** 验证行为：`go run ./cmd/learn/v2 -model gpt-4o-mini`

### Phase 4：为 env 包补测试用例（10 min）

- [x] **4.1** 在 `lib/pkg/env/model_test.go` 中新增测试 `TestMustOpenAIConfig_MissingKeys`
- [x] **4.2** 运行测试并确认通过

### Phase 5：收尾与清理（5 min）

- [x] **5.1** 删除或标记 `cmd/learn/v2/Makefile`
- [x] **5.2** 更新 brainstorm 文档的 Sprint Notes
- [x] **5.3** `go vet ./...` 确认无静态分析问题

---

## Sprint 3（Next Cut - 已完成）

- [x] **3.4** 让 `getSystemPrompt()` 支持外部文件注入
- [x] **3.5** 提供 `cmd/learn/v2/system.md` 模板
- [x] **3.6** 支持 `{{.WORKDIR}}` 占位符替换
