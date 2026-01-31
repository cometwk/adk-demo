package task

import (
	"context"
	"fmt"
	"sync"

	"github.com/pkg/errors"
	"github.com/tevino/abool/v2"

	"github.com/cometwk/base/lib/db"
)

var lock sync.Mutex

// errSchedulerNotInit 调度器未初始化错误
var errSchedulerNotInit = fmt.Errorf("任务调度器未初始化")

// 检查调度器是否已初始化
func checkScheduler() error {
	if scheduler == nil || scheduler.cron == nil {
		return errSchedulerNotInit
	}
	return nil
}

// addJob 创建 Job 并添加到调度器（内部函数，需在持有锁的情况下调用）
func addJob(t db.Task) error {
	job := &Job{Task: t, Running: *abool.New()}

	if t.Type == 1 {
		f := findFunc(t.Path)
		if f == nil || f.Func == nil {
			return fmt.Errorf("未定义函数'%s'", t.Path)
		}
		job.Func = f.Func
	}

	id, err := scheduler.cron.AddJob(t.Cron, job)
	if err != nil {
		return errors.Wrapf(err, "添加任务'%s'错", t.Name)
	}
	xlog.Tracef("添加任务'%s' %d", t.Name, id)
	return nil
}

// 添加
func Add(t db.Task) error {
	lock.Lock()
	defer lock.Unlock()

	if err := checkScheduler(); err != nil {
		return err
	}

	return addJob(t)
}

// 替换
func Replace(t db.Task, uuid string) error {
	lock.Lock()
	defer lock.Unlock()

	if err := checkScheduler(); err != nil {
		return err
	}

	for _, e := range Entries() {
		job, ok := e.Job.(*Job)
		if !ok {
			continue
		}
		if job.Task.UUID == uuid {
			scheduler.cron.Remove(e.ID)
			xlog.Tracef("删除任务'%s'", job.Task.Name)
			break
		}
	}

	return addJob(t)
}

// 删除
func Remove(uuid string) error {
	lock.Lock()
	defer lock.Unlock()

	if err := checkScheduler(); err != nil {
		return err
	}

	for _, e := range Entries() {
		job, ok := e.Job.(*Job)
		if !ok {
			continue
		}
		if job.Task.UUID == uuid {
			scheduler.cron.Remove(e.ID)
			xlog.Tracef("删除任务'%s'", job.Task.Name)
			return nil
		}
	}
	// return fmt.Errorf("未找到任务")
	return nil
}

// Fire 立即执行任务（使用默认 context）
func Fire(uuid string) error {
	return FireWithContext(context.Background(), uuid)
}

// FireWithContext 带 context 立即执行任务
func FireWithContext(ctx context.Context, uuid string) error {
	lock.Lock()
	defer lock.Unlock()

	if err := checkScheduler(); err != nil {
		return err
	}

	for _, e := range Entries() {
		job, ok := e.Job.(*Job)
		if !ok {
			continue
		}
		if job.Task.UUID == uuid {
			if job.Running.IsSet() {
				return fmt.Errorf("任务正在执行中，本次调度被忽略")
			}
			go func() {
				job.RunWithContext(ctx)
			}()
			return nil
		}
	}
	return fmt.Errorf("未找到任务")
}
