package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"google.golang.org/adk/agent"
	"google.golang.org/adk/agent/llmagent"
	"google.golang.org/adk/cmd/launcher"

	"adk-demo/cmd/learn/lib"
	"adk-demo/lib/pkg/env"
)

var WORKDIR, _ = os.Getwd()
var MODEL = env.MustModel()
var TOOLS = lib.TOOLS

func getSystemPrompt() string {
	SYSTEM := `You are a coding agent at %s.

Loop: plan -> act with tools -> update todos -> report.

Rules:
- Use TodoWrite to track multi-step tasks
- Mark tasks in_progress before starting, completed when done
- Prefer tools over prose. Act, don't just explain.
- After finishing, summarize what changed.`

	return fmt.Sprintf(SYSTEM, WORKDIR, "go run main.go")
}

// # =============================================================================
// # System Reminders - Soft prompts to encourage todo usage
// # =============================================================================

// Shown at the start of conversation
var INITIAL_REMINDER = "<reminder>Use TodoWrite for multi-step tasks.</reminder>"

// Shown if model hasn't updated todos in a while
var NAG_REMINDER = "<reminder>10+ turns without todo update. Please update todos.</reminder>"

// REPL with reminder injection.
//
// Key v2 addition: We inject "reminder" messages to encourage
// todo usage without forcing it. This is a soft constraint.
//
// Reminders are injected as part of the user message, not as
// separate system prompts. The model sees them but doesn't
// respond to them directly.
func run(ctx context.Context) {
	a, err := llmagent.New(llmagent.Config{
		Name:        "cli_agent",
		Model:       env.MustModel(),
		Description: "CLI agent that can run shell commands.",
		Instruction: getSystemPrompt(),
		Tools:       TOOLS,
	})
	if err != nil {
		log.Fatalf("Failed to create agent: %v", err)
	}

	config := &launcher.Config{
		AgentLoader: agent.NewSingleLoader(a),
	}

	l := NewLauncher()
	if err = l.Run(ctx, config); err != nil {
		log.Fatalf("Run failed: %v\n\n%s", err, l.CommandLineSyntax())
	}
}

func main() {
	ctx := context.Background()
	run(ctx)
}
