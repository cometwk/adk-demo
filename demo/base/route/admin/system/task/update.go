package task

import (
	"net/http"

	"github.com/cometwk/base/ctx"
	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/base/lib/task"
	"github.com/cometwk/lib/pkg/util"
	"github.com/labstack/echo/v4"
	"github.com/robfig/cron/v3"
)

// Update 更新记录
func update(c echo.Context) error {
	cc := c.(ctx.Context)

	type Body struct {
		UUID    string `param:"id" validate:"required"`
		Name    string `json:"name" validate:"required"`
		Cron    string `json:"cron" validate:"required"`
		Type    int    `json:"type" validate:"required"`
		Func    string `json:"func"`
		Path    string `json:"path"`
		Summary string `json:"summary"`
	}
	input := &Body{}
	if err := util.BindAndValidate(c, input); err != nil {
		return util.BadRequest(c, err)
	}

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
	if err := task.IsPathValid(input.Path, input.Type); err != nil {
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

	// 更新信息
	ql := `
	update tasks set
		name = ?, summary = ?, cron = ?, type = ?, path = ?,
		update_at = current_timestamp
	where uuid = ?
`
	err := db.ExecOneX(cc, ql, input.Name, input.Summary, input.Cron, input.Type, input.Path, input.UUID)
	if err != nil {
		cc.ErrLog(err).Error("更新任务信息错")
		return c.NoContent(http.StatusInternalServerError)
	}
	// 重新查询任务信息用于调度，为了兼容 mysql 等数据库，上面不能使用 returning 子句
	ql = `select * from tasks where uuid = ?`
	var t db.Task

	if err = db.SelectOneX(cc, ql, &t, input.UUID); err != nil {
		cc.ErrLog(err).Error("查询任务信息错")
		return c.NoContent(http.StatusInternalServerError)
	}
	// 如果没有禁用的话，重新调度
	if !t.Disabled {
		if err = task.Replace(t, input.UUID); err != nil {
			cc.ErrLog(err).Error("替换任务调度错")
			return c.NoContent(http.StatusInternalServerError)
		}
	}
	return c.NoContent(http.StatusOK)
}
