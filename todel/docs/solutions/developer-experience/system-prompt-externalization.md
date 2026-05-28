---
module: Assistant
date: 2026-02-22
problem_type: developer_experience
component: assistant
symptoms:
  - Slow iteration speed when modifying system prompts (requires recompilation)
  - Difficult to maintain multi-line system prompts in Go source code
root_cause: config_error
resolution_type: tooling_addition
severity: low
tags: [prompt-engineering, system-prompt, developer-experience, go-adk]
---

# System Prompt Externalization

## Problem
In the initial development phase, the system prompt was hardcoded as a string within `cmd/learn/v2/main.go`. This created several frictions:
1.  **Slow Iteration**: Any change to the prompt required a re-build/re-run cycle.
2.  **Formatting Issues**: Managing long, multi-line prompts with specific formatting in Go's raw string literals is cumbersome.
3.  **Inflexibility**: Different tasks or test scenarios might require different system prompts, which was impossible without code changes.

## Investigation
The prompt used a `fmt.Sprintf` to inject the current working directory. Any externalization strategy must still support dynamic placeholders like the working directory.

## Root Cause
The root cause was **inadequate tooling** for prompt engineering. The system relied on static code instead of a dynamic configuration mechanism for its most frequently iterated component.

## Working Solution
The solution involved adding support for external prompt files with a simple template replacement mechanism.

### 1. Implementation in `main.go`
Added a `-prompt` flag and updated `getSystemPrompt` to read from a file if provided.

```go
func getSystemPrompt(promptFile string) string {
    var system string
    if promptFile != "" {
        content, err := os.ReadFile(promptFile)
        // ... handle error ...
        system = string(content)
    } else {
        system = `... default hardcoded prompt ...`
    }
    // Replace placeholders
    return strings.ReplaceAll(system, "{{.WORKDIR}}", WORKDIR)
}
```

### 2. External Prompt Template
Created `cmd/learn/v2/system.md` as a standalone Markdown file. This allows for better syntax highlighting and easier editing.

```markdown
You are a coding agent at {{.WORKDIR}}.
...
```

### 3. Usage
Users can now run the agent with a custom prompt file:
```bash
go run ./cmd/learn/v2 -prompt ./custom-prompt.md
```

## Verification
Verified that the application:
1.  Loads the default prompt if no flag is provided.
2.  Loads the external file correctly if `-prompt` is used.
3.  Replaces `{{.WORKDIR}}` with the actual path in both cases.
4.  Provides a clear error message (panic) if the specified file is missing.

## Prevention Strategies
1.  **Externalize Content**: Keep natural language prompts outside of source code to separate business logic from configuration.
2.  **Template Support**: Use a simple, robust template mechanism (like `{{.VARIABLE}}`) to allow dynamic data injection into externalized prompts.
3.  **Provide Defaults**: Always keep a sensible default prompt hardcoded or as a default-loaded file to ensure the application is usable out-of-the-box.

## Related Resources
- [Go strings package](https://pkg.go.dev/strings)
- [Prompt Engineering Best Practices](https://help.openai.com/en/articles/6654503-how-should-i-structure-my-prompts)
