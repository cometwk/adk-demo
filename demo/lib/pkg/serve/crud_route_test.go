package serve

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/cometwk/lib/pkg/orm"
	"github.com/cometwk/lib/pkg/testutil"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type Demo struct {
	Abbr     string    `xorm:"varchar(64) pk" json:"abbr"`   // 缩写
	Name     string    `xorm:"varchar(64)" json:"name"`      // 名称
	Py       string    `xorm:"varchar(64)" json:"py"`        // 名称拼音
	Ref      string    `xorm:"varchar(64)" json:"ref"`       // 参考值
	Unit     string    `xorm:"varchar(64)" json:"unit"`      // 单位
	Explain  string    `xorm:"varchar(1024)" json:"explain"` // 医学含义
	Notes    string    `xorm:"varchar(1024)" json:"notes"`   // 备注
	CreateAt time.Time `xorm:"created" json:"created_at"`    // 创建时间
	UpdateAt time.Time `xorm:"updated" json:"updated_at"`    // 更新时间
}

func (Demo) TableName() string {
	return "p_demo"
}

var demosql = `
INSERT INTO p_demo (abbr,name,py,"ref",unit,"explain",notes,create_at,update_at) VALUES
	 ('A/A','AST/ALT','AST/ALT','0.1 - 1.9','比例','1','','2024-08-01T09:29:24.281Z','2025-02-05 03:07:00'),
	 ('A/G','白球比例','BQBL','1.20 - 2.40','比例','','','2024-08-01T09:29:24.281Z','2025-02-05 04:11:04'),
	 ('ALP','碱性磷酸酶','JXLSM','51 - 160','IU/L','','','2024-08-01T09:29:24.281Z','2022-01-04T04:55:50.000Z'),
	 ('ALT','丙氨酸氨基转移酶','BASAJZYM','< 50','IU/L','','','2024-08-01T09:29:24.281Z','2022-01-04T04:55:50.000Z'),
	 ('AUC1','药时曲线下面积','YSQXXMJ','35 - 70','mg*h/L','','','2024-08-01T09:29:24.281Z','2022-01-04T04:55:50.000Z'),
	 ('AlB/Cr','尿白蛋白/肌酐','NBDB/JG','< 30','mg/g','','','2024-08-01T09:29:24.281Z','2022-01-04T04:55:50.000Z'),
	 ('CA','钙','G','2.11 - 2.52','mmol/L','','','2024-08-01T09:29:24.281Z','2022-01-04T04:55:50.000Z'),
	 ('CHOL','胆固醇','DGC','2.80 - 5.70','mmol/L','','','2024-08-01T09:29:24.281Z','2022-01-04T04:55:50.000Z'),
	 ('CK','肌酸激酶','JSJM','19 - 226','IU/L','','','2024-08-01T09:29:24.281Z','2022-01-04T04:55:50.000Z'),
	 ('CL','氯','L','99.0 - 110.0','mmol/L','','','2024-08-01T09:29:24.281Z','2022-01-04T04:55:50.000Z');
`

func TestAttachTableRoutes(t *testing.T) {
	db := orm.InitDB("sqlite3", ":memory:")
	db.Sync2(new(Demo))
	orm.MustLoadStructModel[Demo]()
	model := orm.MustEntityOps[Demo]()

	// demo data
	_, err := db.Exec(demosql)
	require.NoError(t, err)

	e := echo.New()
	AttachCrudRoutes[Demo](e.Group(""), "p_demo")
	abbr := "ALP"

	t.Run("GET /search", func(t *testing.T) {
		rec := testutil.Get(e, "/table/p_demo/search", nil)
		assert.Equal(t, http.StatusOK, rec.Code)

		response, err := rec.BodyJson()
		assert.NoError(t, err)
		data := response["data"].([]any)
		assert.Equal(t, "A/A", data[0].(map[string]any)["abbr"])
	})

	t.Run("GET /searchWhere", func(t *testing.T) {
		rec := testutil.Get(e, "/table/p_demo/searchWhere", url.Values{
			"where.abbr.eq":   []string{"ALP"},
			"where.name.like": []string{"碱性磷酸酶"},
		})
		assert.Equal(t, http.StatusOK, rec.Code)

		response, err := rec.BodyArrayJson()
		assert.NoError(t, err)
		// testutil.PrintPretty(response)
		data := response[0]
		assert.Equal(t, "ALP", data["abbr"])
	})

	t.Run("GET /get/:id", func(t *testing.T) {
		rec := testutil.Get(e, fmt.Sprintf("/table/p_demo/get/%s", abbr), nil)
		assert.Equal(t, http.StatusOK, rec.Code)

		response, err := rec.BodyJson()
		assert.NoError(t, err)
		// testutil.PrintPretty(response)
		data := response
		assert.Equal(t, "ALP", data["abbr"])
	})

	t.Run("POST /create", func(t *testing.T) {
		body := fmt.Sprintf(`{"abbr": "%s", "name": "testname", "py": "py1", "ref": "1-100", "unit": "umol/L", "explain": "exp", "notes": "notes"}`, "xxx")
		rec := testutil.Post(e, "/table/p_demo/create", body)
		assert.Equal(t, http.StatusOK, rec.Code)

		data, err := model.Get("xxx")
		assert.NoError(t, err)
		assert.Equal(t, "testname", data.Name)
		assert.Equal(t, "py1", data.Py)

	})

	t.Run("POST /upsert", func(t *testing.T) {
		body := fmt.Sprintf(`{"abbr": "%s", "name": "save 0", "py": "py3", "ref": "1-100"}`, abbr)
		rec := testutil.Post(e, "/table/p_demo/upsert", body)
		assert.Equal(t, http.StatusOK, rec.Code)

		// get and check
		rec = testutil.Get(e, fmt.Sprintf("/table/p_demo/get/%s", abbr), nil)
		assert.Equal(t, http.StatusOK, rec.Code)

		response, err := rec.BodyJson()
		assert.NoError(t, err)
		assert.Equal(t, "save 0", response["name"])
		assert.Equal(t, "py3", response["py"])
		assert.Equal(t, "1-100", response["ref"])
	})

	t.Run("POST /update", func(t *testing.T) {
		body := fmt.Sprintf(`{"abbr": "%s", "name": "testname2", "py": "py2", "ref": "1-100"}`, abbr)
		rec := testutil.Post(e, "/table/p_demo/update", body)
		assert.Equal(t, http.StatusOK, rec.Code)

		data, err := model.Get(abbr)
		assert.NoError(t, err)
		assert.Equal(t, "testname2", data.Name)
		assert.Equal(t, "py2", data.Py)
	})

	t.Run("POST /delete", func(t *testing.T) {
		rec := testutil.Post(e, fmt.Sprintf("/table/p_demo/delete/%s", abbr), "")
		assert.Equal(t, http.StatusOK, rec.Code)

		data, err := model.Get(abbr)
		assert.NoError(t, err)
		assert.Nil(t, data)
	})

	t.Run("POST /deleteIn", func(t *testing.T) {
		ids := []string{
			url.QueryEscape("A/A"),
			url.QueryEscape("ALT"),
		}
		rec := testutil.Post(e, fmt.Sprintf("/table/p_demo/deleteIn/%s", strings.Join(ids, ",")), "")
		assert.Equal(t, http.StatusOK, rec.Code)

		data, err := model.Get("A/A")
		assert.NoError(t, err)
		assert.Nil(t, data)
		data, err = model.Get("ALT")
		assert.NoError(t, err)
		assert.Nil(t, data)
	})
}
