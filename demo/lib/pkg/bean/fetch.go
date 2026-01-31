package bean

// import (
// 	"context"
// 	"errors"
// 	"fmt"
// 	"strings"
// 	"time"

// 	"github.com/go-zoox/fetch"
// 	// "github.com/cometwk/lib/pkg/intercept"
// )

// // feat(content-type): support json | x-www-form-urlencoded | form-data | text/plain, fallback json
// // Config is the configuration for the fetch
// type FetchConfig struct {
// 	URL     string        `json:"url"`     // support /:id/:name or  /{id}/{name}
// 	Method  string        `json:"method"`  // GET | POST | PUT | PATCH | DELETE
// 	Headers fetch.Headers `json:"headers"` // ("Content-Type"), "application/x-www-form-urlencoded"
// 	Query   fetch.Query   `json:"query"`   // query params
// 	// Body    map[string]string `json:"body"`    // form-data | x-www-form-urlencoded | text/plain, fallback json
// 	// Params  fetch.Params      `json:"params"`  // support /:id/:name or  /{id}/{name}

// 	//
// 	BaseURL string `json:"base_url"` // base url
// 	Timeout int64  `json:"timeout"`  // seconds

// 	//
// 	// `responseType` indicates the type of data that the server will respond with
// 	// options are: 'arraybuffer', 'document', 'json', 'text', 'stream'
// 	//   browser only: 'blob'
// 	ResponseType string `json:"response_type"` // default: json

// 	//
// 	// DownloadFilePath string `json:"download_file_path"`
// 	//
// 	// Proxy string `json:"proxy"`
// 	//
// 	// IsStream bool `json:"is_stream"`
// 	//
// 	// IsSession bool `json:"is_session"`
// 	//
// 	// HTTP2 bool `json:"http2"`

// 	// Context context.Context
// 	//
// 	// OnProgress fetch.OnProgress `json:"on_progress"`
// 	//
// 	// BasicAuth fetch.BasicAuth `json:"basic_auth"`
// 	//
// 	// Username string `json:"username"`
// 	// Password string `json:"password"`
// }

// type FetchInput struct {
// 	Params map[string]string `json:"params"`
// 	Body   any               `json:"body"`
// }

// // type FetchOutput struct {
// // 	Response any `json:"response"`
// // }

// func RegisterBeanFetchNode(info MethodNodeInfo, opts FetchConfig) {
// 	if opts.Timeout == 0 {
// 		opts.Timeout = 10
// 	}
// 	if opts.ResponseType == "" {
// 		opts.ResponseType = "json"
// 	} else {
// 		opts.ResponseType = strings.ToLower(opts.ResponseType)
// 		if opts.ResponseType != "json" && opts.ResponseType != "text" {
// 			panic(fmt.Errorf("invalid response type: %s", opts.ResponseType))
// 		}
// 	}

// 	httpRequest := func(ctx context.Context, input FetchInput) (any, error) {
// 		log := intercept.CommandContextFrom(ctx).Logger()

// 		cfg := &fetch.Config{
// 			URL:     opts.URL,
// 			Method:  opts.Method,
// 			Headers: opts.Headers,
// 			Query:   opts.Query,
// 			BaseURL: opts.BaseURL,
// 			Timeout: time.Duration(opts.Timeout) * time.Second,

// 			// input
// 			Context: ctx,
// 			Body:    input.Body,
// 			Params:  input.Params,
// 		}
// 		inst := fetch.New(cfg)

// 		log.Debugf("fetch: %s %s\n%v", cfg.Method, cfg.URL, cfg)

// 		response, err := inst.Execute()
// 		if err != nil {
// 			return nil, err
// 		}
// 		if !response.Ok() {
// 			log.Errorf("fetch failed: %s, %s", cfg.URL, response.Error())
// 			return nil, response.Error()
// 		}

// 		log.Errorf("fetch: %v", response)
// 		log.Errorf("fetch: %v", response.Request)

// 		switch opts.ResponseType {
// 		case "json":
// 			var result map[string]any
// 			err = response.UnmarshalJSON(&result)
// 			if err != nil {
// 				return nil, err
// 			}
// 			return result, nil
// 		case "text":
// 			return response.String(), nil
// 		default:
// 			return nil, errors.New("invalid response type")
// 		}
// 	}

// 	RegisterNode(info, httpRequest)
// }
