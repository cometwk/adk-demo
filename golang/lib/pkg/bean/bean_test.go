package bean

import (
	"context"
	"reflect"
	"strconv"
	"testing"

	"github.com/stretchr/testify/assert"
)

type DemoInput struct {
	Hello string `json:"hello"`
}
type DemoOutput struct {
	World string `json:"world"`
}

/*
1. type NodeFunc func(ctx context.Context, inputData any) (any, error)
2. 注册时 T = *DemoInput
3. 调用时 inputData = *DemoInput
*/
func DemoFunc(ctx context.Context, inputData *DemoInput) (*DemoOutput, error) {
	return &DemoOutput{
		World: inputData.Hello + "-123",
	}, nil
}

func strFunc(ctx context.Context, inputData string) (string, error) {
	return inputData + "-123", nil
}
func intFunc(ctx context.Context, inputData string) (int, error) {
	i, err := strconv.Atoi(inputData)
	if err != nil {
		return 0, err
	}
	return i + 123, nil
}

func NewDemoNode() {
	RegisterBean(BeanNodeInfo{
		Bean:        "bean",
		Name:        "测试组件",
		Description: "测试组件描述",
	})
	RegisterNode(MethodNodeInfo{
		Bean:        "bean",
		Method:      "demo",
		Name:        "struct method",
		Description: "测试方法描述",
	}, DemoFunc)
	RegisterNode(MethodNodeInfo{
		Bean:        "bean",
		Method:      "str",
		Name:        "string method",
		Description: "测试方法描述",
	}, strFunc)
	RegisterNode(MethodNodeInfo{
		Bean:        "bean",
		Method:      "int",
		Name:        "int method",
		Description: "测试方法描述",
	}, intFunc)
}

func TestRegister(t *testing.T) {
	NewDemoNode()

	t.Run("check struct can be converted to map[string]any", func(t *testing.T) {
		output, err := RunNode(context.Background(), "bean", "demo", map[string]any{
			"hello": "hello",
		})

		assert.NoError(t, err)
		assert.Equal(t, reflect.TypeOf(output).Kind(), reflect.Map)
		assert.Equal(t, output.(map[string]any)["world"], "hello-123")
	})
	t.Run("check string can be converted to string", func(t *testing.T) {
		output, err := RunNode(context.Background(), "bean", "str", "hello")
		assert.NoError(t, err)
		assert.Equal(t, reflect.TypeOf(output).Kind(), reflect.String)
		assert.Equal(t, output, "hello-123")
	})
	t.Run("check string can be converted to int", func(t *testing.T) {
		output, err := RunNode(context.Background(), "bean", "int", "1")
		assert.NoError(t, err)
		assert.Equal(t, reflect.TypeOf(output).Kind(), reflect.Int)
		assert.Equal(t, output, 124)
	})
}

func TestDeepConvertOutput(t *testing.T) {
	type TestStruct struct {
		Name string `json:"name"`
		Age  int    `json:"age"`
	}

	// 测试 struct slice
	input := []TestStruct{
		{Name: "Alice", Age: 30},
		{Name: "Bob", Age: 25},
	}

	result := deepConvertOutput(input)

	// 验证结果类型
	resultSlice, ok := result.([]any)
	assert.True(t, ok, "Result should be []any")
	assert.Equal(t, 2, len(resultSlice), "Result slice should have 2 elements")

	// 验证第一个元素
	firstItem, ok := resultSlice[0].(map[string]any)
	assert.True(t, ok, "First item should be map[string]any")
	assert.Equal(t, "Alice", firstItem["name"])
	assert.Equal(t, 30, firstItem["age"])

	// 验证第二个元素
	secondItem, ok := resultSlice[1].(map[string]any)
	assert.True(t, ok, "Second item should be map[string]any")
	assert.Equal(t, "Bob", secondItem["name"])
	assert.Equal(t, 25, secondItem["age"])
}

func TestDeepConvertOutputWithPointerSlice(t *testing.T) {
	type TestStruct struct {
		Name string `json:"name"`
		Age  int    `json:"age"`
	}

	// 测试 struct pointer slice
	input := []*TestStruct{
		{Name: "Alice", Age: 30},
		{Name: "Bob", Age: 25},
		nil, // 测试 nil 指针
	}

	result := deepConvertOutput(input)

	// 验证结果类型
	resultSlice, ok := result.([]any)
	assert.True(t, ok, "Result should be []any")
	assert.Equal(t, 3, len(resultSlice), "Result slice should have 3 elements")

	// 验证第一个元素
	firstItem, ok := resultSlice[0].(map[string]any)
	assert.True(t, ok, "First item should be map[string]any")
	assert.Equal(t, "Alice", firstItem["name"])
	assert.Equal(t, 30, firstItem["age"])

	// 验证 nil 元素
	assert.Nil(t, resultSlice[2], "Third item should be nil")
}

func TestDeepConvertOutputWithNestedStructs(t *testing.T) {
	type Address struct {
		Street string `json:"street"`
		City   string `json:"city"`
	}

	type Person struct {
		Name    string  `json:"name"`
		Age     int     `json:"age"`
		Address Address `json:"address"`
	}

	// 测试嵌套 struct
	input := []Person{
		{
			Name: "Alice",
			Age:  30,
			Address: Address{
				Street: "123 Main St",
				City:   "New York",
			},
		},
	}

	result := deepConvertOutput(input)

	// 验证结果类型
	resultSlice, ok := result.([]any)
	assert.True(t, ok, "Result should be []any")
	assert.Equal(t, 1, len(resultSlice), "Result slice should have 1 element")

	// 验证嵌套结构
	person, ok := resultSlice[0].(map[string]any)
	assert.True(t, ok, "Person should be map[string]any")
	assert.Equal(t, "Alice", person["name"])
	assert.Equal(t, 30, person["age"])

	address, ok := person["address"].(map[string]any)
	assert.True(t, ok, "Address should be map[string]any")
	assert.Equal(t, "123 Main St", address["street"])
	assert.Equal(t, "New York", address["city"])
}
