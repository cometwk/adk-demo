---
name: py-to-go
description: 将 Python CLI/Agent 示例翻译为 Go ADK 版，输出与 cmd/hello/main.go 一致的结构与风格。
---

# Python 转 Go（ADK）翻译 Skill

## 目标
把类似 `cmd/learn/v0/1.py` 的 Python 脚本，按照 `cmd/hello/main.go` 的风格翻译成 Go 代码，并在**同目录**下生成 Go 文件（默认 `main.go`）。

## 适用范围
- Python 脚本中包含：模型初始化、工具定义、对话/代理逻辑、CLI 入口。
- 期望落地为 ADK（`llmagent` + `launcher`）结构的 Go 程序。

## 输入
- 一个 Python 脚本路径，例如 `cmd/learn/v0/1.py`。

## 输出
- 同目录下的 Go 入口文件（`main.go`），结构与 `cmd/hello/main.go` 一致。

## 翻译步骤
1. **读取源文件**
   - 用 `ReadFile` 读 Python 代码，识别以下内容：
     - 模型/客户端初始化（如 `Anthropic(...)`）
     - 工具定义（如 `TOOL = [...]`）
     - 业务函数（如 `chat(...)`）
     - CLI 入口（`if __name__ == "__main__": ...`）

2. **建立 Go 结构骨架**
   - 按 `cmd/hello/main.go` 的结构创建文件：
     - `package main`
     - `import` 中包含 `context`, `log`, `os`，以及 ADK 相关包
     - `Input` / `Output` 结构体
     - 工具函数（使用 `functiontool.New`）
     - `llmagent.New` + `launcher` 执行

3. **工具映射**
   - Python 中的工具定义转成 Go 的 `functiontool`：
     - 工具名、描述映射到 `functiontool.Config`
     - Python 中执行 shell 的逻辑 → Go 中用 `exec.Command` 实现
   - 输入参数用 `Input` 结构体表达，并设置 `json` 与 `jsonschema` 标签。

4. **模型配置映射**
   - Python 中的模型初始化替换为 `env.MustModel()`。
   - 确保 `llmagent.Config` 中包含 `Name`、`Model`、`Description`、`Instruction`、`Tools`。

5. **CLI 入口对齐**
   - 用 `launcher` 处理命令行参数，调用 `Execute`。
   - 统一错误处理风格（`log.Fatalf`）。

6. **生成文件**
   - 写入同目录 `main.go`（若已存在则更新），确保可编译。

## 输出模板（结构对齐）
```go
package main

import (
	"adk-demo/lib/pkg/env"
	"context"
	"log"
	"os"

	"google.golang.org/adk/agent"
	"google.golang.org/adk/agent/llmagent"
	"google.golang.org/adk/cmd/launcher"
	"google.golang.org/adk/cmd/launcher/full"
	"google.golang.org/adk/tool"
	"google.golang.org/adk/tool/functiontool"
)

type Input struct {
	Command string `json:"command" jsonschema:"shell command"`
}

type Output struct {
	Result string `json:"result" jsonschema:"command output"`
}

func RunCommand(ctx tool.Context, input Input) (Output, error) {
	// ...
}

func main() {
	ctx := context.Background()

	cmdTool, err := functiontool.New(functiontool.Config{
		Name:        "bash",
		Description: "执行 shell 命令",
	}, RunCommand)
	if err != nil {
		log.Fatalf("Failed to create tool: %v", err)
	}

	model := env.MustModel()

	a, err := llmagent.New(llmagent.Config{
		Name:        "cli_agent",
		Model:       model,
		Description: "CLI agent",
		Instruction: "按要求执行命令并返回结果。",
		Tools: []tool.Tool{
			cmdTool,
		},
	})
	if err != nil {
		log.Fatalf("Failed to create agent: %v", err)
	}

	config := &launcher.Config{
		AgentLoader: agent.NewSingleLoader(a),
	}

	l := full.NewLauncher()
	if err = l.Execute(ctx, config, os.Args[1:]); err != nil {
		log.Fatalf("Run failed: %v\n\n%s", err, l.CommandLineSyntax())
	}
}
```

## 注意事项
- 保持 Go 代码结构与 `cmd/hello/main.go` 一致。
- 输入/输出结构体字段需与 Python 工具入参/出参语义一致。
- 若 Python 中存在 REPL/交互循环，优先转为 `launcher` 形式执行；仅在明确需要 REPL 时再补充。
