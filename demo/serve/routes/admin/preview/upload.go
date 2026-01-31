package preview

import (
	"errors"
	"net/http"
	"strings"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/serve/pkg/s3"
	"github.com/labstack/echo/v4"
)

const maxUploadSize = 10 << 20 // 10MB

func upload(c echo.Context) error {
	cc := c.(ctx.Context)
	ctx := c.Request().Context()

	s := s3.MustS3()

	fh, err := c.FormFile("file")
	if err != nil {
		return c.String(http.StatusBadRequest, "上传文件缺失")
	}
	// 限制文件大小（不含 multipart 边界开销）
	if fh.Size > maxUploadSize {
		return c.String(http.StatusBadRequest, "文件大小超过10M限制")
	}
	src, err := fh.Open()
	if err != nil {
		cc.ErrLog(err).Error("读取上传文件失败")
		return c.String(http.StatusInternalServerError, "读取上传文件失败")
	}
	defer src.Close()

	mimeType := fh.Header.Get("Content-Type")
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	fileID, _, err := s.Upload(ctx, src, fh.Filename, mimeType)
	if err != nil {
		var httpErr *echo.HTTPError
		if errors.As(err, &httpErr) {
			errMsg, ok := httpErr.Message.(string)
			if !ok || strings.TrimSpace(errMsg) == "" {
				errMsg = "保存上传文件失败"
			}
			return c.JSON(http.StatusOK, echo.Map{"code": 1, "error": errMsg})
		}
		cc.ErrLog(err).Error("保存上传文件失败")
		return c.JSON(http.StatusOK, echo.Map{"code": 1, "error": "保存上传文件失败"})
	}
	type Output struct {
		FileID int64 `json:"file_id,string"`
	}
	return c.JSON(200, Output{
		FileID: fileID,
	})
}
