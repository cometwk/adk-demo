package user

import (
	"fmt"
	"net/http"
	"net/mail"
	"regexp"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/base/lib/mailfs"
	"github.com/cometwk/base/pkg/secure"
	"github.com/cometwk/lib/pkg/util"
)

func add(c echo.Context) error {
	cc := c.(ctx.Context)

	type UserForm struct {
		UserID   string `json:"userid" validate:"required"`
		Name     string `json:"name" validate:"required"`
		Password string `json:"passwd" validate:"required,min=6,max=20"`
		Mobile   string `json:"mobile" validate:"required,len=11"`
		Email    string `json:"email" validate:"omitempty,email"`
		IDNo     string `json:"idno" validate:"omitempty,len=18"`
		Address  string `json:"address"`
		SendMail bool   `json:"sendmail"`
		TFA      bool   `json:"tfa"`
		ACL      string `json:"acl" validate:"required"`
		BindNo   string `json:"bind_no" validate:"omitempty"`
		BindName string `json:"bind_name" validate:"omitempty"`
	}

	var form UserForm
	if err := util.BindAndValidate(c, &form); err != nil {
		return util.BadRequest(c, err)
	}

	// 删除前后空白字符
	cc.Trim(&form.UserID, &form.Name, &form.Password, &form.Email, &form.IDNo, &form.Mobile, &form.Address)

	// 手机尾号6位
	// form.Password = form.Mobile[len(form.Mobile)-6:]

	// 验证数据
	if !regexp.MustCompile(`^1[0-9]{10}$`).MatchString(form.Mobile) {
		return c.String(http.StatusBadRequest, "手机号格式错误")
	}
	if len(form.Email) > 0 {
		if _, err := mail.ParseAddress(form.Email); err != nil {
			cc.ErrLog(err).Error("解析邮箱地址错")
			return c.String(http.StatusBadRequest, "邮箱地址格式错误")
		}
	}
	if len(form.IDNo) > 0 {
		if !regexp.MustCompile(`^[0-9]{17}[0-9xX]$`).MatchString(form.IDNo) {
			return c.String(http.StatusBadRequest, "身份证号格式错误")
		}
	}
	// 查询 userid 是否冲突
	ql := `select count(*) from users where userid = ?`
	var count int

	if err := db.SelectOne(ql, &count, form.UserID); err != nil {
		cc.ErrLog(err).Error("查询用户信息错")
		return c.NoContent(http.StatusInternalServerError)
	}
	if count > 0 {
		return c.String(http.StatusConflict, fmt.Sprintf("%s 已存在", form.UserID))
	}

	// 添加用户
	passwdHash, err := secure.DefaultPHC().Hash(form.Password)
	if err != nil {
		cc.ErrLog(err).Error("加密密码错")
		return c.NoContent(http.StatusInternalServerError)
	}
	ql = `
		insert into users (
			uuid, userid, passwd, name, mobile, email, idno, address, tfa, acl,
			bind_no, bind_name
		)
		values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	err = db.ExecOne(
		ql, uuid.NewString(), form.UserID, passwdHash,
		form.Name, form.Mobile, form.Email, form.IDNo, form.Address, form.TFA, form.ACL,
		form.BindNo, form.BindName,
	)
	if err != nil {
		cc.ErrLog(err).Error("添加用户错")
		return c.NoContent(http.StatusInternalServerError)
	}

	// 将登录信息发送到用户邮箱
	if form.SendMail {
		m, err := mailfs.Message("登录信息", "signin", map[string]interface{}{
			"name":     form.Name,
			"userid":   form.UserID,
			"password": form.Password,
			"url":      "cc.Config().ServerHttpURL()",
		})
		if err != nil {
			cc.ErrLog(err).Error("创建邮件错")
			return c.NoContent(http.StatusInternalServerError)
		}
		addr, err := mail.ParseAddress(form.Email)
		if err != nil {
			cc.ErrLog(err).Error("解析用户邮箱错")
			return c.NoContent(http.StatusInternalServerError)
		}
		m.AddTO(addr)

		// 发送邮件
		if err = m.Send(); err != nil {
			cc.ErrLog(err).Error("发送邮件错")
			return c.NoContent(http.StatusInternalServerError)
		}
	}
	return c.NoContent(http.StatusOK)
}
