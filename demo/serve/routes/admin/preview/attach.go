package preview

import (
	"github.com/cometwk/serve/pkg/s3"
	"github.com/labstack/echo/v4"
)

func PreviewAttach(attach *echo.Group) {
	e := attach.Group("/preview")
	s3 := s3.MustS3()

	e.GET("/:file_id", s3.PreviewHandler())
}
