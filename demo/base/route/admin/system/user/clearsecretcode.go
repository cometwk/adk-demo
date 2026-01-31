package user

import (
	"fmt"
	"net/http"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/util"
	"github.com/labstack/echo/v4"
)

// 清除用户安全码
func clearSecretCode(c echo.Context) error {
	cc := c.(ctx.Context)

	type Input struct {
		UUID string `json:"uuid" validate:"required"`
	}

	input := &Input{}
	if err := util.BindAndValidate(c, input); err != nil {
		return util.BadRequest(c, err)
	}

	// 检查是否可修改
	if _, err := isUpdatable(c, input.UUID); err != nil {
		cc.ErrLog(err).Error("清除用户安全码错")
		return c.NoContent(http.StatusInternalServerError)
	}
	// 清除安全操作码
	ql := `
		update users set secretcode = '', update_at = current_timestamp
		where uuid = ? and disabled = false and deleted = false
	`
	if err := db.ExecOneX(c, ql, input.UUID); err != nil {
		cc.ErrLog(err).Error("清除用户安全操作码错")
		return c.NoContent(http.StatusInternalServerError)
	}
	return c.NoContent(http.StatusOK)
}

// 是否允许修改用户信息
func isUpdatable(c echo.Context, user_uuid string) (*db.User, error) {
	ql := `select * from users where uuid = ?`
	var user db.User

	if err := db.SelectOneX(c, ql, &user, user_uuid); err != nil {
		return nil, err
	}
	// 已禁用或删除的用户不能修改信息
	if user.Disabled || user.Deleted {
		return nil, fmt.Errorf("用户已被禁用或删除，不能修改用户信息")
	}
	return &user, nil
}
