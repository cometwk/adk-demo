package library

import (
	"github.com/labstack/echo/v4"
	"github.com/lucky-byte/demo/biz"
)

func Attach(group *echo.Group) {
	biz.AttachQueryHandler[biz.Reader](group, "/reader")
	biz.AttachQueryHandler[biz.Author](group, "/author")
	biz.AttachQueryHandler[biz.Book](group, "/book")
	biz.AttachQueryHandler[biz.Branch](group, "/branch")
	biz.AttachQueryHandler[biz.Category](group, "/category")
	biz.AttachQueryHandler[biz.Series](group, "/series")
}
