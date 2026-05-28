# Google ADK (Go) 入门 Demo

这是一个基于 **Google Agent Development Kit (ADK) for Go** 的最小可运行示例仓库，包含两个入门级 agent：

- **`cmd/quickstart`**：LLM agent + 内置工具 `GoogleSearch`（适合体验“工具调用 + launcher 运行方式”）
- **`cmd/calculator`**：LLM agent + 自定义 Go 函数工具 `calc`（适合学习 `functiontool.New`）

## 准备工作（OpenAI 兼容接口）

- **Go**：本项目 `go.mod` 需要 **Go 1.24.4**。如果你本机较旧，Go 会在 `GOTOOLCHAIN=auto`（默认）下自动下载匹配工具链；不行的话手动指定：

```bash
export GOTOOLCHAIN=go1.24.4
```

- **OpenAI 兼容配置**：通过环境变量提供（适用于 OpenAI / Azure OpenAI / 各类自建 OpenAI-compatible 服务）：

```bash
export OPENAI_BASE_URL="https://api.openai.com"   # 或你的兼容服务地址（可带 /v1）
export OPENAI_API_KEY="你的 key"
export OPENAI_MODEL="gpt-4o-mini"                 # 或你的服务支持的模型名
```

（仓库默认忽略 `.env`，你也可以把 key 放在本地 `.env` 里再 `source .env`。）

## 快速开始（Console 模式）

### 1) 运行计算器 agent（自定义 function tool）

```bash
go run ./cmd/calculator console -streaming_mode none
```

你可以尝试输入类似：
- `帮我算 12.5 * 8`
- `计算 7 / 0`（会提示非法输入）

### 2) 运行天气/时间 agent（通过工具查询）

```bash
go run ./cmd/quickstart console -streaming_mode none
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

> 说明：本仓库的 `openai_compat` model 目前**未实现流式输出**，因此建议在 console 模式下使用 `-streaming_mode none`。

## 代码结构

- `cmd/quickstart/main.go`：最小 ADK agent + `geminitool.GoogleSearch` + `full.NewLauncher()`
- `cmd/quickstart/main.go`：最小 ADK agent + `functiontool.New`（`get_city_weather_time`，数据来自 `wttr.in`）
- `cmd/calculator/main.go`：`functiontool.New` 封装一个 `calc` 工具并挂到 agent 上

