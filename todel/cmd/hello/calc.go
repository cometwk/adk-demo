// Package main provides a minimal ADK agent using an OpenAI-compatible API,
// with a custom Go function tool.
//
// It demonstrates:
// - Creating an ADK model backed by OpenAI-compatible Chat Completions
// - Defining a custom tool using functiontool.New
// - Running an LLM agent with that tool through ADK's launcher
package main

// "adk-demo/model/openai_compat"

type calcInput struct {
	A float64 `json:"a" jsonschema:"type:number 第一个数字"`
	B float64 `json:"b" jsonschema:"type:number 第二个数字"`
	// Op string  `json:"op" jsonschema:"enum:['+', '-', '*', '/'] 基础四则运算"` // one of: + - * /
}

type calcOutput struct {
	Result float64 `json:"result"`
}

// func calc(ctx tool.Context, in calcInput) (calcOutput, error) {
// 	switch strings.TrimSpace(in.Op) {
// 	case "+":
// 		return calcOutput{Result: in.A + in.B}, nil
// 	case "-":
// 		return calcOutput{Result: in.A - in.B}, nil
// 	case "*":
// 		return calcOutput{Result: in.A * in.B}, nil
// 	case "/":
// 		if in.B == 0 {
// 			return calcOutput{}, fmt.Errorf("invalid argument: b must not be 0 for division")
// 		}
// 		return calcOutput{Result: in.A / in.B}, nil
// 	default:
// 		return calcOutput{}, fmt.Errorf("invalid argument: op must be one of: + - * /")
// 	}
// }

// func createCalcTool() tool.Tool {
// 	calcTool, err := functiontool.New(functiontool.Config{
// 		Name:        "calc",
// 		Description: "执行基础四则运算。参数 a/b 为数字，op 为 + - * /。",
// 	}, calc)
// 	if err != nil {
// 		log.Fatalf("Failed to create tool: %v", err)
// 	}
// 	return calcTool
// }

// var CalcTool = createCalcTool()
