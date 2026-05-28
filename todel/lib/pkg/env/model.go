package env

import (
	"fmt"
	"os"
	"strings"

	openai "github.com/byebyebruce/adk-go-openai"
	go_openai "github.com/sashabaranov/go-openai"
	"google.golang.org/adk/model"
)

func mustOpenAIConfig(includeModel bool) (string, string, string) {
	baseURL := os.Getenv("OPENAI_API_BASE")
	apiKey := os.Getenv("OPENAI_API_KEY")
	modelName := os.Getenv("OPENAI_MODEL")

	missing := make([]string, 0, 3)
	if baseURL == "" {
		missing = append(missing, "OPENAI_API_BASE")
	}
	if apiKey == "" {
		missing = append(missing, "OPENAI_API_KEY")
	}
	if includeModel && modelName == "" {
		missing = append(missing, "OPENAI_MODEL")
	}

	if len(missing) > 0 {
		panic(fmt.Sprintf(
			"OpenAI 配置不完整，缺少: %s。\n请在 .env 或环境变量中设置这些 key。当前链路: OPENAI_* -> env.MustModel -> llmagent.Config.Model",
			strings.Join(missing, ", "),
		))
	}

	return baseURL, apiKey, modelName
}

func MustModel() model.LLM {
	baseURL, apiKey, modelName := mustOpenAIConfig(true)

	// modelName := "gpt-5.1"
	openaiCfg := go_openai.DefaultConfig(apiKey)
	openaiCfg.BaseURL = baseURL
	model := openai.NewOpenAIModel(modelName, openaiCfg)
	return model
}

func MustModelWith(modelName string) model.LLM {
	baseURL, apiKey, _ := mustOpenAIConfig(false)

	openaiCfg := go_openai.DefaultConfig(apiKey)
	openaiCfg.BaseURL = baseURL
	model := openai.NewOpenAIModel(modelName, openaiCfg)
	return model
}

// MustModelWithFlag 优先使用 flagModel，为空时回退到 OPENAI_MODEL 环境变量。
func MustModelWithFlag(flagModel string) model.LLM {
	if flagModel != "" {
		return MustModelWith(flagModel)
	}
	return MustModel()
}
