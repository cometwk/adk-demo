package log

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/cometwk/base/pkg/utils"
	"github.com/cometwk/lib/pkg/env"
	"github.com/cometwk/lib/pkg/orm"
	"github.com/labstack/echo/v4"
)

// SearchPage 搜索带分页
func searchPage(c echo.Context) error {
	q := c.QueryParams()
	params := utils.UrlValuesToMap(q)

	qb := newBuilder()
	err := qb.Build(params)
	if err != nil {
		return err
	}

	file := env.MustString("LOG_FILE")
	if f, ok := qb.params["file"]; ok {
		file = f
		delete(qb.params, "file")
	}

	logdir := env.DirPath("LOG_DIR", "./log")
	logfile := filepath.Join(logdir, file)
	if _, err := os.Stat(logfile); os.IsNotExist(err) {
		return c.String(http.StatusNotFound, "文件不存在")
	}

	r, err := SearchLog(qb, logfile)
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, r)
}

type LogFile struct {
	Filename string    `json:"filename"`
	ModTime  time.Time `json:"mod_time"`
	Gz       bool      `json:"gz"`
}

func GetLogFiles() ([]LogFile, error) {
	logdir := env.DirPath("LOG_DIR", "./log")
	logfile := env.MustString("LOG_FILE")

	// get file ext
	ext := filepath.Ext(logfile)
	// get file name
	name := strings.TrimSuffix(logfile, ext)

	// 匹配 *.log 文件
	logFiles, err := filepath.Glob(filepath.Join(logdir, logfile))
	if err != nil {
		return nil, err
	}

	// 匹配 *.log.gz 文件
	gzFiles, err := filepath.Glob(filepath.Join(logdir, name+"*"+ext+".gz"))
	if err != nil {
		return nil, err
	}

	var logFileList []LogFile

	// 处理普通日志文件
	for _, file := range logFiles {
		fileInfo, err := os.Stat(file)
		if err != nil {
			continue // 跳过无法获取信息的文件
		}
		logFileList = append(logFileList, LogFile{
			Filename: filepath.Base(file),
			ModTime:  fileInfo.ModTime(),
			Gz:       false,
		})
	}

	// 处理 gz 日志文件，从文件名提取时间
	for _, file := range gzFiles {
		baseName := filepath.Base(file)
		// 尝试从文件名中提取时间部分，格式如：main-2025-02-27T13-40-53.861.log.gz
		timeStr := strings.TrimPrefix(baseName, name+"-")
		timeStr = strings.TrimSuffix(timeStr, ext+".gz")
		parsedTime, err := time.ParseInLocation("2006-01-02T15-04-05.000", timeStr, time.Local)
		if err != nil {
			continue
		}

		logFileList = append(logFileList, LogFile{
			Filename: baseName,
			ModTime:  parsedTime,
			Gz:       true,
		})

	}

	// 按时间排序（可选）
	sort.Slice(logFileList, func(i, j int) bool {
		return logFileList[i].ModTime.After(logFileList[j].ModTime)
	})

	return logFileList, nil
}

// 检查多个命令是否都存在
func CheckRequiredCommands() error {
	checkCmdExists := func(cmd string) bool {
		_, err := exec.LookPath(cmd)
		return err == nil
	}
	requiredCmds := []string{"jq", "cat", "zcat"}

	for _, cmd := range requiredCmds {
		if !checkCmdExists(cmd) {
			return fmt.Errorf("required command not found: %s", cmd)
		}
	}

	return nil
}

type result struct {
	orm.PageResult
	Cmdline string `json:"cmdline"`
}

func SearchLog(builder *exprBuilder, logfile string) (*result, error) {
	if err := CheckRequiredCommands(); err != nil {
		return nil, fmt.Errorf("命令检查失败: %v", err)
	}

	pageResult := &orm.PageResult{
		Page:     int64(builder.page),
		Pagesize: int64(builder.pagesize),
	}

	cat := "cat"
	if strings.HasSuffix(logfile, ".gz") {
		if runtime.GOOS == "darwin" {
			cat = "gzcat"
		} else {
			cat = "zcat"
		}
	}

	var pageCmdline string

	{
		// cat main.log | jq -s 'map(select(.level == "trace")) | sort_by(.time) | reverse | .[0:10]'
		pageCmdline = fmt.Sprintf("%s %s | jq -s '%s'", cat, logfile, builder.Page())
		// fmt.Println(pageCmdline)
		cmd := exec.Command("sh", "-c", pageCmdline)

		// 执行命令并获取输出
		output, err := cmd.Output()
		if err != nil {
			return nil, fmt.Errorf("执行命令失败: %s", pageCmdline)
		}

		var result []map[string]interface{}
		err = json.Unmarshal(output, &result)
		if err != nil {
			return nil, fmt.Errorf("解析 JSON 失败: %v", err)
		}
		pageResult.Data = result
	}

	var countCmdline string
	{
		// cat main.log | jq -s 'map(select(.level == "trace")) | sort_by(.time) | reverse | .[0:10]'
		countCmdline = fmt.Sprintf("%s %s | jq -s '%s'", cat, logfile, builder.Count())
		// fmt.Println(countCmdline)
		cmd := exec.Command("sh", "-c", countCmdline)

		// 执行命令并获取输出
		output, err := cmd.Output()
		if err != nil {
			return nil, fmt.Errorf("执行命令失败: %s", countCmdline)
		}

		var count int
		str := strings.TrimSpace(string(output))
		count, err = strconv.Atoi(str)
		if err != nil {
			return nil, fmt.Errorf("解析 count 失败: %v", err)
		}
		pageResult.Total = int64(count)
	}

	return &result{
		PageResult: *pageResult,
		Cmdline:    pageCmdline,
	}, nil
}
