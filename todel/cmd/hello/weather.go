package main

import (
	"fmt"
	"log"

	"google.golang.org/adk/tool"
	"google.golang.org/adk/tool/functiontool"
)

type Input struct {
	City string `json:"city" jsonschema:"city name"`
}

type Output struct {
	WeatherSummary string `json:"weather_summary" jsonschema:"weather summary in the given city"`
}

func GetWeather(ctx tool.Context, input Input) (Output, error) {
	log.Println("Getting weather for city: ", input.City)
	return Output{
		WeatherSummary: fmt.Sprintf("Today in %q is sunny\n", input.City),
	}, nil
}
func CreateWeatherTool() tool.Tool {
	weatherTool, err := functiontool.New(functiontool.Config{
		Name:        "weather",
		Description: "Returns weather in a city",
	}, GetWeather)
	if err != nil {
		log.Fatalf("Failed to create tool: %v", err)
	}
	return weatherTool
}

var WeatherTool = CreateWeatherTool()
