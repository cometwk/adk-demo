- 编写echo单元测试时，请阅读 `docs/ddl/*.sql` 
- 且初始化数据已经位于 `docs/data/init.sql`,  直接采用这些数据

下面是一个简单的模版, 采用 init.sql 的数据环境

```go

import (
	"net/http"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/lucky-byte/lib/pkg/testutil"
	biztestutil "github.com/lucky-byte/serve/biz/testutil"
	"github.com/stretchr/testify/assert"
	"xorm.io/xorm"
)

func setup(t *testing.T) (*echo.Echo, *xorm.Engine) {
	db := biztestutil.SetupSimpleTestDB(t)
	e := echo.New()
	Attach(e.Group(""))

	testutil.PrintRoutes(e)
	return e, db
}
func TestAttach(t *testing.T) {
	e, db := setup(t)
	defer db.Close()
	t.Run("/search", func(t *testing.T) {
		rec := testutil.Get(e, "/cmerch/search?merch_id=1", nil)
		assert.Equal(t, http.StatusOK, rec.Code)
		body, err := rec.BodyJson()
		assert.NoError(t, err)
		testutil.PrintPretty(body)
	})
}

```


