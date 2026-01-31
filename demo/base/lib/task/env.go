package task

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"

	"github.com/cometwk/lib/pkg/env"
)

func loadEnvAsMap(rootDir string) (map[string]string, error) {
	taskEnvFile := env.String("TASK_ENV", "task.env")
	taskEnvFile = filepath.Join(rootDir, taskEnvFile)

	// 文件不存在时返回空 map，不是错误
	if _, err := os.Stat(taskEnvFile); os.IsNotExist(err) {
		xlog.Warnf("任务环境文件不存在: %s", taskEnvFile)
		return make(map[string]string), nil
	}

	file, err := os.Open(taskEnvFile)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	result := make(map[string]string)
	scanner := bufio.NewScanner(file)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())

		// 跳过空行、注释
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		// 解析 KEY=value
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue // 忽略格式不正确的行
		}

		key := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(parts[1])

		// 去掉引号
		value = strings.Trim(value, `"'`)

		result[key] = value
	}

	return result, scanner.Err()
}
