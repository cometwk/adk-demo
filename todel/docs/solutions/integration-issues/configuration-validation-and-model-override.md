---
module: Assistant
date: 2026-02-22
problem_type: integration_issue
component: tooling
symptoms:
  - Confusing panic messages when environment variables are missing
  - Inability to override model name without editing .env
root_cause: config_error
resolution_type: code_fix
severity: medium
tags: [configuration, openai, model-override, environment-variables, go-adk]
---

# Configuration Validation and Model Override

## Problem
In the initial setup of the Go ADK onboarding project, environment variables (`OPENAI_API_BASE`, `OPENAI_API_KEY`, `OPENAI_MODEL`) were used directly without centralized validation. This led to:
1.  **Poor Error Messages**: If a key was missing, the application would panic at the point of use with a generic or less descriptive error message.
2.  **Inflexibility**: There was no easy way to switch models for testing (e.g., from `gpt-4o` to `gpt-4o-mini`) without manually editing the `.env` file, which is error-prone and slow.

## Investigation
The code previously relied on `os.Getenv` in multiple functions like `MustModel` and `MustModelWith`. Validation was either missing or duplicated.
- `MustModel` used `OPENAI_MODEL` from env.
- `MustModelWith` ignored `OPENAI_MODEL` but still required `OPENAI_API_BASE` and `OPENAI_API_KEY`.

## Root Cause
The root cause was a **configuration error** stemming from fragmented loading and validation logic. There was no single source of truth for mandatory configuration keys, making the system fragile when the environment was not perfectly set up.

## Working Solution
The solution involved a two-stage refactor:

### 1. Centralized Validation
Introduced `mustOpenAIConfig(includeModel bool)` in `lib/pkg/env/model.go`. This function checks all required keys and reports *all* missing ones in a single descriptive panic message.

```go
func mustOpenAIConfig(includeModel bool) (string, string, string) {
    baseURL := os.Getenv("OPENAI_API_BASE")
    apiKey := os.Getenv("OPENAI_API_KEY")
    modelName := os.Getenv("OPENAI_MODEL")

    missing := make([]string, 0, 3)
    if baseURL == "" { missing = append(missing, "OPENAI_API_BASE") }
    if apiKey == "" { missing = append(missing, "OPENAI_API_KEY") }
    if includeModel && modelName == "" { missing = append(missing, "OPENAI_MODEL") }

    if len(missing) > 0 {
        panic(fmt.Sprintf("OpenAI 配置不完整，缺少: %s...", strings.Join(missing, ", ")))
    }
    return baseURL, apiKey, modelName
}
```

### 2. Model Override via Flag
Added `MustModelWithFlag(flagModel string)` to support CLI overrides. This allows users to pass a model name directly from the command line, falling back to the environment variable only if the flag is empty.

```go
func MustModelWithFlag(flagModel string) model.LLM {
    if flagModel != "" {
        return MustModelWith(flagModel)
    }
    return MustModel()
}
```

In `cmd/learn/v2/main.go`, the flag is parsed and passed to the runner:
```go
func main() {
    modelFlag := flag.String("model", "", "override OPENAI_MODEL env var")
    flag.Parse()
    run(ctx, *modelFlag)
}
```

## Verification
- **Unit Tests**: Added `lib/pkg/env/model_test.go` to verify that `mustOpenAIConfig` panics correctly when keys are missing.
- **Manual Test**: Verified that `go run ./cmd/learn/v2 -model gpt-4o-mini` correctly overrides the model as shown in the application logs.

## Prevention Strategies
1.  **Validate Early**: Perform configuration validation as close to the application entry point as possible.
2.  **Atomic Error Reporting**: Instead of failing on the first missing key, collect all configuration errors and report them together to reduce the "fix-retry" loop.
3.  **Support Overrides**: Always provide a mechanism (like CLI flags) to override environment-based configuration for faster developer iterations.

## Related Resources
- [ADK Go OpenAI Provider Documentation](https://github.com/byebyebruce/adk-go-openai)
- [Go flag package](https://pkg.go.dev/flag)
