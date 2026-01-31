package user

import (
	"net/http"
	"regexp"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/util"
	"github.com/labstack/echo/v4"
)

// 修改银行账号
func bank(c echo.Context) error {
	cc := c.(ctx.Context)

	type Input struct {
		UUID     string `json:"uuid" validate:"required"`
		Name     string `json:"name" validate:"required"`
		No       string `json:"no" validate:"required"`
		Mobile   string `json:"mobile" validate:"required"`
		IDNo     string `json:"idno"`
		BankName string `json:"bank_name" validate:"required"`
	}

	input := &Input{}
	if err := util.BindAndValidate(c, input); err != nil {
		return util.BadRequest(c, err)
	}

	// 删除前后空白字符
	cc.Trim(&input.Name, &input.No, &input.IDNo, &input.Mobile, &input.BankName)

	// 验证数据
	if !regexp.MustCompile(`^[0-9]+$`).MatchString(input.No) {
		return c.String(http.StatusBadRequest, "账号格式错误")
	}
	if input.IDNo != "" && !regexp.MustCompile(`^[0-9]{17}[0-9xX]$`).MatchString(input.IDNo) {
		return c.String(http.StatusBadRequest, "身份证号格式错误")
	}
	if !regexp.MustCompile(`^1[0-9]{10}$`).MatchString(input.Mobile) {
		return c.String(http.StatusBadRequest, "手机号格式错误")
	}
	// 检查是否可修改
	if _, err := isUpdatable(c, input.UUID); err != nil {
		cc.ErrLog(err).Error("修改用户银行账号错")
		return c.NoContent(http.StatusInternalServerError)
	}
	// 更新信息
	ql := `
		update users set
			acct_name = ?, acct_no = ?, acct_idno = ?, acct_mobile = ?,
			acct_bank_name = ?,
			update_at = current_timestamp
		where uuid = ? and disabled = false and deleted = false
	`
	if err := db.ExecOneX(c, ql, input.Name, input.No, input.IDNo, input.Mobile, input.BankName, input.UUID); err != nil {
		cc.ErrLog(err).Error("更新用户银行账号错")
		return c.NoContent(http.StatusInternalServerError)
	}
	return c.NoContent(http.StatusOK)
}
