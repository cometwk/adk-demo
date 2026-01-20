package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strings"
	"time"

	"google.golang.org/adk/agent"
	"google.golang.org/adk/agent/llmagent"
	"google.golang.org/adk/cmd/launcher"
	"google.golang.org/adk/cmd/launcher/full"
	"google.golang.org/adk/tool"
	"google.golang.org/adk/tool/functiontool"

	"adk-demo/lib/pkg/env"
)

type Input struct {
	Command string `json:"command" jsonschema:"shell command to execute"`
}

type Output struct {
	Result string `json:"result" jsonschema:"command output (stdout + stderr)"`
}

func RunCommand(ctx tool.Context, input Input) (Output, error) {
	command := strings.TrimSpace(input.Command)
	if command == "" {
		return Output{}, fmt.Errorf("command is required")
	}

	execCtx, cancel := context.WithTimeout(context.Background(), 300*time.Second)
	defer cancel()

	cmd := exec.CommandContext(execCtx, "bash", "-lc", command)
	output, err := cmd.CombinedOutput()
	result := string(output)
	if execCtx.Err() == context.DeadlineExceeded {
		return Output{Result: result + "\n[timeout] command exceeded 300s"}, nil
	}
	if err != nil {
		return Output{Result: result + "\n[error] " + err.Error()}, nil
	}
	return Output{Result: result}, nil
}

// # System prompt teaches the model HOW to use bash effectively
// # Notice the subagent guidance - this is how we get hierarchical task decomposition
func getSystemPrompt() string {
	SYSTEM := `You are a CLI agent at %s. Solve problems using bash commands.

Rules:
- Prefer tools over prose. Act first, explain briefly after.
- Read files: cat, grep, find, rg, ls, head, tail
- Write files: echo '...' > file, sed -i, or cat << 'EOF' > file
- Subagent: For complex subtasks, spawn a subagent to keep context clean:
  %s "explore src/ and summarize the architecture"

When to use subagent:
- Task requires reading many files (isolate the exploration)
- Task is independent and self-contained
- You want to avoid polluting current conversation with intermediate details

The subagent runs in isolation and returns only its final summary.`

	wd, err := os.Getwd()
	if err != nil {
		panic(err)
	}
	return fmt.Sprintf(SYSTEM, wd, "go run main.go")
}

func createBashTool() tool.Tool {
	bashTool, err := functiontool.New(functiontool.Config{
		Name: "bash",
		Description: `执行 shell 命令。模式：
- 读取: cat/head/tail, grep/find/rg/ls, wc -l
- 写入: echo 'content' > file, sed -i 's/old/new/g' file
- 子代理: go run main.go 'task description' (spawns isolated agent, returns summary)
`,
	}, RunCommand)
	if err != nil {
		log.Fatalf("Failed to create tool: %v", err)
	}
	return bashTool
}

func main() {
	ctx := context.Background()
	bashTool := createBashTool()

	a, err := llmagent.New(llmagent.Config{
		Name:        "cli_agent",
		Model:       env.MustModel(),
		Description: "CLI agent that can run shell commands.",
		Instruction: getSystemPrompt(),
		Tools: []tool.Tool{
			bashTool,
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
