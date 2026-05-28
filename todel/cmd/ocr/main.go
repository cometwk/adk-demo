// // Package main provides a minimal ADK agent using an OpenAI-compatible API,
// // with a custom Go function tool.
// //
// // It demonstrates:
// // - Creating an ADK model backed by OpenAI-compatible Chat Completions
// // - Defining a custom tool using functiontool.New
// // - Running an LLM agent with that tool through ADK's launcher
package main

// import (
// 	"fmt"

// 	"github.com/google/jsonschema-go/jsonschema"
// )

// type User struct {
// 	Name string `json:"name" jsonschema:"type:string 用户名"`
// 	Age  int    `json:"age" jsonschema:"type:number 年龄"`
// }

// func GetSchema() *jsonschema.Schema {
// 	// 	ope
// 	// 	// 使用 ADK v0.3.0 的现成函数
// 	// 	// reflect.TypeOf(User{}) 获取结构体类型
// 	// 	schema, err := jsonschema.Generate(reflect.TypeOf(User{}))
// 	// 	if err != nil {
// 	// 		panic(err)
// 	// 	}

// 	// 	// 此时 schema 已经是 *genai.Schema 类型
// 	// 	fmt.Printf("Type: %v\n", schema.Type)
// 	// 	fmt.Printf("Properties: %v\n", schema.Properties["name"].Description)

// 	opts := &jsonschema.ForOptions{
// 		IgnoreInvalidTypes: false,
// 		// TypeSchemas: map[reflect.Type]*jsonschema.Schema{
// 		// reflect.TypeFor[custom](): {Type: "custom"},
// 		// },
// 	}

// 	s, err := jsonschema.For[User](opts)
// 	if err != nil {
// 		panic(err)
// 	}

// 	fmt.Printf("Schema: %v\n", s)
// 	return s
// }

// // // type User struct {
// // // 	Name string `json:"name" jsonschema:"type:string 用户名"`
// // // 	Age  int    `json:"age" jsonschema:"type:number 年龄"`
// // // }

// // func main0() {
// // 	ctx := context.Background()

// // 	// model := env.MustModelWith("qwen-vl-ocr-2025-11-20")
// // 	model := env.MustModel()
// // 	// model.GenerateContent()
// // 	schema := GetSchema()
// // 	a, err := llmagent.New(llmagent.Config{
// // 		Name:        "ocr_agent",
// // 		Model:       model,
// // 		Description: "一个只会做 OCR 的工具。",
// // 		Instruction: "你是 OCR 工具。只要用户提到 OCR，你必须调用 OCR 工具得到结果再回复。遇到 OCR 失败，解释原因并让用户改写输入。",
// // 		// Tools: []tool.Tool{
// // 		// 	ocrTool,
// // 		// },
// // 		// OutputSchema: &genai.Schema{
// // 		// 	Type: "object",
// // 		// 	Properties: map[string]*genai.Schema{
// // 		// 		"name": {Type: "string"},
// // 		// 		"age":  {Type: "number"},
// // 		// 	},
// // 		// },
// // 		// OutputSchema: schema,
// // 	})
// // 	if err != nil {
// // 		log.Fatalf("Failed to create agent: %v", err)
// // 	}

// // 	config := &launcher.Config{
// // 		AgentLoader: agent.NewSingleLoader(a),
// // 	}

// // 	l := full.NewLauncher()
// // 	if err = l.Execute(ctx, config, os.Args[1:]); err != nil {
// // 		log.Fatalf("Run failed: %v\n\n%s", err, l.CommandLineSyntax())
// // 	}
// // }
