package task

import (
	"context"

	"github.com/cometwk/lib/pkg/logx"
	"github.com/cometwk/lib/pkg/orm"
)

// 注册函数
func init() {
	Funcs = append(Funcs, &FuncEntry{"测试函数", "test", test})
	Funcs = append(Funcs, &FuncEntry{"测试SQL函数", "testsql", testsql})
}

func test(ctx context.Context) {
	logger := logx.LoggerWith(ctx, xlog)
	// 检查 context 是否已取消
	select {
	case <-ctx.Done():
		xlog.Warn("test task cancelled")
		return
	default:
	}
	logger.Debug("I am tester")
}

func testsql(ctx context.Context) {
	session := orm.MustSession(ctx)
	defer session.Close()
	session.Exec("SELECT 1")
}
