package bean

import (
	"context"
	"fmt"
	"reflect"
	"sync"

	"github.com/cometwk/lib/pkg/util"
	"github.com/pkg/errors"
	"github.com/sirupsen/logrus"
)

type NodeFunc func(ctx context.Context, inputData any) (any, error)

// type NodeFunc2[T any, O any] func(ctx context.Context, inputData T) (O, error)

// NodeResult 表示异步节点执行的结果
type NodeResult struct {
	Id     int // result 下标
	Output any
	Err    error
}

type RegisteredNode struct {
	Fn        NodeFunc
	InputType reflect.Type
}

type BeanNodeInfo struct {
	Bean        string `json:"bean"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type BeanNode struct {
	BeanNodeInfo

	methods map[string]MethodNode
}

type MethodNodeInfo struct {
	Bean        string `json:"bean"`
	Method      string `json:"method"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type MethodNode struct {
	MethodNodeInfo

	node RegisteredNode
}

var registry = map[string]BeanNode{}
var lock sync.RWMutex

func registerBean(info BeanNodeInfo) error {
	lock.Lock()
	defer lock.Unlock()

	if _, ok := registry[info.Bean]; ok {
		return fmt.Errorf("bean already registered: %s", info.Bean)
	}

	registry[info.Bean] = BeanNode{
		BeanNodeInfo: info,
		methods:      make(map[string]MethodNode),
	}

	return nil
}

func RegisterBean(info BeanNodeInfo) {
	if err := registerBean(info); err != nil {
		//panic(err)
		logrus.WithError(err).Error("register bean failed")
	}
}

// RegisterNode wraps a strongly-typed function into a generic NodeFunc
func registerNode[T any, O any](info MethodNodeInfo, fn func(ctx context.Context, input T) (O, error)) error {
	lock.Lock()
	defer lock.Unlock()

	wrapped := func(ctx context.Context, input any) (any, error) {
		t, ok := input.(T)
		if !ok {
			return nil, errors.New("invalid input type")
		}
		return fn(ctx, t)
	}
	if beanNode, ok := registry[info.Bean]; ok {
		var t T
		beanNode.methods[info.Method] = MethodNode{
			MethodNodeInfo: info,
			node: RegisteredNode{
				Fn:        wrapped,
				InputType: reflect.TypeOf(t),
			},
		}
		registry[info.Bean] = beanNode
	} else {
		return errors.New("bean not found: " + info.Bean)
	}
	return nil
}

func RegisterNode[I any, O any](info MethodNodeInfo, fn func(ctx context.Context, input I) (O, error)) {
	if err := registerNode(info, fn); err != nil {
		// panic(err)
		logrus.WithError(err).Error("register node failed")
	}
}

func Get(bean, name string) (*RegisteredNode, error) {
	lock.RLock()
	defer lock.RUnlock()

	beanNode, ok := registry[bean]
	if !ok {
		return nil, errors.New("bean not found: " + bean)
	}

	methodNode, ok := beanNode.methods[name]
	if !ok {
		return nil, errors.New("method not found: " + name)
	}
	return &methodNode.node, nil
}

func RunNode(ctx context.Context, bean, method string, input any) (any, error) {
	registered, err := Get(bean, method)
	if err != nil {
		return nil, err
	}

	inputVal := input
	if registered.InputType != nil {
		/*
			特别说明：假设 input = *T, 则
			- inputPtr = **T
			- inputPtr.Elem() = *T
			- MapToStruct(input, **T), mapstructure 会容错, 能支持 **T 和 *T 两种类型
		*/

		// 反射创建对应类型的零值指针
		inputPtr := reflect.New(registered.InputType)
		err = util.MapToStruct(input, inputPtr.Interface())
		if err != nil {
			return nil, fmt.Errorf("failed to decode input for %s.%s: %w", bean, method, err)
		}

		// 解引用成具体值（如果是 struct）
		inputVal = inputPtr.Elem().Interface()
	}
	output, err := safeCall(registered.Fn, ctx, inputVal, bean, method)
	if err != nil {
		return nil, fmt.Errorf("error running node %s: %w", bean+"."+method, err)
	}

	// 使用深度转换处理输出，支持 slice/array 中的 struct 元素
	output = deepConvertOutput(output)

	// fmt.Printf("[Output from %s] %v\n", bean+"."+method, output)
	return output, nil
}

func RunNodeAsync(ctx context.Context, bean, method string, input any, resultChan chan<- *NodeResult, id int) error {
	registered, err := Get(bean, method)
	if err != nil {
		return err
	}

	// 处理输入（与 RunNode 保持一致）
	inputVal := input
	if registered.InputType != nil {
		inputPtr := reflect.New(registered.InputType)
		err = util.MapToStruct(input, inputPtr.Interface())
		if err != nil {
			return fmt.Errorf("failed to decode input for %s: %w", bean+"."+method, err)
		}
		inputVal = inputPtr.Elem().Interface()
	} else {
		inputVal = util.MustDeepClone(input)
	}

	go func() {
		output, err := safeCall(registered.Fn, ctx, inputVal, bean, method)
		if err != nil {
			resultChan <- &NodeResult{
				Id:  id,
				Err: err,
			}
			return
		}

		// 处理输出
		output = deepConvertOutput(output)
		resultChan <- &NodeResult{
			Id:     id,
			Output: output,
		}
	}()

	return nil
}

// deepConvertOutput 递归转换输出，将所有 struct 类型转换为 map[string]any
func deepConvertOutput(input any) any {
	if input == nil {
		return nil
	}

	v := reflect.ValueOf(input)
	t := reflect.TypeOf(input)

	switch t.Kind() {
	case reflect.Struct:
		// struct 转换为 map
		return util.StructToMap(input)

	case reflect.Ptr:
		if v.IsNil() {
			return nil
		}
		if t.Elem().Kind() == reflect.Struct {
			// *struct 转换为 map
			return util.StructToMap(input)
		}
		// 其他指针类型递归处理指向的值
		return deepConvertOutput(v.Elem().Interface())

	case reflect.Slice, reflect.Array:
		// 处理 slice/array 中的元素
		length := v.Len()
		result := make([]any, length)
		for i := 0; i < length; i++ {
			result[i] = deepConvertOutput(v.Index(i).Interface())
		}
		return result

	case reflect.Map:
		// 处理 map 中的值
		result := make(map[string]any)
		for _, key := range v.MapKeys() {
			keyStr := fmt.Sprintf("%v", key.Interface())
			result[keyStr] = deepConvertOutput(v.MapIndex(key).Interface())
		}
		return result

	case reflect.Interface:
		if v.IsNil() {
			return nil
		}
		// interface{} 类型递归处理底层值
		return deepConvertOutput(v.Elem().Interface())

	default:
		// 基本类型（int, string, bool, float 等）保持不变
		return input
	}
}

// safeCall 包装函数调用，捕获 panic 并转换为 error
func safeCall(fn NodeFunc, ctx context.Context, input any, bean, method string) (any, error) {
	var output any
	var err error

	func() {
		defer func() {
			if r := recover(); r != nil {
				// 将 panic 转换为 error
				if errStr, ok := r.(string); ok {
					err = fmt.Errorf("panic in %s: %s", bean+"."+method, errStr)
				} else {
					err = fmt.Errorf("panic in %s: %v", bean+"."+method, r)
				}
			}
		}()
		output, err = fn(ctx, input)
	}()

	return output, err
}

func PrintBeans() {
	lock.RLock()
	defer lock.RUnlock()

	for bean, node := range registry {
		fmt.Printf("bean: %s\t (%s, %s)\n", bean, node.Name, node.Description)
	}
}
