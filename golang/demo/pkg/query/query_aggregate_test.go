package query_test

import (
	"testing"

	"github.com/lucky-byte/demo/pkg/query"
	"github.com/lucky-byte/lib/pkg/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"xorm.io/builder"
	"xorm.io/xorm"
)

type AggTestModel struct {
	ID     int    `xorm:"'id' pk autoincr" json:"id"`
	Status string `xorm:"'status'" json:"status"`
	Amount int    `xorm:"'amount'" json:"amount"`
	Age    int    `xorm:"'age'" json:"age"`
}

func initAggTestModel(t *testing.T) (*xorm.Engine, testutil.Logmem) {
	engine, err := xorm.NewEngine("sqlite3", ":memory:")
	require.NoError(t, err)
	require.NoError(t, engine.Sync2(new(AggTestModel)))

	log := testutil.NewLogger()
	engine.SetLogger(log)
	return engine, log
}

func assertAggregateSQL(t *testing.T, log testutil.Logmem, session *xorm.Session, expectedSQL string, expectedArgs []any) {
	t.Helper()
	log.Reset()
	var rows []map[string]any
	require.NoError(t, session.Table(new(AggTestModel)).Find(&rows))
	require.NotEmpty(t, log.Entries())
	sql, args := log.Entries()[0].SQL, log.Entries()[0].Args
	expectedQuery, err := builder.ConvertToBoundSQL(expectedSQL, expectedArgs)
	require.NoError(t, err)
	loggedQuery, err := builder.ConvertToBoundSQL(sql, args)
	require.NoError(t, err)
	assert.Equal(t, expectedQuery, loggedQuery)
}

func TestAggregateRejectSelect(t *testing.T) {
	db, _ := initAggTestModel(t)
	session := db.NewSession()
	defer session.Close()

	err := query.BindAggregateQueryString(session, map[string]string{
		"select":  "status",
		"metrics": "count(*).total",
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "select")
}

func TestAggregateEmptyParams(t *testing.T) {
	db, _ := initAggTestModel(t)
	session := db.NewSession()
	defer session.Close()

	err := query.BindAggregateQueryString(session, map[string]string{})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "metrics")
}

func TestAggregateMetricsCount(t *testing.T) {
	db, log := initAggTestModel(t)
	session := db.NewSession()
	defer session.Close()

	err := query.BindAggregateQueryString(session, map[string]string{
		"metrics": "count(*).total",
	})
	require.NoError(t, err)
	assertAggregateSQL(t, log, session,
		"SELECT COUNT(*) AS total FROM `agg_test_model`",
		nil,
	)
}

func TestAggregateMetricsSum(t *testing.T) {
	db, log := initAggTestModel(t)
	session := db.NewSession()
	defer session.Close()

	err := query.BindAggregateQueryStringWithOptions(session, map[string]string{
		"metrics": "sum(amount).amount",
	}, query.AggregateOptions{
		MetricsWhitelist: []string{"amount"},
	})
	require.NoError(t, err)
	assertAggregateSQL(t, log, session,
		"SELECT SUM(`amount`) AS amount FROM `agg_test_model`",
		nil,
	)
}

func TestAggregateMultipleMetrics(t *testing.T) {
	db, log := initAggTestModel(t)
	session := db.NewSession()
	defer session.Close()

	err := query.BindAggregateQueryStringWithOptions(session, map[string]string{
		"metrics": "count(*).total,sum(amount).amount",
	}, query.AggregateOptions{
		MetricsWhitelist: []string{"amount"},
	})
	require.NoError(t, err)
	assertAggregateSQL(t, log, session,
		"SELECT COUNT(*) AS total, SUM(`amount`) AS amount FROM `agg_test_model`",
		nil,
	)
}

func TestAggregateUnknownFunc(t *testing.T) {
	db, _ := initAggTestModel(t)
	session := db.NewSession()
	defer session.Close()

	err := query.BindAggregateQueryString(session, map[string]string{
		"metrics": "median(x).m",
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "median")
}

func TestAggregateMetricsNotInWhitelist(t *testing.T) {
	db, _ := initAggTestModel(t)
	session := db.NewSession()
	defer session.Close()

	err := query.BindAggregateQueryStringWithOptions(session, map[string]string{
		"metrics": "sum(amount).amount",
	}, query.AggregateOptions{
		MetricsWhitelist: []string{"status"},
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "amount")
}

func TestAggregateInvalidMetricsFormat(t *testing.T) {
	db, _ := initAggTestModel(t)
	session := db.NewSession()
	defer session.Close()

	err := query.BindAggregateQueryString(session, map[string]string{
		"metrics": "count(total",
	})
	require.Error(t, err)
}

func TestAggregateGroupBy(t *testing.T) {
	db, log := initAggTestModel(t)
	session := db.NewSession()
	defer session.Close()

	err := query.BindAggregateQueryStringWithOptions(session, map[string]string{
		"metrics": "count(*).total",
		"group_by": "status",
	}, query.AggregateOptions{
		GroupByWhitelist: []string{"status"},
	})
	require.NoError(t, err)
	assertAggregateSQL(t, log, session,
		"SELECT `status`, COUNT(*) AS total FROM `agg_test_model` GROUP BY `status`",
		nil,
	)
}

func TestAggregateGroupByMultiple(t *testing.T) {
	db, log := initAggTestModel(t)
	session := db.NewSession()
	defer session.Close()

	err := query.BindAggregateQueryStringWithOptions(session, map[string]string{
		"metrics": "count(*).total",
		"group_by": "status,age",
	}, query.AggregateOptions{
		GroupByWhitelist: []string{"status", "age"},
	})
	require.NoError(t, err)
	assertAggregateSQL(t, log, session,
		"SELECT `status`, `age`, COUNT(*) AS total FROM `agg_test_model` GROUP BY `status`, `age`",
		nil,
	)
}

func TestAggregateGroupByNotInWhitelist(t *testing.T) {
	db, _ := initAggTestModel(t)
	session := db.NewSession()
	defer session.Close()

	err := query.BindAggregateQueryStringWithOptions(session, map[string]string{
		"metrics": "count(*).total",
		"group_by": "status",
	}, query.AggregateOptions{
		GroupByWhitelist: []string{"amount"},
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "status")
}

func TestAggregateWhereAndOrder(t *testing.T) {
	db, log := initAggTestModel(t)
	session := db.NewSession()
	defer session.Close()

	err := query.BindAggregateQueryStringWithOptions(session, map[string]string{
		"where.status.eq": "active",
		"metrics":         "count(*).total,sum(amount).amount",
		"group_by":         "status",
		"order":           "amount.desc",
	}, query.AggregateOptions{
		WhereWhitelist:   []string{"status"},
		GroupByWhitelist: []string{"status"},
		MetricsWhitelist: []string{"amount"},
	})
	require.NoError(t, err)

	log.Reset()
	var rows []map[string]any
	require.NoError(t, session.Table(new(AggTestModel)).Find(&rows))

	require.NotEmpty(t, log.Entries())
	expectedSQL := "SELECT `status`, COUNT(*) AS total, SUM(`amount`) AS amount FROM `agg_test_model` WHERE `status`=? GROUP BY `status` ORDER BY amount desc"
	expectedQuery, err := builder.ConvertToBoundSQL(expectedSQL, []any{"active"})
	require.NoError(t, err)
	loggedQuery, err := builder.ConvertToBoundSQL(log.Entries()[0].SQL, log.Entries()[0].Args)
	require.NoError(t, err)
	assert.Equal(t, expectedQuery, loggedQuery)
}

func TestAggregateOrderByGroupByColumn(t *testing.T) {
	db, log := initAggTestModel(t)
	session := db.NewSession()
	defer session.Close()

	err := query.BindAggregateQueryStringWithOptions(session, map[string]string{
		"metrics": "count(*).total",
		"group_by": "status",
		"order":   "status.asc",
	}, query.AggregateOptions{
		GroupByWhitelist: []string{"status"},
	})
	require.NoError(t, err)
	assertAggregateSQL(t, log, session,
		"SELECT `status`, COUNT(*) AS total FROM `agg_test_model` GROUP BY `status` ORDER BY `status` asc",
		nil,
	)
}

func TestAggregateOrderUnknownField(t *testing.T) {
	db, _ := initAggTestModel(t)
	session := db.NewSession()
	defer session.Close()

	err := query.BindAggregateQueryStringWithOptions(session, map[string]string{
		"metrics": "count(*).total",
		"group_by": "status",
		"order":   "unknown.desc",
	}, query.AggregateOptions{
		GroupByWhitelist: []string{"status"},
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unknown")
}

func TestAggregateWhereAge(t *testing.T) {
	db, log := initAggTestModel(t)
	session := db.NewSession()
	defer session.Close()

	err := query.BindAggregateQueryStringWithOptions(session, map[string]string{
		"where.age.gt": "20",
		"metrics":      "count(*).total",
		"group_by":      "status",
	}, query.AggregateOptions{
		WhereWhitelist:   []string{"age"},
		GroupByWhitelist: []string{"status"},
	})
	require.NoError(t, err)
	assertAggregateSQL(t, log, session,
		"SELECT `status`, COUNT(*) AS total FROM `agg_test_model` WHERE `age`>? GROUP BY `status`",
		[]any{"20"},
	)
}

func TestBindAggregateQueryStringWithPage(t *testing.T) {
	db, log := initAggTestModel(t)
	session := db.NewSession()
	defer session.Close()

	params := map[string]string{
		"metrics":      "count(*).total",
		"group_by":      "status",
		"where.age.gt": "20",
		"page":         "2",
		"pagesize":     "5",
	}

	page, pagesize, _, err := query.BindAggregateQueryStringWithPage(session, params)
	require.NoError(t, err)
	require.Equal(t, 2, page)
	require.Equal(t, 5, pagesize)

	session.Limit(pagesize, page*pagesize)

	log.Reset()
	var rows []map[string]any
	require.NoError(t, session.Table(new(AggTestModel)).Find(&rows))

	require.NotEmpty(t, log.Entries())
	expectedSQL := "SELECT `status`, COUNT(*) AS total FROM `agg_test_model` WHERE `age`>? GROUP BY `status` LIMIT ? OFFSET ?"
	expectedQuery, err := builder.ConvertToBoundSQL(expectedSQL, []any{"20", 5, 10})
	require.NoError(t, err)
	loggedQuery, err := builder.ConvertToBoundSQL(log.Entries()[0].SQL, log.Entries()[0].Args)
	require.NoError(t, err)
	assert.Equal(t, expectedQuery, loggedQuery)
}

func TestBindAggregateQueryStringWithPageTooLarge(t *testing.T) {
	db, _ := initAggTestModel(t)
	session := db.NewSession()
	defer session.Close()

	_, _, _, err := query.BindAggregateQueryStringWithPage(session, map[string]string{
		"metrics":  "count(*).total",
		"pagesize": "501",
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "500")
}

func TestBindAggregateQueryStringWithPageInvalidPage(t *testing.T) {
	db, _ := initAggTestModel(t)
	session := db.NewSession()
	defer session.Close()

	_, _, _, err := query.BindAggregateQueryStringWithPage(session, map[string]string{
		"metrics": "count(*).total",
		"page":    "abc",
	})
	require.Error(t, err)
}
