package task

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/orm"
)

var testTaskPath string
var testUUID1 = "test-uuid-1"
var testUUID2 = "test-uuid-2"
var testUUID3 = "test-uuid-3"

func setupTestEnv(t *testing.T) {
	// 创建临时目录
	tmpDir := t.TempDir()
	testTaskPath = tmpDir

	// 设置环境变量
	os.Setenv("TASK_DIR", testTaskPath)
	os.Setenv("TASK_ENV", filepath.Join(testTaskPath, "task.env"))

	// 初始化数据库
	orm.InitDefaultDB()

	// 清理测试数据
	cleanupTestData(t)
}

func cleanupTestData(t *testing.T) {
	db.Exec("delete from task_inst where task_uuid in (?, ?, ?)", testUUID1, testUUID2, testUUID3)
	db.Exec("delete from tasks where uuid in (?, ?, ?)", testUUID1, testUUID2, testUUID3)
}

func teardownTest(t *testing.T) {
	if scheduler != nil {
		Stop()
	}
	cleanupTestData(t)
}

func createTestScript(t *testing.T, name string) string {
	scriptPath := filepath.Join(testTaskPath, name)
	err := os.WriteFile(scriptPath, []byte("#!/bin/sh\necho 'test output'"), 0755)
	if err != nil {
		t.Fatalf("创建测试脚本失败: %v", err)
	}
	return name
}

func TestStartup(t *testing.T) {
	setupTestEnv(t)
	defer teardownTest(t)

	t.Run("成功启动", func(t *testing.T) {
		err := Startup()
		if err != nil {
			t.Fatalf("Startup() 失败: %v", err)
		}
		defer Stop()

		if scheduler == nil {
			t.Fatal("scheduler 未初始化")
		}
		if scheduler.cron == nil {
			t.Fatal("cron 未初始化")
		}
		if scheduler.taskPath != testTaskPath {
			t.Fatalf("taskPath 不匹配: 期望 %s, 实际 %s", testTaskPath, scheduler.taskPath)
		}
	})

	t.Run("TASK_DIR 未设置", func(t *testing.T) {
		os.Unsetenv("TASK_DIR")
		defer func() {
			if r := recover(); r == nil {
				t.Fatal("期望 Startup() panic，但没有")
			}
			os.Setenv("TASK_DIR", testTaskPath)
		}()
		Startup()
	})

	t.Run("TASK_DIR 不是目录", func(t *testing.T) {
		filePath := filepath.Join(testTaskPath, "notadir")
		os.WriteFile(filePath, []byte("test"), 0644)
		os.Setenv("TASK_DIR", filePath)

		err := Startup()
		if err == nil {
			t.Fatal("期望 Startup() 返回错误，但没有")
		}
		os.Setenv("TASK_DIR", testTaskPath)
	})

	t.Run("无效任务类型", func(t *testing.T) {
		cleanupTestData(t)
		err := db.ExecOne("insert into tasks (uuid, name, cron, type, path, summary, disabled) values (?, ?, ?, ?, ?, ?, ?)",
			testUUID1, "无效任务", "0 0 * * *", 99, "test", "测试", false)
		if err != nil {
			t.Fatalf("插入测试数据失败: %v", err)
		}

		err = Startup()
		if err == nil {
			t.Fatal("期望 Startup() 返回错误，但没有")
		}
		cleanupTestData(t)
	})

	t.Run("函数路径不存在", func(t *testing.T) {
		cleanupTestData(t)
		err := db.ExecOne("insert into tasks (uuid, name, cron, type, path, summary, disabled) values (?, ?, ?, ?, ?, ?, ?)",
			testUUID1, "函数不存在", "0 0 * * *", 1, "nonexistent", "测试", false)
		if err != nil {
			t.Fatalf("插入测试数据失败: %v", err)
		}

		err = Startup()
		if err == nil {
			t.Fatal("期望 Startup() 返回错误，但没有")
		}
		cleanupTestData(t)
	})
}

func TestStop(t *testing.T) {
	setupTestEnv(t)
	defer teardownTest(t)

	t.Run("正常停止", func(t *testing.T) {
		err := Startup()
		if err != nil {
			t.Fatalf("Startup() 失败: %v", err)
		}

		Stop()
		// Stop() 应该不会 panic
	})

	t.Run("未初始化时停止", func(t *testing.T) {
		scheduler = nil
		Stop()
		// 应该不会 panic
	})
}

func TestEntries(t *testing.T) {
	setupTestEnv(t)
	defer teardownTest(t)

	t.Run("未初始化返回 nil", func(t *testing.T) {
		scheduler = nil
		entries := Entries()
		if entries != nil {
			t.Fatalf("期望返回 nil，但返回了 %v", entries)
		}
	})

	t.Run("获取任务列表", func(t *testing.T) {
		err := Startup()
		if err != nil {
			t.Fatalf("Startup() 失败: %v", err)
		}
		defer Stop()

		entries := Entries()
		if entries == nil {
			t.Fatal("Entries() 返回 nil")
		}
	})
}

func TestAdd(t *testing.T) {
	setupTestEnv(t)
	defer teardownTest(t)

	err := Startup()
	if err != nil {
		t.Fatalf("Startup() 失败: %v", err)
	}
	defer Stop()

	t.Run("添加函数任务", func(t *testing.T) {
		task := db.Task{
			UUID:    testUUID1,
			Name:    "测试函数任务",
			Cron:    "0 0 * * *",
			Type:    1,
			Path:    "test",
			Summary: "测试",
		}

		err := Add(task)
		if err != nil {
			t.Fatalf("Add() 失败: %v", err)
		}

		entries := Entries()
		found := false
		for _, e := range entries {
			if job, ok := e.Job.(*Job); ok && job.Task.UUID == testUUID1 {
				found = true
				break
			}
		}
		if !found {
			t.Fatal("任务未添加到调度器")
		}
	})

	t.Run("添加脚本任务", func(t *testing.T) {
		scriptName := createTestScript(t, "test_script.sh")
		task := db.Task{
			UUID:    testUUID2,
			Name:    "测试脚本任务",
			Cron:    "0 0 * * *",
			Type:    2,
			Path:    scriptName,
			Summary: "测试",
		}

		err := Add(task)
		if err != nil {
			t.Fatalf("Add() 失败: %v", err)
		}
	})

	t.Run("scheduler 未初始化", func(t *testing.T) {
		oldScheduler := scheduler
		scheduler = nil

		task := db.Task{
			UUID:    testUUID3,
			Name:    "测试任务",
			Cron:    "0 0 * * *",
			Type:    1,
			Path:    "test",
			Summary: "测试",
		}

		err := Add(task)
		if err == nil {
			t.Fatal("期望 Add() 返回错误，但没有")
		}

		scheduler = oldScheduler
	})

	t.Run("无效 cron 表达式", func(t *testing.T) {
		task := db.Task{
			UUID:    testUUID3,
			Name:    "测试任务",
			Cron:    "invalid cron",
			Type:    1,
			Path:    "test",
			Summary: "测试",
		}

		err := Add(task)
		if err == nil {
			t.Fatal("期望 Add() 返回错误，但没有")
		}
	})

	t.Run("函数不存在", func(t *testing.T) {
		task := db.Task{
			UUID:    testUUID3,
			Name:    "测试任务",
			Cron:    "0 0 * * *",
			Type:    1,
			Path:    "nonexistent",
			Summary: "测试",
		}

		err := Add(task)
		if err == nil {
			t.Fatal("期望 Add() 返回错误，但没有")
		}
	})
}

func TestReplace(t *testing.T) {
	setupTestEnv(t)
	defer teardownTest(t)

	err := Startup()
	if err != nil {
		t.Fatalf("Startup() 失败: %v", err)
	}
	defer Stop()

	// 先添加一个任务
	task1 := db.Task{
		UUID:    testUUID1,
		Name:    "原始任务",
		Cron:    "0 0 * * *",
		Type:    1,
		Path:    "test",
		Summary: "原始",
	}
	err = Add(task1)
	if err != nil {
		t.Fatalf("Add() 失败: %v", err)
	}

	t.Run("替换任务", func(t *testing.T) {
		task2 := db.Task{
			UUID:    testUUID1,
			Name:    "替换任务",
			Cron:    "0 1 * * *",
			Type:    1,
			Path:    "test",
			Summary: "替换",
		}

		err := Replace(task2, testUUID1)
		if err != nil {
			t.Fatalf("Replace() 失败: %v", err)
		}

		entries := Entries()
		found := false
		for _, e := range entries {
			if job, ok := e.Job.(*Job); ok && job.Task.UUID == testUUID1 {
				if job.Task.Name == "替换任务" {
					found = true
					break
				}
			}
		}
		if !found {
			t.Fatal("任务未正确替换")
		}
	})

	t.Run("替换不存在的任务", func(t *testing.T) {
		task := db.Task{
			UUID:    testUUID2,
			Name:    "新任务",
			Cron:    "0 0 * * *",
			Type:    1,
			Path:    "test",
			Summary: "测试",
		}

		err := Replace(task, testUUID2)
		if err != nil {
			t.Fatalf("Replace() 失败: %v", err)
		}
		// 应该成功添加新任务
	})

	t.Run("scheduler 未初始化", func(t *testing.T) {
		oldScheduler := scheduler
		scheduler = nil

		task := db.Task{
			UUID:    testUUID3,
			Name:    "测试任务",
			Cron:    "0 0 * * *",
			Type:    1,
			Path:    "test",
			Summary: "测试",
		}

		err := Replace(task, testUUID3)
		if err == nil {
			t.Fatal("期望 Replace() 返回错误，但没有")
		}

		scheduler = oldScheduler
	})
}

func TestRemove(t *testing.T) {
	setupTestEnv(t)
	defer teardownTest(t)

	err := Startup()
	if err != nil {
		t.Fatalf("Startup() 失败: %v", err)
	}
	defer Stop()

	// 先添加一个任务
	task := db.Task{
		UUID:    testUUID1,
		Name:    "待删除任务",
		Cron:    "0 0 * * *",
		Type:    1,
		Path:    "test",
		Summary: "测试",
	}
	err = Add(task)
	if err != nil {
		t.Fatalf("Add() 失败: %v", err)
	}

	t.Run("删除存在的任务", func(t *testing.T) {
		err := Remove(testUUID1)
		if err != nil {
			t.Fatalf("Remove() 失败: %v", err)
		}

		entries := Entries()
		for _, e := range entries {
			if job, ok := e.Job.(*Job); ok && job.Task.UUID == testUUID1 {
				t.Fatal("任务未被删除")
			}
		}
	})

	t.Run("删除不存在的任务", func(t *testing.T) {
		err := Remove("nonexistent-uuid")
		if err != nil {
			t.Fatalf("Remove() 应该返回 nil（幂等设计），但返回了错误: %v", err)
		}
	})

	t.Run("scheduler 未初始化", func(t *testing.T) {
		oldScheduler := scheduler
		scheduler = nil

		err := Remove(testUUID1)
		if err == nil {
			t.Fatal("期望 Remove() 返回错误，但没有")
		}

		scheduler = oldScheduler
	})
}

func TestFire(t *testing.T) {
	setupTestEnv(t)
	defer teardownTest(t)

	err := Startup()
	if err != nil {
		t.Fatalf("Startup() 失败: %v", err)
	}
	defer Stop()

	// 添加一个函数任务
	task := db.Task{
		UUID:    testUUID1,
		Name:    "立即执行任务",
		Cron:    "0 0 * * *",
		Type:    1,
		Path:    "test",
		Summary: "测试",
	}
	err = Add(task)
	if err != nil {
		t.Fatalf("Add() 失败: %v", err)
	}

	t.Run("立即执行任务", func(t *testing.T) {
		err := Fire(testUUID1)
		if err != nil {
			t.Fatalf("Fire() 失败: %v", err)
		}

		// 等待任务执行完成
		time.Sleep(500 * time.Millisecond)

		// 验证任务实例已创建
		var count int
		err = db.SelectOne("select count(*) from task_inst where task_uuid = ?", &count, testUUID1)
		if err != nil {
			t.Fatalf("查询任务实例失败: %v", err)
		}
		if count == 0 {
			t.Fatal("任务实例未创建")
		}
	})

	t.Run("执行不存在的任务", func(t *testing.T) {
		err := Fire("nonexistent-uuid")
		if err == nil {
			t.Fatal("期望 Fire() 返回错误，但没有")
		}
	})

	t.Run("scheduler 未初始化", func(t *testing.T) {
		oldScheduler := scheduler
		scheduler = nil

		err := Fire(testUUID1)
		if err == nil {
			t.Fatal("期望 Fire() 返回错误，但没有")
		}

		scheduler = oldScheduler
	})

	t.Run("任务正在执行中", func(t *testing.T) {
		// 添加一个长时间运行的任务函数
		longRunningFunc := func(ctx context.Context) {
			time.Sleep(2 * time.Second)
		}
		Funcs = append(Funcs, &FuncEntry{
			Name: "长时间运行任务",
			Path: "longrunning",
			Func: longRunningFunc,
		})

		longTask := db.Task{
			UUID:    testUUID2,
			Name:    "长时间运行任务",
			Cron:    "0 0 * * *",
			Type:    1,
			Path:    "longrunning",
			Summary: "测试",
		}
		err = Add(longTask)
		if err != nil {
			t.Fatalf("Add() 失败: %v", err)
		}

		// 第一次执行
		err = Fire(testUUID2)
		if err != nil {
			t.Fatalf("第一次 Fire() 失败: %v", err)
		}

		// 立即再次执行，应该被忽略
		time.Sleep(100 * time.Millisecond)
		err = Fire(testUUID2)
		if err == nil {
			t.Fatal("期望 Fire() 返回错误（任务正在执行），但没有")
		}

		// 等待任务完成
		time.Sleep(2 * time.Second)
	})
}

func TestFireWithContext(t *testing.T) {
	setupTestEnv(t)
	defer teardownTest(t)

	err := Startup()
	if err != nil {
		t.Fatalf("Startup() 失败: %v", err)
	}
	defer Stop()

	// 添加一个任务
	task := db.Task{
		UUID:    testUUID1,
		Name:    "带 context 的任务",
		Cron:    "0 0 * * *",
		Type:    1,
		Path:    "test",
		Summary: "测试",
	}
	err = Add(task)
	if err != nil {
		t.Fatalf("Add() 失败: %v", err)
	}

	t.Run("使用已取消的 context", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		cancel() // 立即取消

		err := FireWithContext(ctx, testUUID1)
		if err != nil {
			t.Fatalf("FireWithContext() 失败: %v", err)
		}

		// 等待任务执行
		time.Sleep(500 * time.Millisecond)
		// 任务应该检测到 context 已取消并提前返回
	})

	t.Run("使用带超时的 context", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
		defer cancel()

		err := FireWithContext(ctx, testUUID1)
		if err != nil {
			t.Fatalf("FireWithContext() 失败: %v", err)
		}

		time.Sleep(200 * time.Millisecond)
	})
}

func TestJob_Run(t *testing.T) {
	setupTestEnv(t)
	defer teardownTest(t)

	err := Startup()
	if err != nil {
		t.Fatalf("Startup() 失败: %v", err)
	}
	defer Stop()

	t.Run("执行函数任务", func(t *testing.T) {
		task := db.Task{
			UUID:    testUUID1,
			Name:    "Job 测试任务",
			Cron:    "0 0 * * *",
			Type:    1,
			Path:    "test",
			Summary: "测试",
		}

		job := &Job{
			Task: task,
			Func: func(ctx context.Context) {
				// 测试函数
			},
		}

		job.Run()
		time.Sleep(200 * time.Millisecond)

		// 验证任务实例已创建
		var count int
		err = db.SelectOne("select count(*) from task_inst where task_uuid = ?", &count, testUUID1)
		if err != nil {
			t.Fatalf("查询任务实例失败: %v", err)
		}
		if count == 0 {
			t.Fatal("任务实例未创建")
		}
	})

	t.Run("并发执行保护", func(t *testing.T) {
		task := db.Task{
			UUID:    testUUID2,
			Name:    "并发测试任务",
			Cron:    "0 0 * * *",
			Type:    1,
			Path:    "test",
			Summary: "测试",
		}

		job := &Job{
			Task: task,
			Func: func(ctx context.Context) {
				time.Sleep(500 * time.Millisecond)
			},
		}

		// 并发执行
		done := make(chan bool, 2)
		go func() {
			job.Run()
			done <- true
		}()
		go func() {
			time.Sleep(50 * time.Millisecond)
			job.Run()
			done <- true
		}()

		<-done
		<-done
		time.Sleep(200 * time.Millisecond)

		// 应该只有一个任务实例（第二个被忽略）
		var count int
		err = db.SelectOne("select count(*) from task_inst where task_uuid = ?", &count, testUUID2)
		if err != nil {
			t.Fatalf("查询任务实例失败: %v", err)
		}
		if count != 1 {
			t.Fatalf("期望 1 个任务实例，但得到 %d", count)
		}
	})
}

func TestJob_RunWithContext(t *testing.T) {
	setupTestEnv(t)
	defer teardownTest(t)

	err := Startup()
	if err != nil {
		t.Fatalf("Startup() 失败: %v", err)
	}
	defer Stop()

	t.Run("context 取消", func(t *testing.T) {
		task := db.Task{
			UUID:    testUUID1,
			Name:    "Context 取消测试",
			Cron:    "0 0 * * *",
			Type:    1,
			Path:    "test",
			Summary: "测试",
		}

		ctx, cancel := context.WithCancel(context.Background())
		cancel() // 立即取消

		job := &Job{
			Task: task,
			Func: func(ctx context.Context) {
				select {
				case <-ctx.Done():
					return
				case <-time.After(1 * time.Second):
				}
			},
		}

		job.RunWithContext(ctx)
		time.Sleep(200 * time.Millisecond)
	})
}

func TestLoadEnvAsMap(t *testing.T) {
	setupTestEnv(t)
	defer teardownTest(t)

	t.Run("文件不存在返回空 map", func(t *testing.T) {
		os.Unsetenv("TASK_ENV")
		envMap, err := loadEnvAsMap(testTaskPath)
		if err != nil {
			t.Fatalf("loadEnvAsMap() 失败: %v", err)
		}
		if envMap == nil {
			t.Fatal("返回了 nil map")
		}
		if len(envMap) != 0 {
			t.Fatalf("期望空 map，但得到 %d 个条目", len(envMap))
		}
	})

	t.Run("解析有效的 env 文件", func(t *testing.T) {
		envFile := filepath.Join(testTaskPath, "task.env")
		content := `KEY1=value1
KEY2=value2
# 这是注释
KEY3="value with spaces"
KEY4='value4'
`
		err := os.WriteFile(envFile, []byte(content), 0644)
		if err != nil {
			t.Fatalf("创建 env 文件失败: %v", err)
		}

		envMap, err := loadEnvAsMap(testTaskPath)
		if err != nil {
			t.Fatalf("loadEnvAsMap() 失败: %v", err)
		}

		if envMap["KEY1"] != "value1" {
			t.Fatalf("KEY1 值不匹配: 期望 value1, 实际 %s", envMap["KEY1"])
		}
		if envMap["KEY2"] != "value2" {
			t.Fatalf("KEY2 值不匹配")
		}
		if envMap["KEY3"] != "value with spaces" {
			t.Fatalf("KEY3 值不匹配: 期望 'value with spaces', 实际 %s", envMap["KEY3"])
		}
		if envMap["KEY4"] != "value4" {
			t.Fatalf("KEY4 值不匹配")
		}
	})

	t.Run("使用自定义 TASK_ENV", func(t *testing.T) {
		customEnvFile := filepath.Join(testTaskPath, "custom.env")
		content := "CUSTOM_KEY=custom_value"
		err := os.WriteFile(customEnvFile, []byte(content), 0644)
		if err != nil {
			t.Fatalf("创建自定义 env 文件失败: %v", err)
		}

		os.Setenv("TASK_ENV", customEnvFile)
		envMap, err := loadEnvAsMap(testTaskPath)
		if err != nil {
			t.Fatalf("loadEnvAsMap() 失败: %v", err)
		}

		if envMap["CUSTOM_KEY"] != "custom_value" {
			t.Fatalf("CUSTOM_KEY 值不匹配")
		}

		os.Unsetenv("TASK_ENV")
	})

	t.Run("忽略格式不正确的行", func(t *testing.T) {
		envFile := filepath.Join(testTaskPath, "task.env")
		content := `VALID_KEY=valid_value
INVALID_LINE
ANOTHER_VALID=another_value
`
		err := os.WriteFile(envFile, []byte(content), 0644)
		if err != nil {
			t.Fatalf("创建 env 文件失败: %v", err)
		}

		envMap, err := loadEnvAsMap(testTaskPath)
		if err != nil {
			t.Fatalf("loadEnvAsMap() 失败: %v", err)
		}

		if envMap["VALID_KEY"] != "valid_value" {
			t.Fatal("VALID_KEY 未正确解析")
		}
		if envMap["ANOTHER_VALID"] != "another_value" {
			t.Fatal("ANOTHER_VALID 未正确解析")
		}
		if _, exists := envMap["INVALID_LINE"]; exists {
			t.Fatal("INVALID_LINE 不应该被解析")
		}
	})
}

func TestIsPathValid(t *testing.T) {
	setupTestEnv(t)
	defer teardownTest(t)

	err := Startup()
	if err != nil {
		t.Fatalf("Startup() 失败: %v", err)
	}
	defer Stop()

	t.Run("有效的函数路径", func(t *testing.T) {
		err := IsPathValid("test", 1)
		if err != nil {
			t.Fatalf("IsPathValid() 失败: %v", err)
		}
	})

	t.Run("无效的函数路径", func(t *testing.T) {
		err := IsPathValid("nonexistent", 1)
		if err == nil {
			t.Fatal("期望 IsPathValid() 返回错误，但没有")
		}
	})

	t.Run("有效的脚本路径", func(t *testing.T) {
		scriptName := createTestScript(t, "valid_script.sh")
		err := IsPathValid(scriptName, 2)
		if err != nil {
			t.Fatalf("IsPathValid() 失败: %v", err)
		}
	})

	t.Run("脚本文件不存在", func(t *testing.T) {
		err := IsPathValid("nonexistent.sh", 2)
		if err == nil {
			t.Fatal("期望 IsPathValid() 返回错误，但没有")
		}
	})

	t.Run("脚本是目录", func(t *testing.T) {
		dirPath := filepath.Join(testTaskPath, "adir")
		os.Mkdir(dirPath, 0755)
		err := IsPathValid("adir", 2)
		if err == nil {
			t.Fatal("期望 IsPathValid() 返回错误，但没有")
		}
	})

	t.Run("脚本不可执行", func(t *testing.T) {
		scriptPath := filepath.Join(testTaskPath, "noexec.sh")
		os.WriteFile(scriptPath, []byte("#!/bin/sh"), 0644)
		err := IsPathValid("noexec.sh", 2)
		if err == nil {
			t.Fatal("期望 IsPathValid() 返回错误，但没有")
		}
	})

	t.Run("scheduler 未初始化", func(t *testing.T) {
		oldScheduler := scheduler
		scheduler = nil

		err := IsPathValid("test.sh", 2)
		if err == nil {
			t.Fatal("期望 IsPathValid() 返回错误，但没有")
		}

		scheduler = oldScheduler
	})

	t.Run("绝对路径脚本", func(t *testing.T) {
		scriptPath := filepath.Join(testTaskPath, "abs_script.sh")
		os.WriteFile(scriptPath, []byte("#!/bin/sh"), 0755)
		err := IsPathValid(scriptPath, 2)
		if err != nil {
			t.Fatalf("IsPathValid() 失败: %v", err)
		}
	})
}

func TestFindFunc(t *testing.T) {
	t.Run("找到函数", func(t *testing.T) {
		f := findFunc("test")
		if f == nil {
			t.Fatal("未找到 test 函数")
		}
		if f.Path != "test" {
			t.Fatalf("函数路径不匹配: 期望 test, 实际 %s", f.Path)
		}
	})

	t.Run("未找到函数", func(t *testing.T) {
		f := findFunc("nonexistent")
		if f != nil {
			t.Fatal("不应该找到 nonexistent 函数")
		}
	})
}

func TestJob_RunCommand(t *testing.T) {
	setupTestEnv(t)
	defer teardownTest(t)

	err := Startup()
	if err != nil {
		t.Fatalf("Startup() 失败: %v", err)
	}
	defer Stop()

	t.Run("执行成功", func(t *testing.T) {
		scriptName := createTestScript(t, "success_script.sh")
		task := db.Task{
			UUID:    testUUID1,
			Name:    "成功脚本",
			Cron:    "0 0 * * *",
			Type:    2,
			Path:    scriptName,
			Summary: "测试",
		}

		job := &Job{Task: task}
		output, err := job.runCommand(context.Background(), xlog)
		if err != nil {
			t.Fatalf("runCommand() 失败: %v", err)
		}
		if output == "" {
			t.Fatal("脚本输出为空")
		}
	})

	t.Run("scheduler 未初始化", func(t *testing.T) {
		oldScheduler := scheduler
		scheduler = nil

		task := db.Task{
			UUID:    testUUID2,
			Name:    "测试脚本",
			Cron:    "0 0 * * *",
			Type:    2,
			Path:    "test.sh",
			Summary: "测试",
		}

		job := &Job{Task: task}
		_, err := job.runCommand(context.Background(), xlog)
		if err == nil {
			t.Fatal("期望 runCommand() 返回错误，但没有")
		}

		scheduler = oldScheduler
	})

	t.Run("命令超时", func(t *testing.T) {
		// 创建一个长时间运行的脚本
		scriptPath := filepath.Join(testTaskPath, "timeout_script.sh")
		scriptContent := `#!/bin/sh
sleep 5
echo "done"
`
		os.WriteFile(scriptPath, []byte(scriptContent), 0755)

		task := db.Task{
			UUID:    testUUID3,
			Name:    "超时脚本",
			Cron:    "0 0 * * *",
			Type:    2,
			Path:    "timeout_script.sh",
			Summary: "测试",
		}

		job := &Job{Task: task}
		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancel()

		_, err := job.runCommand(ctx, xlog)
		if err == nil {
			t.Fatal("期望 runCommand() 返回超时错误，但没有")
		}
	})

	t.Run("命令被取消", func(t *testing.T) {
		scriptName := createTestScript(t, "cancel_script.sh")
		task := db.Task{
			UUID:    testUUID2,
			Name:    "取消脚本",
			Cron:    "0 0 * * *",
			Type:    2,
			Path:    scriptName,
			Summary: "测试",
		}

		job := &Job{Task: task}
		ctx, cancel := context.WithCancel(context.Background())
		cancel() // 立即取消

		_, err := job.runCommand(ctx, xlog)
		if err == nil {
			t.Fatal("期望 runCommand() 返回取消错误，但没有")
		}
	})

	t.Run("带参数的命令", func(t *testing.T) {
		scriptName := createTestScript(t, "arg_script.sh")
		task := db.Task{
			UUID:    testUUID1,
			Name:    "参数脚本",
			Cron:    "0 0 * * *",
			Type:    2,
			Path:    fmt.Sprintf("%s arg1 arg2", scriptName),
			Summary: "测试",
		}

		job := &Job{Task: task}
		_, err := job.runCommand(context.Background(), xlog)
		// 脚本可能不支持参数，所以这里只检查不会 panic
		if err != nil {
			t.Logf("runCommand() 返回错误（可能是预期的）: %v", err)
		}
	})
}
