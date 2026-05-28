package main

import (
	"adk-demo/lib/pkg/env"
	"context"
	"fmt"
	"log"
	"os"

	"google.golang.org/adk/agent"
	"google.golang.org/adk/agent/llmagent"
	"google.golang.org/adk/cmd/launcher"
	"google.golang.org/adk/tool"
)

// type Input struct {
// 	City string `json:"city" jsonschema:"city name"`
// }

// type Output struct {
// 	WeatherSummary string `json:"weather_summary" jsonschema:"weather summary in the given city"`
// }

// func GetWeather(ctx tool.Context, input Input) (Output, error) {
// 	log.Println("Getting weather for city: ", input.City)
// 	return Output{
// 		WeatherSummary: fmt.Sprintf("Today in %q is sunny\n", input.City),
// 	}, nil
// }
// func CreateWeatherTool() tool.Tool {
// 	weatherTool, err := functiontool.New(functiontool.Config{
// 		Name:        "weather",
// 		Description: "Returns weather in a city",
// 	}, GetWeather)
// 	if err != nil {
// 		log.Fatalf("Failed to create tool: %v", err)
// 	}
// 	return weatherTool
// }

// func run1() {
// 	ctx := context.Background()

// 	weatherTool, err := functiontool.New(functiontool.Config{
// 		Name:        "weather",
// 		Description: "Returns weather in a city",
// 	}, GetWeather)
// 	if err != nil {
// 		log.Fatalf("Failed to create tool: %v", err)
// 	}

// 	model := env.MustModel()

// 	a, err := llmagent.New(llmagent.Config{
// 		Name:        "weather_agent",
// 		Model:       model,
// 		Description: "Agent to answer questions about weather in a city.",
// 		Instruction: "Your SOLE purpose is to answer questions about the current weather in a specific city. You MUST refuse to answer any questions unrelated to weather.",
// 		Tools: []tool.Tool{
// 			weatherTool,
// 		},
// 	})
// 	if err != nil {
// 		log.Fatalf("Failed to create agent: %v", err)
// 	}

// 	config := &launcher.Config{
// 		AgentLoader: agent.NewSingleLoader(a),
// 	}

// 	l := full.NewLauncher()
// 	if err = l.Execute(ctx, config, os.Args[1:]); err != nil {
// 		log.Fatalf("Run failed: %v\n\n%s", err, l.CommandLineSyntax())
// 	}
// }

// var appName = "hello"
// var userID = "user1"

// // callAgent is a helper function to execute an agent with a given prompt and handle its output.
// func callAgent(ctx context.Context, a agent.Agent, outputKey string, prompt string) {
// 	fmt.Printf("\n>>> Calling Agent: '%s' | Query: %s\n", a.Name(), prompt)
// 	// Create an in-memory session service to manage agent state.
// 	sessionService := session.InMemoryService()

// 	// Create a new session for the agent interaction.
// 	sessionCreateResponse, err := sessionService.Create(ctx, &session.CreateRequest{
// 		AppName: appName,
// 		UserID:  userID,
// 	})
// 	if err != nil {
// 		log.Fatalf("Failed to create the session service: %v", err)
// 	}

// 	session := sessionCreateResponse.Session

// 	// Configure the runner with the application name, agent, and session service.
// 	config := runner.Config{
// 		AppName:        appName,
// 		Agent:          a,
// 		SessionService: sessionService,
// 	}

// 	// Create a new runner instance.
// 	r, err := runner.New(config)
// 	if err != nil {
// 		log.Fatalf("Failed to create the runner: %v", err)
// 	}

// 	// Prepare the user's message to send to the agent.
// 	sessionID := session.ID()
// 	userMsg := &genai.Content{
// 		Parts: []*genai.Part{
// 			genai.NewPartFromText(prompt),
// 		},
// 		Role: string(genai.RoleUser),
// 	}

// 	// Run the agent and process the streaming events.
// 	for event, err := range r.Run(ctx, userID, sessionID, userMsg, agent.RunConfig{
// 		StreamingMode: agent.StreamingModeSSE,
// 	}) {
// 		if err != nil {
// 			fmt.Printf("\nAGENT_ERROR: %v\n", err)
// 		} else if event.Partial {
// 			// Print partial responses as they are received.
// 			for _, p := range event.Content.Parts {
// 				fmt.Print(p.Text)
// 			}
// 		}
// 	}

// 	// After the run, check if there's an expected output key in the session state.
// 	if outputKey != "" {
// 		storedOutput, error := session.State().Get(outputKey)
// 		if error == nil {
// 			// Pretty-print the stored output if it's a JSON string.
// 			fmt.Printf("\n--- Session State ['%s']: ", outputKey)
// 			storedString, isString := storedOutput.(string)
// 			if isString {
// 				var prettyJSON map[string]interface{}
// 				if err := json.Unmarshal([]byte(storedString), &prettyJSON); err == nil {
// 					indentedJSON, err := json.MarshalIndent(prettyJSON, "", "  ")
// 					if err == nil {
// 						fmt.Println(string(indentedJSON))
// 					} else {
// 						fmt.Println(storedString)
// 					}
// 				} else {
// 					fmt.Println(storedString)
// 				}
// 			} else {
// 				fmt.Println(storedOutput)
// 			}
// 			fmt.Println(strings.Repeat("-", 30))
// 		}
// 	}
// }

func run2() {
	ctx := context.Background()

	// weatherTool, err := functiontool.New(functiontool.Config{
	// 	Name:        "weather",
	// 	Description: "Returns weather in a city",
	// }, GetWeather)
	// if err != nil {
	// 	log.Fatalf("Failed to create tool: %v", err)
	// }

	model := env.MustModel()

	a, err := llmagent.New(llmagent.Config{
		Name:        "weather_agent",
		Model:       model,
		Description: "Agent to answer questions about weather in a city.",
		Instruction: "Your SOLE purpose is to answer questions about the current weather in a specific city. You MUST refuse to answer any questions unrelated to weather.",
		Tools: []tool.Tool{
			// weatherTool,
			WeatherTool,
			CalcAgentTool,
		},
	})
	if err != nil {
		log.Fatalf("Failed to create agent: %v", err)
	}

	config := &launcher.Config{
		AgentLoader: agent.NewSingleLoader(a),
	}

	l := NewLauncher()
	fmt.Println(os.Args[1:])
	if err = l.Execute(ctx, config, os.Args[1:]); err != nil {
		log.Fatalf("Run failed: %v\n\n%s", err, l.CommandLineSyntax())
	}

}

func main() {
	run2()
}
