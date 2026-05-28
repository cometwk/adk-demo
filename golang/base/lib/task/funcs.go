package task

import "context"

// TaskFunc 任务函数类型，支持 context
type TaskFunc func(ctx context.Context)

type FuncEntry struct {
	Name string
	Path string
	Func TaskFunc
}

var Funcs []*FuncEntry

// 查找函数
func findFunc(path string) *FuncEntry {
	for _, f := range Funcs {
		if f.Path == path {
			return f
		}
	}
	return nil
}
