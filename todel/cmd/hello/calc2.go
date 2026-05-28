// Package main provides a minimal ADK agent using an OpenAI-compatible API,
// with a custom Go function tool.
//
// It demonstrates:
// - Creating an ADK model backed by OpenAI-compatible Chat Completions
// - Defining a custom tool using functiontool.New
// - Running an LLM agent with that tool through ADK's launcher
package main

import (
	"adk-demo/lib/pkg/env"
	"fmt"
	"log"

	"google.golang.org/adk/agent"
	"google.golang.org/adk/agent/llmagent"
	"google.golang.org/adk/tool"
	"google.golang.org/adk/tool/agenttool"
	"google.golang.org/adk/tool/functiontool"
)

func createAddTool() tool.Tool {
	calcAdd := func(ctx tool.Context, in calcInput) (calcOutput, error) {
		log.Println("加法", in.A, in.B)
		return calcOutput{Result: in.A + in.B}, nil
	}

	addTool, err := functiontool.New(functiontool.Config{
		Name:        "add",
		Description: "执行加法运算。参数 a/b 为数字。",
	}, calcAdd)
	if err != nil {
		log.Fatalf("Failed to create tool: %v", err)
	}
	return addTool
}

var AddTool = createAddTool()

func createSubTool() tool.Tool {
	calcSub := func(ctx tool.Context, in calcInput) (calcOutput, error) {
		log.Println("减法", in.A, in.B)
		return calcOutput{Result: in.A - in.B}, nil
	}

	subTool, err := functiontool.New(functiontool.Config{
		Name:        "sub",
		Description: "执行减法运算。参数 a/b 为数字。",
	}, calcSub)
	if err != nil {
		log.Fatalf("Failed to create tool: %v", err)
	}
	return subTool
}

var SubTool = createSubTool()

func createMulTool() tool.Tool {
	calcMul := func(ctx tool.Context, in calcInput) (calcOutput, error) {
		log.Println("乘法", in.A, in.B)
		return calcOutput{Result: in.A * in.B}, nil
	}

	mulTool, err := functiontool.New(functiontool.Config{
		Name:        "mul",
		Description: "执行乘法运算。参数 a/b 为数字。",
	}, calcMul)
	if err != nil {
		log.Fatalf("Failed to create tool: %v", err)
	}
	return mulTool
}

var MulTool = createMulTool()

func createDivTool() tool.Tool {
	calcDiv := func(ctx tool.Context, in calcInput) (calcOutput, error) {
		if in.B == 0 {
			log.Println("除法", in.A, in.B)
			return calcOutput{}, fmt.Errorf("invalid argument: b must not be 0 for division")
		}
		return calcOutput{Result: in.A / in.B}, nil
	}

	divTool, err := functiontool.New(functiontool.Config{
		Name:        "div",
		Description: "执行除法运算。参数 a/b 为数字，b 不能为 0。",
	}, calcDiv)
	if err != nil {
		log.Fatalf("Failed to create tool: %v", err)
	}
	return divTool
}

var DivTool = createDivTool()

func createCalcAgent() agent.Agent {
	a, err := llmagent.New(llmagent.Config{
		Name:        "calc_agent",
		Model:       env.MustModel(),
		Description: "执行基础四则运算。参数 a/b 为数字，op 为 + - * /。",
		Instruction: "你是计算器。只要用户提到计算/数字运算，你必须调用 calc 工具得到结果再回复。遇到除以 0 等非法输入，解释原因并让用户改写输入。",
		Tools: []tool.Tool{
			AddTool,
			SubTool,
			MulTool,
			DivTool,
		},
	})
	if err != nil {
		log.Fatalf("Failed to create agent: %v", err)
		panic(err)
	}

	return a
}

func createCalcAgentTool() tool.Tool {
	a := createCalcAgent()
	return agenttool.New(a, &agenttool.Config{
		SkipSummarization: true,
	})
}

var CalcAgentTool = createCalcAgentTool()
