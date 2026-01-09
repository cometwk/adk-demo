// Package main provides a minimal ADK agent with a custom Go function tool.
//
// It demonstrates:
// - Creating a Gemini model (via GOOGLE_API_KEY)
// - Defining a custom tool using functiontool.New
// - Running an LLM agent with that tool through ADK's launcher
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"

	"google.golang.org/genai"

	"google.golang.org/adk/agent"
	"google.golang.org/adk/agent/llmagent"
	"google.golang.org/adk/cmd/launcher"
	"google.golang.org/adk/cmd/launcher/full"
	"google.golang.org/adk/model/gemini"
	"google.golang.org/adk/tool"
	"google.golang.org/adk/tool/functiontool"
)

type calcInput struct {
	A  float64 `json:"a"`
	B  float64 `json:"b"`
	Op string  `json:"op"` // one of: + - * /
}

type calcOutput struct {
	Result float64 `json:"result"`
}

func main() {
	ctx := context.Background()

	model, err := gemini.NewModel(ctx, "gemini-2.5-flash", &genai.ClientConfig{
		APIKey: os.Getenv("GOOGLE_API_KEY"),
	})
	if err != nil {
		log.Fatalf("Failed to create model: %v", err)
	}

	calcTool, err := functiontool.New(functiontool.Config{
		Name:        "calc",
		Description: "执行基础四则运算。参数 a/b 为数字，op 为 + - * /。",
	}, func(ctx tool.Context, in calcInput) (calcOutput, error) {
		switch strings.TrimSpace(in.Op) {
		case "+":
			return calcOutput{Result: in.A + in.B}, nil
		case "-":
			return calcOutput{Result: in.A - in.B}, nil
		case "*":
			return calcOutput{Result: in.A * in.B}, nil
		case "/":
			if in.B == 0 {
				return calcOutput{}, fmt.Errorf("invalid argument: b must not be 0 for division")
			}
			return calcOutput{Result: in.A / in.B}, nil
		default:
			return calcOutput{}, fmt.Errorf("invalid argument: op must be one of: + - * /")
		}
	})
	if err != nil {
		log.Fatalf("Failed to create tool: %v", err)
	}

	a, err := llmagent.New(llmagent.Config{
		Name:        "calculator_agent",
		Model:       model,
		Description: "一个只会做基础四则运算的计算器。",
		Instruction: "你是计算器。只要用户提到计算/数字运算，你必须调用 calc 工具得到结果再回复。遇到除以 0 等非法输入，解释原因并让用户改写输入。",
		Tools: []tool.Tool{
			calcTool,
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

