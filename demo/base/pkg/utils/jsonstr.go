package utils

// import (
// 	"fmt"
// 	"os"
// 	"path/filepath"
// 	"strings"

// 	"github.com/dop251/goja"
// 	json "github.com/json-iterator/go"
// 	"github.com/cometwk/lib/pkg/env"
// )

// func MustPrettyJsonStr(v interface{}) string {
// 	b, err := json.MarshalIndent(v, "", "  ")
// 	if err != nil {
// 		panic(err)
// 	}
// 	return string(b)
// }

// func LoadDsl(schema, id string) (map[string]interface{}, error) {
// 	return LoadDslFile(fmt.Sprintf("%s/%s.mjs", schema, id))
// }

// func LoadDslFile(filename string) (map[string]interface{}, error) {
// 	vm := goja.New()

// 	// 从文件加载 JavaScript 内容
// 	path := filepath.Join(env.MustString("DSL_DIR"), filename)
// 	jsContent, err := os.ReadFile(path)
// 	if err != nil {
// 		return nil, err
// 	}
// 	jsCode := string(jsContent)
// 	jsCode = strings.Replace(jsCode, "export default", "const value =", 1) + "; value"

// 	// 执行 JavaScript 代码
// 	value, err := vm.RunString(jsCode)
// 	if err != nil {
// 		return nil, fmt.Errorf("执行 JavaScript 出错: %v", err)
// 	}

// 	// 将结果转换为 map
// 	exported := value.Export()
// 	if exportedMap, ok := exported.(map[string]interface{}); ok {
// 		return exportedMap, nil
// 	}
// 	return nil, fmt.Errorf("无法将结果转换为 map")
// }
