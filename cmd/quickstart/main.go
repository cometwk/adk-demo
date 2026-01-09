// Package main provides a minimal "hello ADK" quickstart agent using an
// OpenAI-compatible API.
//
// It demonstrates:
// - Creating an ADK model backed by OpenAI-compatible Chat Completions
// - Defining an LLM agent with a custom function tool
// - Running the agent through ADK's launcher (console/web/rest/a2a)
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"google.golang.org/adk/agent"
	"google.golang.org/adk/agent/llmagent"
	"google.golang.org/adk/cmd/launcher"
	"google.golang.org/adk/cmd/launcher/full"
	"google.golang.org/adk/tool"
	"google.golang.org/adk/tool/functiontool"

	"adk-demo/model/openai_compat"
)

func main() {
	ctx := context.Background()

	modelName := strings.TrimSpace(os.Getenv("OPENAI_MODEL"))
	if modelName == "" {
		modelName = "gpt-4o-mini"
	}
	model, err := openai_compat.NewModel(modelName, openai_compat.Config{
		BaseURL: os.Getenv("OPENAI_BASE_URL"),
		APIKey:  os.Getenv("OPENAI_API_KEY"),
	})
	if err != nil {
		log.Fatalf("Failed to create model: %v", err)
	}

	type CityInput struct {
		City string `json:"city"`
	}
	type CityWeatherTime struct {
		City      string `json:"city"`
		LocalTime string `json:"localTime"`
		TempC     string `json:"tempC"`
		Weather   string `json:"weather"`
	}

	wttrTool, err := functiontool.New(functiontool.Config{
		Name:        "get_city_weather_time",
		Description: "查询某城市的本地时间与当前天气（数据来自 wttr.in，无需额外 key）。输入 city=城市名（中英文均可）。",
	}, func(ctx tool.Context, in CityInput) (CityWeatherTime, error) {
		city := strings.TrimSpace(in.City)
		if city == "" {
			return CityWeatherTime{}, fmt.Errorf("city is required")
		}
		u := "https://wttr.in/" + url.PathEscape(city) + "?format=j1"
		httpClient := &http.Client{Timeout: 15 * time.Second}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
		if err != nil {
			return CityWeatherTime{}, err
		}
		req.Header.Set("user-agent", "adk-demo/quickstart")
		resp, err := httpClient.Do(req)
		if err != nil {
			return CityWeatherTime{}, err
		}
		defer resp.Body.Close()
		b, err := io.ReadAll(resp.Body)
		if err != nil {
			return CityWeatherTime{}, err
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return CityWeatherTime{}, fmt.Errorf("wttr.in http %d: %s", resp.StatusCode, string(b))
		}
		var decoded struct {
			CurrentCondition []struct {
				LocalObsDateTime string `json:"localObsDateTime"`
				TempC            string `json:"temp_C"`
				WeatherDesc      []struct {
					Value string `json:"value"`
				} `json:"weatherDesc"`
			} `json:"current_condition"`
		}
		if err := json.Unmarshal(b, &decoded); err != nil {
			return CityWeatherTime{}, err
		}
		if len(decoded.CurrentCondition) == 0 {
			return CityWeatherTime{}, fmt.Errorf("wttr.in returned empty current_condition")
		}
		cc := decoded.CurrentCondition[0]
		weather := ""
		if len(cc.WeatherDesc) > 0 {
			weather = cc.WeatherDesc[0].Value
		}
		return CityWeatherTime{
			City:      city,
			LocalTime: cc.LocalObsDateTime,
			TempC:     cc.TempC,
			Weather:   weather,
		}, nil
	})
	if err != nil {
		log.Fatalf("Failed to create tool: %v", err)
	}

	a, err := llmagent.New(llmagent.Config{
		Name:        "weather_time_agent_openai_compat",
		Model:       model,
		Description: "回答某城市的当前本地时间与天气（通过工具查询）。",
		Instruction: "你的唯一目标：回答某个城市的当前本地时间与天气。\n\n规则：\n- 只要用户问到“时间/几点/天气/温度”，你必须调用 get_city_weather_time 工具获取数据后再回答。\n- 对于与时间/天气无关的问题，必须拒绝并简短说明原因。\n- 回答尽量简洁，默认使用中文。",
		Tools: []tool.Tool{
			wttrTool,
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
