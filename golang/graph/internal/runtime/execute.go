package runtime

import (
	"context"
	"time"

	"github.com/lucky-byte/graph/internal/limits"
	"xorm.io/xorm"
)

// ExecuteQuery 使用 Xorm 执行参数化 SQL 并返回行映射。
func ExecuteQuery(ctx context.Context, engine *xorm.Engine, sql string, args []any) ([]map[string]interface{}, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, time.Duration(limits.QueryTimeoutSec)*time.Second)
	defer cancel()

	session := engine.Context(ctx)
	return session.SQL(sql, args...).QueryInterface()
}
