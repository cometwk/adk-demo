package user

import (
	"bytes"
	"image/png"
	"net/http"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/auth"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/base/route/public/image"
	"github.com/labstack/echo/v4"
)

// 用户头像
func avatar(c echo.Context) error {
	cc := c.(ctx.Context)
	user := cc.User()

	// 获取上传头像文件
	file, err := c.FormFile("avatar")
	if err != nil {
		cc.ErrLog(err).Error("读取上传头像错")
		return c.NoContent(http.StatusBadRequest)
	}
	f, err := file.Open()
	if err != nil {
		cc.ErrLog(err).Error("打开上传头像错")
		return c.NoContent(http.StatusBadRequest)
	}
	defer f.Close()

	// 使用 png 编码压缩一次
	img, err := png.Decode(f)
	if err != nil {
		cc.ErrLog(err).Error("解码上传头像错")
		return c.NoContent(http.StatusBadRequest)
	}
	encoder := &png.Encoder{CompressionLevel: png.BestCompression}
	buf := new(bytes.Buffer)

	if err = encoder.Encode(buf, img); err != nil {
		cc.ErrLog(err).Error("编码上传头像错")
		return c.NoContent(http.StatusInternalServerError)
	}

	// 如果已经设置过头像，直接更新图片, avatar uuid 保持不变
	if len(user.Avatar) > 0 {
		err = image.Update(user.Avatar, buf.Bytes(), "image/png")
		if err != nil {
			cc.ErrLog(err).Error("保存上传头像错")
			return c.NoContent(http.StatusInternalServerError)
		}
		return c.String(http.StatusOK, user.Avatar)
	}
	// 保存新头像，更新用户 avatar uuid
	uuid, err := image.Insert(buf.Bytes(), "image/png")
	if err != nil {
		cc.ErrLog(err).Error("保存上传头像错")
		return c.NoContent(http.StatusInternalServerError)
	}
	ql := `update users set avatar = ? where uuid = ?`

	if err = db.ExecOne(ql, uuid, user.UUID); err != nil {
		cc.ErrLog(err).Error("更新用户头像错")
		return c.NoContent(http.StatusInternalServerError)
	}
	auth.ClearJwtCache(user.UUID)
	return c.String(http.StatusOK, uuid)
}
