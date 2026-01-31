package acl

import (
	"encoding/json"
	"net/http"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/orm"
	"github.com/cometwk/lib/pkg/util"
	"github.com/labstack/echo/v4"
)

func allowRemove(c echo.Context) error {
	cc := c.(ctx.Context)

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
	uuids := []string{}

	for _, v := range allows {
		uuids = append(uuids, v.UUID)
	}
	// ql := `delete from acl_allows where acl = ? and uuid in (?)`

	// ql, args, err := db.In(ql, acl, uuids)
	// if err != nil {
	// 	cc.ErrLog(err).Error("更新访问控制信息错")
	// 	return c.NoContent(http.StatusInternalServerError)
	// }

	engine := orm.MustSession(c.Request().Context())
	defer engine.Close()

	_, err = engine.Where("acl = ?", acl).In("uuid", uuids).Delete(&db.AclAllow{})
	// if err = db.Exec(ql, args...); err != nil {
	if err != nil {
		cc.ErrLog(err).Error("更新访问控制信息错")
		return c.NoContent(http.StatusInternalServerError)
	}
	return c.NoContent(http.StatusOK)
}
