package bean_test

// import (
// 	"context"
// 	"fmt"
// 	"testing"

// 	"github.com/cometwk/lib/pkg/bean"
// 	"github.com/cometwk/lib/pkg/intercept"
// 	testmock "github.com/cometwk/lib/pkg/testutil/mock"
// 	"github.com/sirupsen/logrus"
// 	"github.com/stretchr/testify/assert"
// )

// type InputStruct struct {
// 	Id     int    `json:"id"`
// 	Title  string `json:"title"`
// 	Body   string `json:"body"`
// 	UserId int    `json:"userId"`
// }

// func TestRegisterFetchBeanMethod(t *testing.T) {
// 	logger := logrus.NewEntry(logrus.New())
// 	// 创建模拟的 CommandContext
// 	mockCtx := testmock.NewMockCommandContext(logger)
// 	// mockCtx.On("Logger").Return(logger)

// 	ctx := intercept.WithCommandContext(context.Background(), mockCtx)

// 	t.Run("测试默认配置", func(t *testing.T) {
// 		bean.RegisterBean(bean.BeanNodeInfo{
// 			Bean:        "fetch",
// 			Name:        "fetch bean",
// 			Description: "fetch bean description",
// 		})

// 		bean.RegisterBeanFetchNode(bean.MethodNodeInfo{
// 			Bean:        "fetch",
// 			Method:      "PostsGet",
// 			Name:        "fetch request",
// 			Description: "fetch request details",
// 		}, bean.FetchConfig{
// 			BaseURL: "https://jsonplaceholder.typicode.com",
// 			URL:     "/posts/1",
// 			Method:  "GET",
// 		})

// 		bean.RegisterBeanFetchNode(bean.MethodNodeInfo{
// 			Bean:        "fetch",
// 			Method:      "PostsUpdate",
// 			Name:        "fetch request",
// 			Description: "fetch request details",
// 		}, bean.FetchConfig{
// 			BaseURL: "https://jsonplaceholder.typicode.com",
// 			URL:     "/posts/1",
// 			Method:  "PUT",
// 		})

// 		r, err := bean.RunNode(ctx, "fetch", "PostsGet", map[string]any{})
// 		assert.NoError(t, err)
// 		fmt.Printf("\nr1=%+v\n", r)

// 		input := &InputStruct{
// 			Id:     1,
// 			Title:  "foo",
// 			Body:   "bar",
// 			UserId: 1,
// 		}
// 		r, err = bean.RunNode(ctx, "fetch", "PostsUpdate", input)
// 		assert.NoError(t, err)
// 		fmt.Printf("\nr2=%+v\n", r)
// 	})

// 	t.Run("url params", func(t *testing.T) {
// 		bean.RegisterBean(bean.BeanNodeInfo{
// 			Bean:        "fetch",
// 			Name:        "fetch bean",
// 			Description: "fetch bean description",
// 		})

// 		bean.RegisterBeanFetchNode(bean.MethodNodeInfo{
// 			Bean:        "fetch",
// 			Method:      "PostsUpdate",
// 			Name:        "fetch request",
// 			Description: "fetch request details",
// 		}, bean.FetchConfig{
// 			BaseURL: "https://jsonplaceholder.typicode.com",
// 			URL:     "/posts/:id",
// 			Method:  "PUT",
// 		})

// 		input := &InputStruct{
// 			Id:     2,
// 			Title:  "foo",
// 			Body:   "bar",
// 			UserId: 211,
// 		}
// 		req := bean.FetchInput{
// 			Params: map[string]string{
// 				"id": "2",
// 			},
// 			Body: input,
// 		}
// 		r, err := bean.RunNode(ctx, "fetch", "PostsUpdate", req)
// 		assert.NoError(t, err)
// 		fmt.Printf("\nr1=%+v\n", r)

// 	})

// }
