package log

import (
	"errors"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"
)

type exprBuilder struct {
	params   map[string]string
	expr     string
	reverse  bool
	page     int
	pagesize int
}

func keyError(key string) {
	log.Printf("查询参数 %s 有误", key)
}

func newBuilder() *exprBuilder {
	return &exprBuilder{}
}

func (qb *exprBuilder) Where(key string, value string) *exprBuilder {

	parts := strings.Split(key, ".")
	if len(parts) != 3 {
		panic("暂不支持关联表查询条件")
	}

	column := parts[1]
	op := parts[2]

	if len(column) == 0 {
		keyError(key)
		return qb
	}

	var expr string
	switch op {
	case "eq":
		expr = fmt.Sprintf(".%s == \"%s\"", column, value)
	// case "neq":
	// 	expr = fmt.Sprintf("%s != %s", column, value)
	// case "gt":
	// 	expr = fmt.Sprintf("%s > %s", column, value)
	// case "lt":
	// 	expr = fmt.Sprintf("%s < %s", column, value)
	// case "gte":
	// 	expr = fmt.Sprintf("%s >= %s", column, value)
	// case "lte":
	// 	expr = fmt.Sprintf("%s <= %s", column, value)
	case "in":
		// select(.level | index("debug") != null or index("trace") != null)
		values := strings.Split(value, ",")
		for i, v := range values {
			values[i] = fmt.Sprintf("index(\"%s\") != null", v)
		}
		expr = fmt.Sprintf("(.%s | %s)", column, strings.Join(values, " or "))
	// case "notIn":
	// 	values := strings.Split(value, ",")
	// 	expr = fmt.Sprintf("%s not in (%s)", column, strings.Join(values, ","))

	case "like":
		expr = fmt.Sprintf("(.%s | test(\"%s\"))", column, value)
	// case "likes":
	// case "btw":
	case "time":
		// where.column.time=yyyy-mm-dd HH:MM:SS,yyyy-mm-dd HH:MM:SS
		values := strings.Split(value, ",")
		if len(values) != 2 {
			keyError(key)
			return qb
		}
		startTime, err := time.ParseInLocation("2006-01-02 15:04:05", values[0], time.Local)
		if err != nil {
			keyError(key)
			return qb
		}
		endTime, err := time.ParseInLocation("2006-01-02 15:04:05", values[1], time.Local)
		if err != nil {
			keyError(key)
			return qb
		}
		// "time": "2025-03-03T22:11:40+08:00"
		values[0] = startTime.Format(time.RFC3339)
		values[1] = endTime.Format(time.RFC3339)
		expr = fmt.Sprintf(".%s >= %s and .%s <= %s", column, values[0], column, values[1])

	default:
		keyError(key)
	}

	qb.exprAnd(expr)

	return qb
}
func (qb *exprBuilder) exprAnd(expr string) {
	if expr == "" {
		return
	}
	if qb.expr != "" {
		qb.expr = fmt.Sprintf("%s and %s", qb.expr, expr)
	} else {
		qb.expr = expr
	}
}

func (qb *exprBuilder) Bind(params map[string]string) error {
	for key, value := range params {
		if value == "" {
			continue
		}
		var expr string
		if key == "q" {
			expr = fmt.Sprintf("(.%s | test(\"%s\"))", "message", value)
		} else if strings.HasPrefix(key, "q.") {
			// q.column-1.column-2
			parts := strings.Split(key, ".")
			if len(parts) < 2 {
				continue
			}
			// 如果 column 不存在，采用 ` .column // "" `
			// 移除第一个元素 "q"，剩余的都是列名
			columns := parts[1:]
			for i, column := range columns {
				if i == 0 {
					expr = fmt.Sprintf("(.%s // \"\" | test(\"%s\"))", column, value)
				} else {
					expr = fmt.Sprintf("%s or (.%s // \"\" | test(\"%s\"))", expr, column, value)
				}
			}
			if len(columns) > 1 {
				expr = fmt.Sprintf("(%s)", expr)
			}
		}
		qb.exprAnd(expr)

		parts := strings.Split(key, ".")
		switch parts[0] {
		case "where":
			qb.Where(key, value)
		case "order":
			if strings.Contains(value, "desc") {
				// 降序
				qb.reverse = true
			}
		default:
		}
	}

	return nil
}

// cat main.log | jq -s '[.[] | select(.level == "trace")] | reverse | .[0:2]'
func (qb *exprBuilder) Build(params map[string]string) error {
	qb.params = params

	page, pagesize := 0, 10
	if p, ok := params["page"]; ok {
		page, _ = strconv.Atoi(p)
		delete(params, "page")
	}
	if ps, ok := params["pagesize"]; ok {
		pagesize, _ = strconv.Atoi(ps)
		delete(params, "pagesize")
	}
	if pagesize > 500 {
		return errors.New("pagesize 最大值 500")
	}
	qb.page = page
	qb.pagesize = pagesize

	err := qb.Bind(params)
	if err != nil {
		return err
	}

	// 处理表达式

	// cat /tmp/main.log | jq -s '[.[] | select(.level == "trace")] | reverse | .[0:10]'
	// or
	// cat /tmp/main.log | jq -s ' reverse | .[0:10]'

	expr := qb.expr
	if expr != "" {
		expr = fmt.Sprintf("[.[] | select(%s)]", expr)
	}

	if qb.reverse {
		if expr != "" {
			expr = expr + " | "
		}
		expr = expr + "reverse"
	}

	qb.expr = expr

	return nil
}

func (qb *exprBuilder) Page() string {
	expr := qb.expr

	if expr != "" {
		expr = expr + " | "
	}
	expr = fmt.Sprintf("%s .[%d:%d]", expr, qb.page*qb.pagesize, (qb.page+1)*qb.pagesize)

	return expr
}

func (qb *exprBuilder) Count() string {
	expr := qb.expr

	if expr != "" {
		expr = expr + " | "
	}
	// cat main.log | jq '[.[] | select(.level == "trace")] | length'
	expr = expr + " length"

	return expr
}
