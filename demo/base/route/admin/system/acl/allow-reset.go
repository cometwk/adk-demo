package acl

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/auth"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/orm"
	"github.com/cometwk/lib/pkg/util"
)

func reset(c echo.Context) error {
	cc := c.(ctx.Context)

	type Body struct {
		Acl    string         `json:"acl" validate:"required"`
		Allows []*db.AclAllow `json:"allows" validate:"required"`
	}

	input := &Body{}
	if err := util.BindAndValidate(c, input); err != nil {
		return err
	}

	tx := orm.MustSession(c.Request().Context())
	defer tx.Close()

	tx.Begin()

	// 确保角色ID存在
	if n, err := tx.Where("uuid = ?", input.Acl).Count(new(db.Acl)); err != nil {
		cc.ErrLog(err).Error("查询角色ID错")
		return c.NoContent(http.StatusInternalServerError)
	} else if n != 1 {
		cc.Log().Errorf("角色ID不存在: %s", input.Acl)
		return c.NoContent(http.StatusBadRequest)
	}

	// 删除原有权限
	if _, err := tx.Where("acl = ?", input.Acl).Delete(new(db.AclAllow)); err != nil {
		cc.ErrLog(err).Error("删除原有权限错")
		return c.NoContent(http.StatusInternalServerError)
	}

	if len(input.Allows) > 0 {
		// 检查输入数据
		for _, v := range input.Allows {
			v.ACL = input.Acl
		}

		// 添加新权限
		if _, err := tx.Insert(input.Allows); err != nil {
			cc.ErrLog(err).Error("添加新权限错")
			return c.NoContent(http.StatusInternalServerError)
		}
	}

	tx.Commit()

	auth.ClearAllJwtCache()
	return c.NoContent(http.StatusOK)
}
