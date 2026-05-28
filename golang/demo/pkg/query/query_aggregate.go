package query

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/pkg/errors"
	"xorm.io/builder"
	"xorm.io/xorm"
)

type AggregateOptions struct {
	TableName        string   // 表名, 用于处理联表查询, 强制添加 table#field 到sql中
	WhereWhitelist   []string // Where 列名白名单
	GroupByWhitelist []string // GroupBy 列名白名单
	MetricsWhitelist []string // Metrics 字段白名单
	QWhitelist       []string // Q 列名白名单
}

type metricDef struct {
	funcName string
	field    string
	alias    string
	sqlExpr  string
}

type aggregateQueryBuilder struct {
	inner         *queryBuilder
	Options       AggregateOptions
	Extra         map[string]string
	errors        []error
	metrics       []metricDef
	groupByCols   []string
	groupBySQL    []string
	metricAliases map[string]struct{}
	orderValue    string
}

var aggregateFuncs = map[string]string{
	"count": "COUNT",
	"sum":   "SUM",
	"avg":   "AVG",
	"min":   "MIN",
	"max":   "MAX",
}

func NewAggregateQueryBuilder(session *xorm.Session, options AggregateOptions) *aggregateQueryBuilder {
	return &aggregateQueryBuilder{
		inner:         NewQueryBuilder(session, options.rowOptions()),
		Options:       options,
		Extra:         make(map[string]string),
		errors:        make([]error, 0),
		metricAliases: make(map[string]struct{}),
	}
}

func (opts AggregateOptions) rowOptions() Options {
	return Options{
		TableName:      opts.TableName,
		WhereWhitelist: opts.WhereWhitelist,
		QWhitelist:     opts.QWhitelist,
	}
}

func (ab *aggregateQueryBuilder) keyError(key, reason string) {
	err := fmt.Errorf("参数 '%s' 无效: %s", key, reason)
	ab.errors = append(ab.errors, err)
}

func (ab *aggregateQueryBuilder) Error() error {
	allErrors := append([]error{}, ab.inner.errors...)
	allErrors = append(allErrors, ab.errors...)
	if len(allErrors) == 0 {
		return nil
	}

	var sb strings.Builder
	sb.WriteString("查询参数解析错误: ")
	for i, err := range allErrors {
		if i > 0 {
			sb.WriteString("; ")
		}
		sb.WriteString(err.Error())
	}
	return errors.New(sb.String())
}

func (ab *aggregateQueryBuilder) validateColumn(column string, whitelist []string) bool {
	return ab.inner.validateColumn(column, whitelist)
}

func (ab *aggregateQueryBuilder) Bind(params map[string]string) {
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	for _, key := range keys {
		value := params[key]
		if value == "" {
			continue
		}
		if key == "q" {
			continue
		}
		if strings.HasPrefix(key, "q.") {
			ab.bindQ(key, value)
			continue
		}
		switch key {
		case "select":
			ab.keyError(key, "聚合查询不支持 select，有 group_by 时返回全部维度列与 metrics")
		case "metrics":
			ab.parseMetrics(key, value)
		case "group_by":
			ab.parseGroupBy(key, value)
		case "order":
			ab.orderValue = value
		case "where":
			ab.keyError(key, "格式错误, 应为 'where.列名.操作符'")
		default:
			parts := strings.Split(key, ".")
			if len(parts) > 0 && parts[0] == "where" {
				ab.inner.Where(key, value)
				continue
			}
			ab.Extra[key] = value
		}
	}

	if len(ab.metrics) == 0 {
		ab.keyError("metrics", "聚合查询必须提供 metrics")
		return
	}
	if ab.Error() != nil {
		return
	}

	ab.applySelect()
	if ab.orderValue != "" {
		ab.applyOrder("order", ab.orderValue)
	}
}

func (ab *aggregateQueryBuilder) bindQ(key, value string) {
	parts := strings.Split(key, ".")
	if len(parts) < 2 {
		ab.keyError(key, "格式错误, 应为 'q.列名1.列名2'")
		return
	}
	columns := parts[1:]
	cond := builder.Or()
	for _, column := range columns {
		if !ab.validateColumn(column, ab.Options.QWhitelist) {
			ab.keyError(key, fmt.Sprintf("列名 '%s' 不在白名单中", column))
			continue
		}
		column = parseColumn(column, ab.Options.TableName)
		cond = cond.Or(builderLike(ab.inner.Session, column, value))
	}
	ab.inner.Session.Where(cond)
}

func (ab *aggregateQueryBuilder) parseMetrics(key, value string) {
	specs := strings.Split(value, ",")
	for _, spec := range specs {
		spec = strings.TrimSpace(spec)
		if spec == "" {
			continue
		}
		metric, ok := ab.parseMetricSpec(key, spec)
		if !ok {
			continue
		}
		ab.metrics = append(ab.metrics, metric)
		ab.metricAliases[metric.alias] = struct{}{}
	}
}

func (ab *aggregateQueryBuilder) parseMetricSpec(key, spec string) (metricDef, bool) {
	openIdx := strings.Index(spec, "(")
	closeIdx := strings.LastIndex(spec, ")")
	dotIdx := strings.LastIndex(spec, ".")
	if openIdx < 0 || closeIdx <= openIdx || dotIdx <= closeIdx {
		ab.keyError(key, fmt.Sprintf("格式错误, 应为 '函数(字段).别名', 当前: '%s'", spec))
		return metricDef{}, false
	}

	funcName := strings.ToLower(strings.TrimSpace(spec[:openIdx]))
	sqlFunc, ok := aggregateFuncs[funcName]
	if !ok {
		ab.keyError(key, fmt.Sprintf("不支持的聚合函数 '%s'", funcName))
		return metricDef{}, false
	}

	field := strings.TrimSpace(spec[openIdx+1 : closeIdx])
	alias := strings.TrimSpace(spec[dotIdx+1:])
	if alias == "" {
		ab.keyError(key, "metrics 别名不能为空")
		return metricDef{}, false
	}

	var sqlExpr string
	switch {
	case funcName == "count" && field == "*":
		sqlExpr = fmt.Sprintf("COUNT(*) AS %s", alias)
	case field == "":
		ab.keyError(key, "聚合字段不能为空")
		return metricDef{}, false
	default:
		if !ab.validateColumn(field, ab.Options.MetricsWhitelist) {
			ab.keyError(key, fmt.Sprintf("字段 '%s' 不在白名单中", field))
			return metricDef{}, false
		}
		column := parseColumn(field, ab.Options.TableName)
		sqlExpr = fmt.Sprintf("%s(%s) AS %s", sqlFunc, column, alias)
	}

	return metricDef{
		funcName: funcName,
		field:    field,
		alias:    alias,
		sqlExpr:  sqlExpr,
	}, true
}

func (ab *aggregateQueryBuilder) parseGroupBy(key, value string) {
	columns := strings.Split(value, ",")
	ab.groupByCols = make([]string, 0, len(columns))
	ab.groupBySQL = make([]string, 0, len(columns))
	for _, col := range columns {
		col = strings.TrimSpace(col)
		if col == "" {
			continue
		}
		if !ab.validateColumn(col, ab.Options.GroupByWhitelist) {
			ab.keyError(key, fmt.Sprintf("列名 '%s' 不在白名单中", col))
			continue
		}
		ab.groupByCols = append(ab.groupByCols, col)
		ab.groupBySQL = append(ab.groupBySQL, parseColumn(col, ab.Options.TableName))
	}
}

func (ab *aggregateQueryBuilder) applySelect() {
	selectParts := make([]string, 0, len(ab.groupBySQL)+len(ab.metrics))
	selectParts = append(selectParts, ab.groupBySQL...)
	for _, metric := range ab.metrics {
		selectParts = append(selectParts, metric.sqlExpr)
	}
	ab.inner.Session.Select(strings.Join(selectParts, ", "))
	if len(ab.groupBySQL) > 0 {
		ab.inner.Session.GroupBy(strings.Join(ab.groupBySQL, ", "))
	}
}

func (ab *aggregateQueryBuilder) applyOrder(key, value string) {
	session := ab.inner.Session
	options := strings.Split(value, ",")
	for _, x := range options {
		params := strings.Split(x, ".")
		var validParams []string
		for _, p := range params {
			if p != "" {
				validParams = append(validParams, p)
			}
		}
		if len(validParams) == 0 {
			ab.keyError(key, "排序条件不能为空")
			continue
		}
		params = validParams
		sortField := params[0]
		order := "asc"
		if len(params) > 1 {
			direction := strings.ToLower(params[1])
			if direction != "asc" && direction != "desc" {
				ab.keyError(key, fmt.Sprintf("排序方向 '%s' 错误, 应为 'asc' 或 'desc'", params[1]))
				continue
			}
			order = direction
		}

		orderExpr, ok := ab.resolveOrderExpr(key, sortField)
		if !ok {
			continue
		}
		session.OrderBy(fmt.Sprintf("%s %s", orderExpr, order))
	}
}

func (ab *aggregateQueryBuilder) resolveOrderExpr(key, sortField string) (string, bool) {
	if _, ok := ab.metricAliases[sortField]; ok {
		return sortField, true
	}
	for _, col := range ab.groupByCols {
		if col == sortField {
			return parseColumn(col, ab.Options.TableName), true
		}
	}
	ab.keyError(key, fmt.Sprintf("排序字段 '%s' 必须是 group_by 字段或 metrics 别名", sortField))
	return "", false
}

func BindAggregateQueryString(session *xorm.Session, params map[string]string) error {
	return BindAggregateQueryStringWithOptions(session, params, AggregateOptions{})
}

func BindAggregateQueryStringWithPage(session *xorm.Session, params map[string]string) (page int, pagesize int, extra map[string]string, err error) {
	page, pagesize = 0, 10
	if p, ok := params["page"]; ok {
		page, err = strconv.Atoi(p)
		if err != nil {
			err = errors.New("invalid page parameter")
			return
		}
		delete(params, "page")
	}
	if ps, ok := params["pagesize"]; ok {
		pagesize, err = strconv.Atoi(ps)
		if err != nil {
			err = errors.New("invalid pagesize parameter")
			return
		}
		delete(params, "pagesize")
	}
	if pagesize > 500 {
		err = errors.New("pagesize 不能超过 500")
		return
	}

	ab := NewAggregateQueryBuilder(session, AggregateOptions{})
	ab.Bind(params)
	if err = ab.Error(); err != nil {
		return
	}

	extra = ab.Extra
	return
}

func BindAggregateQueryStringWithTable(session *xorm.Session, params map[string]string, tablename string) error {
	return BindAggregateQueryStringWithOptions(session, params, AggregateOptions{TableName: tablename})
}

func BindAggregateQueryStringWithOptions(session *xorm.Session, params map[string]string, options AggregateOptions) error {
	ab := NewAggregateQueryBuilder(session, options)
	ab.Bind(params)

	if len(ab.Extra) > 0 {
		keys := make([]string, 0, len(ab.Extra))
		for k := range ab.Extra {
			keys = append(keys, k)
		}
		session.Engine().Logger().Warnf("发现未被解析的查询参数: %v", keys)
	}

	return ab.Error()
}
