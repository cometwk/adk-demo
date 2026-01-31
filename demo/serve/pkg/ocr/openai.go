package ocr

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"image"
	"image/gif"
	"image/jpeg"
	"image/png"
	"math"
	"os"
	"reflect"

	"github.com/cometwk/lib/pkg/env"
	"github.com/google/jsonschema-go/jsonschema"
	"github.com/sashabaranov/go-openai"
	"github.com/sirupsen/logrus"
)

func getModel() (*openai.Client, string) {
	var baseURL = env.MustString("OPENAI_API_BASE")
	var apiKey = env.MustString("OPENAI_API_KEY")
	var modelName = env.MustString("OPENAI_MODEL")

	openaiCfg := openai.DefaultConfig(apiKey)
	openaiCfg.BaseURL = baseURL

	client := openai.NewClientWithConfig(openaiCfg)

	return client, modelName
}

var defaultClient *openai.Client
var defaultModelName string

func init() {
	client, modelName := getModel()
	defaultClient = client
	defaultModelName = modelName
}

var xlog = logrus.WithField("module", "ocr")

// 计算 token 费用, 返回值单位为分
func calcCost(usage openai.Usage) float64 {
	promptTokens := usage.PromptTokens
	completionTokens := usage.CompletionTokens
	inputPricePerMillion := 0.15 // 元 / 1,000,000 token
	outputPricePerMillion := 1.5 // 元 / 1,000,000 token
	inputCost := float64(promptTokens) * inputPricePerMillion / 1_000_000
	outputCost := float64(completionTokens) * outputPricePerMillion / 1_000_000
	return (inputCost + outputCost) * 100
}

func OCR(input string, base64Image string, schema *jsonschema.Schema) (*openai.ChatCompletionResponse, error) {
	resp, err := defaultClient.CreateChatCompletion(
		context.Background(),
		openai.ChatCompletionRequest{
			Model: defaultModelName,
			Messages: []openai.ChatCompletionMessage{
				{
					Role:    openai.ChatMessageRoleSystem,
					Content: "你是 OCR 工具。根据用户输入的图片，执行 OCR 后按照要求输出。遇到 OCR 失败，解释原因并让用户改写输入。 Extract the information as JSON.",
				},
				{
					Role: openai.ChatMessageRoleUser,
					// Content: input,
					MultiContent: []openai.ChatMessagePart{{
						Type: openai.ChatMessagePartTypeText,
						Text: input,
					}, {
						Type: openai.ChatMessagePartTypeImageURL,
						ImageURL: &openai.ChatMessageImageURL{
							URL: base64Image,
						},
					}},
				},
			},
			ResponseFormat: &openai.ChatCompletionResponseFormat{
				Type: openai.ChatCompletionResponseFormatTypeJSONSchema,
				JSONSchema: &openai.ChatCompletionResponseFormatJSONSchema{
					// Name:        "User",
					// Description: "User information",
					Schema: schema,
					Strict: true,
				},
			},
		},
	)

	if err != nil {
		fmt.Printf("ChatCompletion error: %v\n", err)
		return nil, err
	}

	cost := calcCost(resp.Usage)
	xlog.Infof("OCR cost: %.2f 分", cost)
	xlog.Debugf("OCR result: %s", resp.Choices[0].Message.Content)
	return &resp, nil
}

func readImageToBase64(path string) (string, error) {
	imageBytes, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}

	img, format, err := image.Decode(bytes.NewReader(imageBytes))
	if err != nil {
		return "", err
	}

	width := img.Bounds().Dx()
	height := img.Bounds().Dy()
	if width > 1000 || height > 1000 {
		maxDim := float64(width)
		if height > width {
			maxDim = float64(height)
		}
		scale := 1000.0 / maxDim
		newWidth := int(math.Round(float64(width) * scale))
		newHeight := int(math.Round(float64(height) * scale))
		if newWidth < 1 {
			newWidth = 1
		}
		if newHeight < 1 {
			newHeight = 1
		}

		img = resizeImageNearest(img, newWidth, newHeight)
		imageBytes, format, err = encodeImage(img, format)
		if err != nil {
			return "", err
		}
	} else if !isSupportedFormat(format) {
		imageBytes, format, err = encodeImage(img, "jpeg")
		if err != nil {
			return "", err
		}
	}

	imageBase64 := base64.StdEncoding.EncodeToString(imageBytes)
	return fmt.Sprintf("data:%s;base64,%s", formatToMime(format), imageBase64), nil
}

func resizeImageNearest(src image.Image, newWidth, newHeight int) image.Image {
	dst := image.NewRGBA(image.Rect(0, 0, newWidth, newHeight))
	srcBounds := src.Bounds()
	srcWidth := srcBounds.Dx()
	srcHeight := srcBounds.Dy()

	for y := 0; y < newHeight; y++ {
		srcY := srcBounds.Min.Y + (y * srcHeight / newHeight)
		for x := 0; x < newWidth; x++ {
			srcX := srcBounds.Min.X + (x * srcWidth / newWidth)
			dst.Set(x, y, src.At(srcX, srcY))
		}
	}

	return dst
}

func encodeImage(img image.Image, format string) ([]byte, string, error) {
	var buf bytes.Buffer
	switch format {
	case "jpeg", "jpg":
		if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 90}); err != nil {
			return nil, "", err
		}
		return buf.Bytes(), "jpeg", nil
	case "png":
		if err := png.Encode(&buf, img); err != nil {
			return nil, "", err
		}
		return buf.Bytes(), "png", nil
	case "gif":
		if err := gif.Encode(&buf, img, nil); err != nil {
			return nil, "", err
		}
		return buf.Bytes(), "gif", nil
	default:
		if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 90}); err != nil {
			return nil, "", err
		}
		return buf.Bytes(), "jpeg", nil
	}
}

func isSupportedFormat(format string) bool {
	return format == "jpeg" || format == "jpg" || format == "png" || format == "gif"
}

func formatToMime(format string) string {
	switch format {
	case "jpeg", "jpg":
		return "image/jpeg"
	case "png":
		return "image/png"
	case "gif":
		return "image/gif"
	default:
		return "image/jpeg"
	}
}

func toSchema(t reflect.Type) (*jsonschema.Schema, error) {
	opts := &jsonschema.ForOptions{
		IgnoreInvalidTypes: false,
		// TypeSchemas: map[reflect.Type]*jsonschema.Schema{
		// reflect.TypeFor[custom](): {Type: "custom"},
		// },
	}

	return jsonschema.ForType(t, opts)
}
