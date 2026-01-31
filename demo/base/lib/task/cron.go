package task

import (
	"fmt"
	"os"

	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/env"
	"github.com/pkg/errors"
	"github.com/robfig/cron/v3"
)

type Scheduler struct {
	cron     *cron.Cron
	taskPath string
	taskEnv  map[string]string
}

var scheduler *Scheduler

// 启动任务调度
func Startup() error {
	taskdir := env.MustDirPath("TASK_DIR")
	if len(taskdir) == 0 {
		return fmt.Errorf("未配置 TASK_DIR 环境变量")
	}
	if err := os.MkdirAll(taskdir, 0o755); err != nil {
		return errors.Wrapf(err, "创建目录 '%s' 错", taskdir)
	}
	i, err := os.Stat(taskdir)
	if err != nil {
		return errors.Wrap(err, taskdir)
	}
	if !i.IsDir() {
		return fmt.Errorf("%s 不是目录", taskdir)
	}

	taskEnv, err := loadEnvAsMap(taskdir)
	if err != nil {
		return errors.Wrap(err, "加载 .env 文件错")
	}

	scheduler = &Scheduler{
		taskPath: taskdir,
		taskEnv:  taskEnv,
	}

	scheduler.cron = cron.New(
		cron.WithLogger(cron.DefaultLogger),
		cron.WithChain(
			cron.Recover(cron.DefaultLogger),
			cron.SkipIfStillRunning(cron.DefaultLogger),
		),
		cron.WithParser(cron.NewParser(
			cron.SecondOptional|cron.Minute|cron.Hour|
				cron.Dom|cron.Month|cron.Dow|cron.Descriptor,
		)),
	)

	// 查询所有任务
	ql := `select * from tasks where disabled = false`
	var tasks []db.Task

	if err = db.Select(ql, &tasks); err != nil {
		return errors.Wrap(err, "查询任务错")
	}

	// 逐个添加任务
	for _, t := range tasks {
		if t.Type != 1 && t.Type != 2 {
			return fmt.Errorf("任务'%s'的类型 %d 无效", t.Name, t.Type)
		}
		if err := Add(t); err != nil {
			return errors.Wrapf(err, "添加任务'%s'错", t.Name)
		}
	}
	// 启动
	scheduler.cron.Start()
	return nil
}

// 停止任务调度
func Stop() {
	if scheduler != nil && scheduler.cron != nil {
		scheduler.cron.Stop()
	}
}

// 运行中的任务
func Entries() []cron.Entry {
	if scheduler == nil || scheduler.cron == nil {
		return nil
	}
	return scheduler.cron.Entries()
}
