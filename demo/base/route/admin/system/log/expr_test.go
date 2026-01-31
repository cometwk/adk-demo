package log

import (
	"net/url"
	"testing"

	"github.com/cometwk/base/pkg/utils"
)

// [.[] | select(((.message | test("x")) or (.level | test("x"))))] | reverse |  .[0:10]
// [.[] | select(((.message | test("x")) or (.level | test("x"))) and message == "error")] |  .[10:20]

func TestExprBuilder_Build(t *testing.T) {
	tests := []struct {
		name    string
		url     string
		wantErr bool
	}{
		{
			name:    "基本查询参数测试",
			url:     "http://localhost:5173/api/v1/system/log/search?page=0&pagesize=10&q.message.level=x&order=update_at.desc",
			wantErr: false,
		},
		{
			name:    "多个查询条件测试",
			url:     "http://localhost:5173/api/v1/system/log/search?page=1&pagesize=10&q.message.level=x&where.message.eq=error&order=create_at.asc",
			wantErr: false,
		},
		{
			name:    "空查询参数测试",
			url:     "http://localhost:5173/api/v1/system/log/search",
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			q, err := url.Parse(tt.url)
			if err != nil {
				t.Fatal(err)
			}
			params := utils.UrlValuesToMap(q.Query())

			qb := newBuilder()
			qb.Build(params)
			t.Logf("test case %s - qb: \n%+v", tt.name, qb.expr)
		})
	}
}
