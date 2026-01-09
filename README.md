# Google ADK (Go) 入门 Demo

这是一个基于 **Google Agent Development Kit (ADK) for Go** 的最小可运行示例仓库，包含两个入门级 agent：

- **`cmd/quickstart`**：LLM agent + 内置工具 `GoogleSearch`（适合体验“工具调用 + launcher 运行方式”）
- **`cmd/calculator`**：LLM agent + 自定义 Go 函数工具 `calc`（适合学习 `functiontool.New`）

## 准备工作

- **Go**：本项目 `go.mod` 需要 **Go 1.24.4**。如果你本机较旧，Go 会在 `GOTOOLCHAIN=auto`（默认）下自动下载匹配工具链；不行的话手动指定：

```bash
export GOTOOLCHAIN=go1.24.4
```

- **Gemini API Key**：通过环境变量 `GOOGLE_API_KEY` 提供：

```bash
export GOOGLE_API_KEY="你的 key"
```

（仓库默认忽略 `.env`，你也可以把 key 放在本地 `.env` 里再 `source .env`。）

## 快速开始（Console 模式）

### 1) 运行计算器 agent（自定义 function tool）

```bash
go run ./cmd/calculator console
```

你可以尝试输入类似：
- `帮我算 12.5 * 8`
- `计算 7 / 0`（会提示非法输入）

### 2) 运行天气/时间 agent（带 Google Search 工具）

```bash
go run ./cmd/quickstart console
```

你可以尝试输入类似：
- `上海现在几点？`
- `东京今天的天气怎么样？`

## Web / REST / A2A

ADK 的 launcher 支持多种运行形态（例如 web server + webui/api/a2a 等）。你可以查看帮助：

```bash
go run ./cmd/quickstart --help
```

例如启动 web server（端口 8080）：

```bash
go run ./cmd/quickstart web -port 8080 webui api
```

## 代码结构

- `cmd/quickstart/main.go`：最小 ADK agent + `geminitool.GoogleSearch` + `full.NewLauncher()`
- `cmd/calculator/main.go`：`functiontool.New` 封装一个 `calc` 工具并挂到 agent 上

