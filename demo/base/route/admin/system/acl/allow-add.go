package acl

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/orm"
	"github.com/cometwk/lib/pkg/util"
)

func allowAdd(c echo.Context) error {
	cc := c.(ctx.Context)
	engine := orm.MustSession(c.Request().Context())
	defer engine.Close()

	var acl, entries string

	err := echo.FormFieldBinder(c).
		MustString("acl", &acl).
		MustString("entries", &entries).BindError()
	if err != nil {
		return util.BadRequest(c, err)
	}
	var allows []db.AclAllow

	if err = json.Unmarshal([]byte(entries), &allows); err != nil {
		cc.ErrLog(err).Error("解析 entries 错")
		return c.NoContent(http.StatusBadRequest)
	}
	codes := []int{}

	for _, v := range allows {
		codes = append(codes, v.Code)
	}

	count, err := engine.In("code", codes).And("acl = ?", acl).Count(&db.AclAllow{})
	if err != nil {
		cc.ErrLog(err).Error("查询访问控制信息错")
		return c.NoContent(http.StatusInternalServerError)
	}

	if count > 0 {
		return c.String(http.StatusConflict, "代码重复")
	}
	{
		tx := orm.MustSession(c.Request().Context())
		defer tx.Close()

		err = tx.Begin()
		if err != nil {
			cc.ErrLog(err).Error("开启数据库事务错")
			return c.NoContent(http.StatusInternalServerError)
		}
		for _, v := range allows {
			ql := `
				insert into acl_allows (uuid, acl, code, title, url)
				values (?, ?, ?, ?, ?)
			`
			_, err = tx.Exec(ql, uuid.NewString(), acl, v.Code, v.Title, v.URL)
			if err != nil {
				cc.ErrLog(err).Error("更新访问控制信息错")
				tx.Rollback()
				return c.NoContent(http.StatusInternalServerError)
			}
		}
		tx.Commit()
	}

	return c.NoContent(http.StatusOK)
}
