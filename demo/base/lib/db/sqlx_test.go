package db_test

import (
	"testing"
	"time"

	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/orm"
	"github.com/cometwk/lib/pkg/testutil"
	"github.com/stretchr/testify/assert"
	"xorm.io/builder"
	"xorm.io/xorm"
)

type XKey struct {
	Abbr      string    `json:"abbr"        xorm:"varchar(64) pk comment('缩写')"`         // 缩写
	Name      string    `json:"name"        xorm:"varchar(64) comment('名称')"`            // 名称
	Py        string    `json:"py"          xorm:"varchar(64) comment('名称拼音')"`          // 名称拼音
	Ref       string    `json:"ref"         xorm:"varchar(64) comment('参考值')"`           // 参考值
	Unit      string    `json:"unit"        xorm:"varchar(32) comment('单位')"`            // 单位
	Explain   string    `json:"explain"     xorm:"varchar(1024) comment('医学含义')"`        // 医学含义
	Notes     string    `json:"notes"       xorm:"varchar(1024) comment('备注')"`          // 备注
	CreatedAt time.Time `json:"created_at"  xorm:"created 'created_at' comment('创建时间')"` // 创建时间
	UpdatedAt time.Time `json:"updated_at"  xorm:"updated 'updated_at' comment('更新时间')"` // 更新时间
}

// testHelper 封装测试辅助功能
type testHelper struct {
	t        *testing.T
	db       *xorm.Session
	testData []XKey
}

// newTestHelper 创建测试助手
func newTestHelper(t *testing.T) *testHelper {
	orm.InitDB("sqlite3", ":memory:")
	db := orm.MustDB()
	th := &testHelper{
		t:  t,
		db: db.NewSession(),
	}

	// 确保表结构同步
	err := th.db.Sync2(new(XKey))
	assert.NoError(t, err, "同步数据表结构失败")

	// 确保数据模型同步
	model := orm.MustLoadStructModel[XKey]()
	model.Sync()

	th.cleanup()
	th.prepare()

	return th
}

// prepareTestData 准备测试数据
func (th *testHelper) prepare() {
	th.testData = []XKey{
		{Abbr: "test1", Name: "测试1", Py: "ceshi1", Ref: "ref1"},
		{Abbr: "test2", Name: "测试2", Py: "ceshi2", Ref: "ref2"},
		{Abbr: "test3", Name: "测试3", Py: "ceshi3", Ref: "ref3"},
	}

	affected, err := th.db.Insert(&th.testData)
	assert.NoError(th.t, err, "插入测试数据失败")
	assert.Equal(th.t, int64(len(th.testData)), affected, "插入记录数量不匹配")
}

// cleanup 清理测试数据
func (th *testHelper) cleanup() {
	_, err := th.db.Exec("DELETE FROM x_key")
	assert.NoError(th.t, err, "清理测试数据失败")
}

// 使用示例
func TestXKey(t *testing.T) {
	th := newTestHelper(t)
	defer th.cleanup() // 确保测试结束后清理数据

	// 测试 SelectOne
	var result XKey
	err := db.SelectOne("SELECT * FROM x_key WHERE abbr = ?", &result, "test1")
	assert.NoError(t, err)
	assert.Equal(t, "测试1", result.Name)

	// 测试 SelectOne
	err = db.SelectOne("SELECT * FROM x_key WHERE LOWER(name) = LOWER(?)", &result, "测试1")
	assert.NoError(t, err)
	testutil.PrintPretty(result)
}

func TestLocalStruct(t *testing.T) {
	type keypair struct {
		NewKey string `xorm:"jwtsignkey"`
		OldKey string `xorm:"jwtsignkey2"`
	}
	// 测试 SelectOne
	var result keypair
	ql := `select jwtsignkey, jwtsignkey2 from account`
	err := db.SelectOne(ql, &result)
	assert.NoError(t, err)
	t.Logf("%+v\n", result)
}

func TestIn(t *testing.T) {
	engine := orm.MustDB()
	// var count int
	codes := []int{1, 2, 3}
	t.Run("in case 3", func(t *testing.T) {
		ql := `
		select uuid, url, code, title, iread, iwrite, iadmin from acl_allows
		where acl = ? order by code
		`
		var result []db.AclAllow

		acl_id := "7e9633f6-c83a-49a4-9a96-e120d6ca6055"
		if err := db.Select(ql, &result, acl_id); err != nil {
			t.Logf("%+v\n", err)
		}
		t.Logf("%+v\n", result)
	})
	t.Run("in case 2", func(t *testing.T) {
		{
			var x XKey
			count, err := engine.Table("acl_allows").In("code", codes).And("acl = ?", "123").Count(&x)
			assert.NoError(t, err)
			t.Logf("%+v\n", count)
		}
	})

	t.Run("in case 1", func(t *testing.T) {
		{
			sql, args, err := builder.ToSQL(builder.In("code", codes))
			assert.NoError(t, err)
			t.Logf("%+v\n", sql)
			t.Logf("%+v\n", args)
		}
	})
}

func TestCombinedStruct(t *testing.T) {
	type result struct {
		db.Acl    `xorm:"extends"`
		UserCount int `xorm:"user_count"`
	}

	ql := `
		select a.*, (
			select count(*) from users where acl = a.uuid
		) as user_count
		from acl as a
		order by a.create_at desc
	`
	// 测试 SelectOne
	var records []result
	err := db.Select(ql, &records)
	assert.NoError(t, err)
	t.Logf("%+v\n", records)
}

func TestSelectOne(t *testing.T) {
	th := newTestHelper(t)
	defer th.cleanup()

	t.Run("select one record", func(t *testing.T) {
		// 测试 SelectOne
		var result XKey
		err := db.SelectOne("SELECT * FROM x_key WHERE abbr = ?", &result, "test1")
		assert.NoError(t, err)
		assert.Equal(t, "测试1", result.Name)
	})

	t.Run("select non-existent record", func(t *testing.T) {
		var result XKey
		err := db.SelectOne("SELECT * FROM x_key WHERE abbr = ?", &result, "不存在")
		assert.Error(t, err)
	})
}

func TestSelect(t *testing.T) {
	th := newTestHelper(t)
	defer th.cleanup()

	t.Run("select multiple records", func(t *testing.T) {
		// 测试 Select
		var results []XKey
		err := db.Select("SELECT * FROM x_key WHERE abbr LIKE ?", &results, "test%")
		assert.NoError(t, err)
		assert.Equal(t, 3, len(results))
	})
}

func TestUpsert(t *testing.T) {
	th := newTestHelper(t)
	defer th.cleanup()

	t.Run("insert new record", func(t *testing.T) {
		user := &XKey{Abbr: "new", Name: "新用户", Py: "xinuser", Ref: "ref"}
		affected, err := db.Upsert(user)
		assert.NoError(t, err)
		assert.Equal(t, int64(1), affected)
	})

	t.Run("update existing record", func(t *testing.T) {
		// 先插入
		user := &XKey{Abbr: "test", Name: "测试", Py: "test", Ref: "ref"}
		_, err := th.db.Insert(user)
		assert.NoError(t, err)

		// 更新
		user.Name = "更新后"
		affected, err := db.Upsert(user)
		assert.NoError(t, err)
		assert.Equal(t, int64(1), affected)

		// 验证更新结果
		var result XKey
		found, err := th.db.ID(user.Abbr).Get(&result)
		assert.NoError(t, err)
		assert.True(t, found)
		assert.Equal(t, "更新后", result.Name)
	})
}

func TestExecOne(t *testing.T) {
	th := newTestHelper(t)
	defer th.cleanup()

	t.Run("exec single record operations", func(t *testing.T) {
		// 使用唯一的测试数据标识，避免与 prepare() 冲突
		err := db.ExecOne("INSERT INTO x_key (abbr, name, py, ref) VALUES (?, ?, ?, ?)",
			"exec_test1", "执行测试", "zhixing", "ref1")
		assert.NoError(t, err)

		// 更新刚插入的记录
		err = db.ExecOne("UPDATE x_key SET name = ? WHERE abbr = ?", "更新测试", "exec_test1")
		assert.NoError(t, err)

		// 删除刚更新的记录
		err = db.ExecOne("DELETE FROM x_key WHERE abbr = ?", "exec_test1")
		assert.NoError(t, err)
	})

	t.Run("exec multiple records should fail", func(t *testing.T) {
		// 使用唯一的测试数据标识
		testData := []XKey{
			{Abbr: "exec_batch1", Name: "批量测试", Py: "test1", Ref: "ref1"},
			{Abbr: "exec_batch2", Name: "批量测试", Py: "test2", Ref: "ref2"},
		}
		_, err := th.db.Insert(&testData)
		assert.NoError(t, err)

		// 尝试删除多条记录应该返回错误
		err = db.ExecOne("DELETE FROM x_key WHERE name = ?", "批量测试")
		assert.Error(t, err)
	})
}

func TestExec(t *testing.T) {
	th := newTestHelper(t)
	defer th.cleanup()

	t.Run("exec batch operations", func(t *testing.T) {
		// 测试批量插入，使用唯一的测试数据标识
		err := db.Exec("INSERT INTO x_key (abbr, name, py, ref) VALUES (?, ?, ?, ?), (?, ?, ?, ?)",
			"exec_batch1", "批量1", "pl1", "ref1",
			"exec_batch2", "批量2", "pl2", "ref2")
		assert.NoError(t, err)

		// 使用标准 SQL 语法更新字符串
		err = db.Exec("UPDATE x_key SET name = CASE WHEN name IS NOT NULL THEN name || '_更新' ELSE '_更新' END WHERE abbr LIKE ?", "exec_batch%")
		assert.NoError(t, err)

		// 测试批量删除
		err = db.Exec("DELETE FROM x_key WHERE abbr LIKE ?", "exec_batch%")
		assert.NoError(t, err)
	})
}
