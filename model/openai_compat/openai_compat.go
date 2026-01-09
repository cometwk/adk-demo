// Package openai_compat provides an ADK model implementation backed by an
// OpenAI-compatible Chat Completions API.
//
// It targets the common endpoint:
//
//	POST {OPENAI_BASE_URL}/v1/chat/completions
//
// This implementation is intentionally minimal and focuses on:
// - system/user/assistant messages
// - function tools (OpenAI "tools" with type=function)
// - tool calls / tool results
//
// Note: streaming is not implemented. Use launcher flag: -streaming_mode none
package openai_compat

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"iter"
	"net/http"
	"os"
	"strings"
	"time"

	"google.golang.org/genai"

	"google.golang.org/adk/model"
)

type Config struct {
	// BaseURL is the OpenAI-compatible server base URL, e.g.:
	// - https://api.openai.com
	// - http://localhost:8000
	// - http://localhost:8000/v1
	BaseURL string
	// APIKey is the bearer token (optional for some self-hosted servers).
	APIKey string
	// HTTPClient allows overriding the HTTP client.
	HTTPClient *http.Client
}

type openAIModel struct {
	name   string
	base   string
	apiKey string
	http   *http.Client
}

func NewModel(modelName string, cfg Config) (model.LLM, error) {
	if strings.TrimSpace(modelName) == "" {
		return nil, fmt.Errorf("modelName is required")
	}
	base := strings.TrimSpace(cfg.BaseURL)
	if base == "" {
		base = strings.TrimSpace(os.Getenv("OPENAI_BASE_URL"))
	}
	if base == "" {
		base = "https://api.openai.com"
	}
	apiKey := cfg.APIKey
	if apiKey == "" {
		apiKey = os.Getenv("OPENAI_API_KEY")
	}
	hc := cfg.HTTPClient
	if hc == nil {
		hc = &http.Client{Timeout: 60 * time.Second}
	}
	return &openAIModel{
		name:   modelName,
		base:   strings.TrimRight(base, "/"),
		apiKey: apiKey,
		http:   hc,
	}, nil
}

func (m *openAIModel) Name() string { return m.name }

func (m *openAIModel) GenerateContent(ctx context.Context, req *model.LLMRequest, stream bool) iter.Seq2[*model.LLMResponse, error] {
	if stream {
		return func(yield func(*model.LLMResponse, error) bool) {
			yield(nil, errors.New("openai_compat model: streaming not implemented; run with: console -streaming_mode none"))
		}
	}
	return func(yield func(*model.LLMResponse, error) bool) {
		resp, err := m.generate(ctx, req)
		yield(resp, err)
	}
}

func (m *openAIModel) generate(ctx context.Context, req *model.LLMRequest) (*model.LLMResponse, error) {
	messages, err := toOpenAIMessages(req)
	if err != nil {
		return nil, err
	}
	tools, err := toOpenAITools(req)
	if err != nil {
		return nil, err
	}

	body := openAIChatCompletionsRequest{
		Model:    m.name,
		Messages: messages,
	}
	// Best-effort mapping of a few common knobs.
	if req != nil && req.Config != nil {
		if req.Config.Temperature != nil {
			t := float64(*req.Config.Temperature)
			body.Temperature = &t
		}
		if req.Config.TopP != nil {
			p := float64(*req.Config.TopP)
			body.TopP = &p
		}
		if req.Config.MaxOutputTokens > 0 {
			body.MaxTokens = int(req.Config.MaxOutputTokens)
		}
		if len(req.Config.StopSequences) > 0 {
			body.Stop = req.Config.StopSequences
		}
	}
	if len(tools) > 0 {
		body.Tools = tools
		// Let model decide when to call tools.
		body.ToolChoice = "auto"
	}

	raw, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, chatCompletionsURL(m.base), bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("content-type", "application/json")
	if strings.TrimSpace(m.apiKey) != "" {
		httpReq.Header.Set("authorization", "Bearer "+m.apiKey)
	}

	httpResp, err := m.http.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer httpResp.Body.Close()

	var decoded openAIChatCompletionsResponse
	if err := json.NewDecoder(httpResp.Body).Decode(&decoded); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	if httpResp.StatusCode < 200 || httpResp.StatusCode >= 300 {
		if decoded.Error != nil && decoded.Error.Message != "" {
			return nil, fmt.Errorf("openai_compat http %d: %s", httpResp.StatusCode, decoded.Error.Message)
		}
		return nil, fmt.Errorf("openai_compat http %d", httpResp.StatusCode)
	}
	if len(decoded.Choices) == 0 {
		return nil, fmt.Errorf("empty response choices")
	}

	content, err := fromOpenAIMessage(decoded.Choices[0].Message)
	if err != nil {
		return nil, err
	}

	out := &model.LLMResponse{
		Content:        content,
		CustomMetadata: map[string]any{"provider": "openai_compat"},
	}
	return out, nil
}

func chatCompletionsURL(base string) string {
	// If user provides ".../v1", don't append another "/v1".
	if strings.HasSuffix(base, "/v1") {
		return base + "/chat/completions"
	}
	return base + "/v1/chat/completions"
}

// --- OpenAI wire types ---

type openAIChatCompletionsRequest struct {
	Model       string          `json:"model"`
	Messages    []openAIMessage `json:"messages"`
	Tools       []openAITool    `json:"tools,omitempty"`
	ToolChoice  any             `json:"tool_choice,omitempty"` // "auto" or {"type":"function","function":{"name":"..."}}
	Temperature *float64        `json:"temperature,omitempty"`
	TopP        *float64        `json:"top_p,omitempty"`
	MaxTokens   int             `json:"max_tokens,omitempty"`
	Stop        []string        `json:"stop,omitempty"`
	Stream      bool            `json:"stream,omitempty"`
	Extra       map[string]any  `json:"-"`
}

type openAIChatCompletionsResponse struct {
	ID      string         `json:"id,omitempty"`
	Object  string         `json:"object,omitempty"`
	Created int64          `json:"created,omitempty"`
	Model   string         `json:"model,omitempty"`
	Choices []openAIChoice `json:"choices,omitempty"`
	Error   *openAIError   `json:"error,omitempty"`
}

type openAIError struct {
	Message string `json:"message,omitempty"`
	Type    string `json:"type,omitempty"`
}

type openAIChoice struct {
	Index        int           `json:"index,omitempty"`
	Message      openAIMessage `json:"message"`
	FinishReason string        `json:"finish_reason,omitempty"`
}

type openAIMessage struct {
	Role       string           `json:"role"`
	Content    string           `json:"content,omitempty"`
	Name       string           `json:"name,omitempty"`
	ToolCalls  []openAIToolCall `json:"tool_calls,omitempty"`
	ToolCallID string           `json:"tool_call_id,omitempty"` // role=tool
}

type openAITool struct {
	Type     string         `json:"type"` // "function"
	Function openAIFunction `json:"function"`
}

type openAIFunction struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Parameters  any    `json:"parameters,omitempty"`
}

type openAIToolCall struct {
	ID       string         `json:"id"`
	Type     string         `json:"type"` // "function"
	Function openAIToolFunc `json:"function"`
}

type openAIToolFunc struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"` // JSON string
}

// --- Converters ---

func toOpenAIMessages(req *model.LLMRequest) ([]openAIMessage, error) {
	var out []openAIMessage

	// System instruction (if present).
	if req != nil && req.Config != nil && req.Config.SystemInstruction != nil {
		sysText, err := contentText(req.Config.SystemInstruction)
		if err != nil {
			return nil, fmt.Errorf("systemInstruction: %w", err)
		}
		if strings.TrimSpace(sysText) != "" {
			out = append(out, openAIMessage{Role: "system", Content: sysText})
		}
	}

	for _, c := range req.Contents {
		if c == nil {
			continue
		}
		role := strings.ToLower(strings.TrimSpace(c.Role))
		switch role {
		case "user":
			// ok
		case "model", "assistant":
			role = "assistant"
		default:
			// Unknown roles are treated as "user" for compatibility.
			role = "user"
		}

		// Flatten parts.
		var textParts []string
		var toolCalls []openAIToolCall
		var toolResponses []*genai.FunctionResponse

		for _, p := range c.Parts {
			if p == nil {
				continue
			}
			switch {
			case p.Text != "":
				textParts = append(textParts, p.Text)
			case p.FunctionCall != nil:
				argsRaw, _ := json.Marshal(p.FunctionCall.Args)
				id := strings.TrimSpace(p.FunctionCall.ID)
				if id == "" {
					// ADK can generate IDs later, but OpenAI "tool" messages require one.
					id = "call_" + randID()
				}
				toolCalls = append(toolCalls, openAIToolCall{
					ID:   id,
					Type: "function",
					Function: openAIToolFunc{
						Name:      p.FunctionCall.Name,
						Arguments: string(argsRaw),
					},
				})
			case p.FunctionResponse != nil:
				toolResponses = append(toolResponses, p.FunctionResponse)
			default:
				// Ignore unsupported multimodal parts in this minimal demo.
			}
		}

		// Regular message (user/assistant) with optional tool_calls.
		if len(textParts) > 0 || len(toolCalls) > 0 {
			msg := openAIMessage{
				Role:    role,
				Content: strings.Join(textParts, "\n"),
			}
			if role == "assistant" && len(toolCalls) > 0 {
				msg.ToolCalls = toolCalls
				// When tool calling, OpenAI often expects assistant content to be empty.
				if strings.TrimSpace(msg.Content) == "" {
					msg.Content = ""
				}
			}
			out = append(out, msg)
		}

		// Tool responses become role=tool messages.
		for _, r := range toolResponses {
			if r == nil {
				continue
			}
			raw, _ := json.Marshal(r.Response)
			out = append(out, openAIMessage{
				Role:       "tool",
				ToolCallID: r.ID,
				Content:    string(raw),
			})
		}
	}

	return out, nil
}

func toOpenAITools(req *model.LLMRequest) ([]openAITool, error) {
	if req == nil || req.Config == nil || len(req.Config.Tools) == 0 {
		return nil, nil
	}
	var out []openAITool
	for _, t := range req.Config.Tools {
		if t == nil || len(t.FunctionDeclarations) == 0 {
			continue
		}
		for _, d := range t.FunctionDeclarations {
			if d == nil || strings.TrimSpace(d.Name) == "" {
				continue
			}
			out = append(out, openAITool{
				Type: "function",
				Function: openAIFunction{
					Name:        d.Name,
					Description: d.Description,
					Parameters:  d.ParametersJsonSchema,
				},
			})
		}
	}
	return out, nil
}

func fromOpenAIMessage(msg openAIMessage) (*genai.Content, error) {
	c := &genai.Content{Role: "model"}
	if strings.TrimSpace(msg.Content) != "" {
		c.Parts = append(c.Parts, &genai.Part{Text: msg.Content})
	}
	for _, tc := range msg.ToolCalls {
		if tc.Type != "" && tc.Type != "function" {
			continue
		}
		var args map[string]any
		if strings.TrimSpace(tc.Function.Arguments) != "" {
			if err := json.Unmarshal([]byte(tc.Function.Arguments), &args); err != nil {
				// Be forgiving: pass raw arguments through as a single string field.
				args = map[string]any{"_raw": tc.Function.Arguments}
			}
		} else {
			args = map[string]any{}
		}
		c.Parts = append(c.Parts, &genai.Part{
			FunctionCall: &genai.FunctionCall{
				ID:   tc.ID,
				Name: tc.Function.Name,
				Args: args,
			},
		})
	}
	if len(c.Parts) == 0 {
		// Always return at least an empty text part to satisfy downstream assumptions.
		c.Parts = append(c.Parts, &genai.Part{Text: ""})
	}
	return c, nil
}

func contentText(c *genai.Content) (string, error) {
	if c == nil {
		return "", nil
	}
	var parts []string
	for _, p := range c.Parts {
		if p == nil {
			continue
		}
		if p.Text != "" {
			parts = append(parts, p.Text)
		}
	}
	return strings.Join(parts, "\n"), nil
}

// Very small, non-crypto ID helper for tool_call IDs in fallback paths.
func randID() string {
	// time-based is enough for demo; server will usually provide IDs anyway.
	return strings.ReplaceAll(time.Now().UTC().Format("20060102T150405.000000000Z"), ".", "")
}
