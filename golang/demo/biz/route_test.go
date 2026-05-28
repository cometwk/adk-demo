package biz_test

import (
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/lucky-byte/demo/biz"
	biztestutil "github.com/lucky-byte/demo/biz/testutil"
	"github.com/lucky-byte/lib/pkg/serve"
	"github.com/lucky-byte/lib/pkg/testutil"
	"github.com/stretchr/testify/assert"
	"xorm.io/xorm"
)

func setup() (*echo.Echo, *xorm.Engine) {
	db := biztestutil.UseTestDB()
	e := serve.EchoTestSetup()
	biz.AttachQueryHandler[biz.OrderDaily](e.Group("admin"), "/order_daily")

	testutil.PrintRoutes(e)
	return e, db
}
func TestSearch(t *testing.T) {
	_, db := setup()
	defer db.Close()

	t.Run("search bound", func(t *testing.T) {
		// rec := testutil.Get(e, "/admin/order_daily/aggregate?where.merch_no.eq=105000059769492&metrics=sum(total_count).total_count,sum(total_amount).total_amount&group_by=report_date&order=report_date.desc", nil)
		// assert.Equal(t, http.StatusOK, rec.Code)

		// body, err := rec.BodyJson()
		// assert.NoError(t, err)
		// testutil.PrintPretty(body)

		engine := db
		tables, err := engine.DBMetas()
		assert.NoError(t, err)
		testutil.PrintPretty(tables)
	})

}
