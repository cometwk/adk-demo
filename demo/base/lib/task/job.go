package task

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path"
	"strings"
	"syscall"
	"time"

	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/env"
	"github.com/cometwk/lib/pkg/orm"
	"github.com/cometwk/lib/pkg/util"
	"github.com/sirupsen/logrus"
	"github.com/tevino/abool/v2"
)

// 命令执行超时时间（默认30分钟）
const defaultCommandTimeout = 30 * time.Minute

var xlog = logrus.WithField("module", "task")

type Job struct {
	Task    db.Task
	Func    func(ctx context.Context) // 支持 context 的函数类型
	Timeout time.Duration             // 任务执行超时时间
	Running abool.AtomicBool
}

// Run 实现 cron.Job 接口，使用默认 context
func (j *Job) Run() {
	timeout := j.Timeout
	if timeout == 0 {
		timeout = defaultCommandTimeout
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	j.RunWithContext(ctx)
}

// RunWithContext 带 context 执行任务
func (j *Job) RunWithContext(ctx context.Context) {
	instUUID := util.NextId("T")
	ctx = orm.WithReqID(ctx, instUUID)

	session := orm.MustSession(ctx)
	defer session.Close()

	log := xlog.WithField("task", j.Task.Name).WithField("reqid", instUUID)

	if !j.Running.SetToIf(false, true) {
		log.Infof("任务'%s'正在执行中，本次调度被忽略", j.Task.Name)
		return
	}
	defer j.Running.UnSet()

	// 检查 context 是否已取消
	if ctx.Err() != nil {
		log.WithError(ctx.Err()).Warnf("任务'%s'执行前 context 已取消", j.Task.Name)
		return
	}

	err := db.ExecOneTX(session, "insert into task_inst (uuid, task_uuid, task_name, task_type, message) values (?, ?, ?, ?, ?)", instUUID, j.Task.UUID, j.Task.Name, j.Task.Type, "")
	if err != nil {
		log.WithError(err).Error("插入任务实例错")
		return
	}

	now := time.Now()
	var jobErr error
	var jobOut string
	if j.Task.Type == 1 {
		if j.Func == nil {
			log.Errorf("任务'%s'未定义函数", j.Task.Name)
			jobErr = fmt.Errorf("任务'%s'未定义函数", j.Task.Name)
		} else {
			j.Func(ctx)
		}
	} else {
		jobOut, jobErr = j.runCommand(ctx, log)
	}
	if jobErr != nil {
		log.WithError(jobErr).Errorf("任务'%s'执行错", j.Task.Name)
	}
	if jobOut != "" {
		log.Infof("任务'%s'输出: %s", j.Task.Name, jobOut)
	}

	elapsed := time.Since(now).Milliseconds()

	log.Debugf("任务 %s 执行完成，耗时 %d 毫秒", j.Task.Name, elapsed)
	if elapsed > 300 {
		log.Warnf("任务 %s 执行耗时 %d 毫秒", j.Task.Name, elapsed)
	}
	ql := `
		update tasks set nfire = nfire + 1, last_fire = current_timestamp
		where uuid = ?
	`
	if err := db.ExecOneTX(session, ql, j.Task.UUID); err != nil {
		log.WithError(err).Error("更新任务运行次数错")
	}

	ql = `
		update task_inst set code = ?, message = ?, elapsed = ?
		where uuid = ?
	`
	code := 200
	if jobErr != nil {
		code = 500
	}
	message := jobOut
	if jobErr != nil {
		message = jobErr.Error()
	}
	if err := db.ExecOneTX(session, ql, code, message, elapsed, instUUID); err != nil {
		log.WithError(err).Error("更新任务实例输出错")
	}
}

// 运行命令
func (j *Job) runCommand(ctx context.Context, log *logrus.Entry) (string, error) {
	// 检查 scheduler 是否已初始化
	if scheduler == nil {
		return "", fmt.Errorf("任务调度器未初始化")
	}

	args := strings.Fields(j.Task.Path)
	command := args[0]

	if !path.IsAbs(command) {
		command = path.Join(scheduler.taskPath, command)
	}
	i, err := os.Stat(command)
	if err != nil {
		log.WithError(err).Errorf("执行任务'%s'错", j.Task.Name)
		return "", err
	}
	if i.IsDir() {
		log.Errorf("%s 是一个目录，不能执行", command)
		return "", fmt.Errorf("%s 是一个目录，不能执行", command)
	}
	if i.Mode().Perm()&0100 == 0 {
		log.Errorf("%s 不是可执行文件，需要添加执行权限", command)
		return "", fmt.Errorf("%s 不是可执行文件，需要添加执行权限", command)
	}

	// 使用传入的 context 或添加默认超时
	execCtx, cancel := context.WithTimeout(ctx, defaultCommandTimeout)
	defer cancel()

	var cmd *exec.Cmd

	// 支持命令行选项
	if len(args) == 1 {
		cmd = exec.CommandContext(execCtx, command)
	} else {
		cmd = exec.CommandContext(execCtx, command, args[1:]...)
	}

	// 启用新的进程组，避免信号污染
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true, Pgid: 0}

	// 设置环境变量
	dsn := env.MustString("DB_URL")
	cmd.Env = append(os.Environ(), fmt.Sprintf("DSN=%s", dsn))

	envs := scheduler.taskEnv
	for k, v := range envs {
		s := fmt.Sprintf("%s=%s", strings.ToUpper(k), v)
		cmd.Env = append(cmd.Env, s)
	}

	// 执行命令
	out, err := cmd.CombinedOutput()
	if err != nil {
		if execCtx.Err() == context.DeadlineExceeded {
			log.WithField("name", j.Task.Name).
				WithField("path", j.Task.Path).
				Errorf("任务执行超时（超过 %v）", defaultCommandTimeout)
			return "", fmt.Errorf("任务执行超时（超过 %v）", defaultCommandTimeout)
		}
		if execCtx.Err() == context.Canceled {
			log.WithField("name", j.Task.Name).
				WithField("path", j.Task.Path).
				Warnf("任务执行被取消")
			return "", fmt.Errorf("任务执行被取消")
		}
		log.WithError(err).
			WithField("name", j.Task.Name).
			WithField("path", j.Task.Path).Error("执行任务错")
		return "", err
	}
	log.Infof("任务'%s'[%s]输出: %s", j.Task.Name, j.Task.Path, out)

	return string(out), nil
}
