package job

import (
	"github.com/labstack/echo/v4"
)

func Attach(up *echo.Group, code int) {
	group := up.Group("/job")
	historyGroup := up.Group("/job_history")

	jobAttach(group)
	historyAttach(historyGroup)
}
