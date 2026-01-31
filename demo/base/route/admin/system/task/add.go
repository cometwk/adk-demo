package task

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/robfig/cron/v3"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/base/lib/task"
	"github.com/cometwk/lib/pkg/util"
)

// 添加任务
func add(c echo.Context) error {
	cc := c.(ctx.Context)

	type Body struct {
		Name    string `json:"name" validate:"required"`
		Cron    string `json:"cron" validate:"required"`
		Type    int    `json:"type"`
		Func    string `json:"func"`
		Path    string `json:"path"`
		Summary string `json:"summary"`
	}

	input := &Body{}
	if err := util.BindAndValidate(c, input); err != nil {
		return util.BadRequest(c, err)
	}
	var err error

	// 删除前后空白字符
	cc.Trim(&input.Name, &input.Cron, &input.Func, &input.Path, &input.Summary)

	// 检查任务类型
	if input.Type != 1 && input.Type != 2 {
		return c.String(http.StatusBadRequest, "任务类型无效")
	}
	if input.Type == 1 { // 内置函数，将函数名记录到 path
		input.Path = input.Func
	}
	if len(input.Path) == 0 {
		return c.String(http.StatusBadRequest, "未上传函数名或文件路径")
	}
	// 检查路径是否有效
	if err = task.IsPathValid(input.Path, input.Type); err != nil {
		cc.ErrLog(err).Error("检查路径错")
		return c.String(http.StatusBadRequest, err.Error())
	}
	// 检查 cron 表达式
	parser := cron.NewParser(
		cron.SecondOptional | cron.Minute | cron.Hour |
			cron.Dom | cron.Month | cron.Dow | cron.Descriptor,
	)
	if _, err := parser.Parse(input.Cron); err != nil {
		cc.ErrLog(err).Error("解析 cron 表达式错")
		return c.String(http.StatusBadRequest, "表达式无效: "+err.Error())
	}
	// 添加记录
	ql := `
		insert into tasks (uuid, name, cron, type, path, summary)
		values (?, ?, ?, ?, ?, ?)
	`
	u := uuid.NewString()

	err = db.ExecOneX(c, ql, u, input.Name, input.Cron, input.Type, input.Path, input.Summary)
	if err != nil {
		cc.ErrLog(err).Error("添加任务错")
		return c.NoContent(http.StatusInternalServerError)
	}
	// 添加调度
	t := db.Task{
		UUID:    u,
		Name:    input.Name,
		Summary: input.Summary,
		Cron:    input.Cron,
		Type:    input.Type,
		Path:    input.Path,
	}
	if err = task.Add(t); err != nil {
		cc.ErrLog(err).Error("添加任务调度错")
		return c.NoContent(http.StatusInternalServerError)
	}
	return c.NoContent(http.StatusOK)
}
