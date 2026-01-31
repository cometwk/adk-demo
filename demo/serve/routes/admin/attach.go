package admin

import (
	"github.com/cometwk/serve/routes/admin/preview"
	"github.com/labstack/echo/v4"
)

func AdminAttach(attach *echo.Group) {
	group := attach

	preview.PreviewAttach(group) // 预览文件

}
