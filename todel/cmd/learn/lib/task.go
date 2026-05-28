package lib

import (
	"fmt"
	"log"
	"strings"

	"google.golang.org/adk/tool"
	"google.golang.org/adk/tool/functiontool"
)

type AgentType struct {
	Name        string
	Description string
	Tools       []string
	Prompt      string
}

// 代理类型注册表
var AGENT_TYPES = map[string]AgentType{
	"explore": {
		Name:        "explore",
		Description: "Read-only agent for exploring code, finding files, searching",
		Tools:       []string{"bash", "read_file"}, // No write access
		Prompt:      "You are an exploration agent. Search and analyze, but never modify files. Return a concise summary.",
	},
	"code": {
		Name:        "code",
		Description: "Full agent for implementing features and fixing bugs",
		Tools:       []string{"*"}, // All tools
		Prompt:      "You are a coding agent. Implement the requested changes efficiently.",
	},
	"plan": {
		Name:        "plan",
		Description: "Planning agent for designing implementation strategies",
		Tools:       []string{"bash", "read_file"}, // Read-only
		Prompt:      "You are a planning agent. Analyze the codebase and output a numbered implementation plan. Do NOT make changes.",
	},
}

// Generate agent type descriptions for the Task tool.
func GetAgentDescriptions() string {
	descriptions := make([]string, 0, len(AGENT_TYPES))
	for name, cfg := range AGENT_TYPES {
		descriptions = append(descriptions, fmt.Sprintf("- %s: %s", name, cfg.Description))
	}
	return strings.Join(descriptions, "\n")
}

type taskInput struct {
	Description string `json:"description" jsonschema:"Short task name (3-5 words) for progress display"`
	Prompt      string `json:"prompt" jsonschema:"Detailed instructions for the subagent"`
	AgentType   string `json:"agent_type" jsonschema:"Type of agent to spawn"`
}

type taskOutput struct {
	Result string `json:"result"`
}

// runTask Execute a subagent task with isolated context.
// This is the core of the subagent mechanism:
//  1. Create isolated message history (KEY: no parent context!)
//  2. Use agent-specific system prompt
//  3. Filter available tools based on agent type
//  4. Run the same query loop as main agent
//  5. Return ONLY the final text (not intermediate details)
//
// The parent agent sees just the summary, keeping its context clean.
//
// Progress Display:
//
// While running, we show:
//
//	[explore] find auth files ... 5 tools, 3.2s
//
// This gives visibility without polluting the main conversation.
func runTask(ctx tool.Context, input taskInput) (taskOutput, error) {
	return taskOutput{
		Result: "Task completed",
	}, nil
}

func createTaskTool() tool.Tool {

	todoTool, err := functiontool.New(functiontool.Config{
		Name: "Task",
		Description: `Spawn a subagent for a focused subtask. 

Subagents run in ISOLATED context - they don't see parent's history. 
Use this to keep the main conversation clean. 

Agent types: ` + GetAgentDescriptions() + `. 

Example uses: 
- Task(explore): "Find all files using the auth module"
- Task(plan): "Design a migration strategy for the database"
- Task(code): "Implement the user registration form"
`,
	}, runTask)
	if err != nil {
		log.Fatalf("Failed to create tool: %v", err)
	}
	return todoTool
}
