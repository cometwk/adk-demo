package user

import (
	"net/http"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/orm"
	"github.com/cometwk/lib/pkg/util"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
)

// 绑定用户
func add(c echo.Context) error {
	cc := c.(ctx.Context)

	type Input struct {
		Node  string   `json:"node" validate:"required"`
		Force bool     `json:"force" validate:"required"`
		Users []string `json:"users" validate:"required"`
	}

	input := &Input{}
	err := util.BindAndValidate(c, input)
	if err != nil {
		return err
	}

	// 检查用户是否已经绑定到其它节点
	conflictList, err := conflict(c, input.Users)
	if err != nil {
		cc.ErrLog(err).Error("查询绑定用户冲突错")
		return c.NoContent(http.StatusInternalServerError)
	}
	// 如果有冲突，返回让用户确认
	if !input.Force {
		if len(conflictList) > 0 {
			return c.JSON(http.StatusOK, echo.Map{
				"conflict": true, "list": conflictList,
			})
		}
	}
	// 绑定用户
	ql := `insert into tree_bind (uuid, node, entity, type) values (?,?,?,1)`

	tx := orm.MustSession(c.Request().Context())
	defer tx.Close()

	for _, u := range input.Users {
		// 如果存在冲突，则先解除绑定
		for _, f := range conflictList {
			if f.Entity == u {
				ql2 := `delete from tree_bind where entity = ? and type = 1`

				res, err := tx.Exec(ql2, u)
				if err != nil {
					cc.ErrLog(err).Error("解除用户绑定错")
					return c.NoContent(http.StatusInternalServerError)
				}
				if err = db.MustAffected1Row(res); err != nil {
					cc.ErrLog(err).Error("解除用户绑定错")
					return c.NoContent(http.StatusInternalServerError)
				}
				break
			}
		}

		res, err := tx.Exec(ql, uuid.NewString(), input.Node, u)
		if err != nil {
			tx.Rollback()
			cc.ErrLog(err).Error("绑定用户错")
			return c.NoContent(http.StatusInternalServerError)
		}
		if err = db.MustAffected1Row(res); err != nil {
			tx.Rollback()
			cc.ErrLog(err).Error("绑定用户错")
			return c.NoContent(http.StatusInternalServerError)
		}
	}
	tx.Commit()

	return c.NoContent(http.StatusOK)
}
