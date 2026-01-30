package env

import (
	openai "github.com/byebyebruce/adk-go-openai"
	go_openai "github.com/sashabaranov/go-openai"
	"google.golang.org/adk/model"
)

func MustModel() model.LLM {
	var baseURL = MustString("OPENAI_API_BASE")
	var apiKey = MustString("OPENAI_API_KEY")
	var modelName = MustString("OPENAI_MODEL")

	// modelName := "gpt-5.1"
	openaiCfg := go_openai.DefaultConfig(apiKey)
	openaiCfg.BaseURL = baseURL
	model := openai.NewOpenAIModel(modelName, openaiCfg)
	return model
}

func MustModelWith(modelName string) model.LLM {
	var baseURL = MustString("OPENAI_API_BASE")
	var apiKey = MustString("OPENAI_API_KEY")

	// modelName := "gpt-5.1"
	openaiCfg := go_openai.DefaultConfig(apiKey)
	openaiCfg.BaseURL = baseURL
	model := openai.NewOpenAIModel(modelName, openaiCfg)
	return model
}
