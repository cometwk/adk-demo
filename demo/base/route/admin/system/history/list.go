package history

import (
	"fmt"
	"net/http"
	"time"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/base/pkg/bind"
	"github.com/cometwk/lib/pkg/orm"
	"github.com/cometwk/lib/pkg/util"
	"xorm.io/builder"

	"github.com/labstack/echo/v4"
	"github.com/mssola/user_agent"
)

// 查询登录历史列表
func list(c echo.Context) error {
	cc := c.(ctx.Context)

	var page, rows int
	var keyword string
	var date bind.QueryDate

	err := echo.QueryParamsBinder(c).
		MustInt("page", &page).
		MustInt("rows", &rows).
		BindUnmarshaler("date", &date).
		String("keyword", &keyword).BindError()
	if err != nil {
		return util.BadRequest(c, err)
	}
	// cc.Trim(&keyword, &date)
	cc.Trim(&keyword)

	offset := page * rows

	session := orm.MustSession(c.Request().Context())
	defer session.Close()

	pg := session.Limit(rows, offset)
	if len(keyword) > 0 {
		pg.Where(builder.Or(builder.Like{"userid", keyword}, builder.Like{"name", keyword}))
	}
	t := time.Time(date)
	if !t.IsZero() {
		te := t.AddDate(0, 0, 1).Add(-time.Millisecond)
		pg.Where(builder.Between{Col: "create_at", LessVal: t, MoreVal: te})
	}
	pg.OrderBy("create_at desc")

	var records []db.SigninHistory
	count, err := pg.FindAndCount(&records)
	if err != nil {
		cc.ErrLog(err).Error("查询登录历史信息错")
		return c.NoContent(http.StatusInternalServerError)
	}
	var list []echo.Map

	for _, h := range records {
		ua := user_agent.New(h.UA) // parse useragent string

		osinfo := ua.OSInfo()
		os := fmt.Sprintf("%s %s", osinfo.Name, osinfo.Version)

		name, version := ua.Browser()
		browser := fmt.Sprintf("%s %s", name, version)

		list = append(list, echo.Map{
			"create_at": h.CreateAt,
			"userid":    h.UserId,
			"name":      h.Name,
			"ip":        h.IP,
			"country":   h.Country,
			"province":  h.Province,
			"city":      h.City,
			"district":  h.District,
			"longitude": h.Longitude,
			"latitude":  h.Latitude,
			"os":        os,
			"browser":   browser,
			"is_mobile": ua.Mobile(),
			"trust":     h.Trust,
			"tfa":       h.TFA,
			"acttype":   h.ActType,
			"oauthp":    h.OAuthP,
		})
	}
	return c.JSON(http.StatusOK, echo.Map{"count": count, "list": list})
}
