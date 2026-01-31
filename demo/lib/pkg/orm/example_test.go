package orm_test

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"testing"
	"time"

	"github.com/cometwk/lib/pkg/orm"
	"github.com/stretchr/testify/assert"
)

// 先定义一个 xorm 模型
type User struct {
	ID        string    `json:"id"          xorm:"'id' varchar(64) pk"`  // 主键
	Name      string    `json:"name"        xorm:"'name' varchar(64)"`   // 名称
	Age       int       `json:"age1"         xorm:"'age' int"`           // 年龄
	CreatedAt time.Time `json:"created_at"  xorm:"'created_at' created"` // 创建时间, 自动生成
	UpdatedAt time.Time `json:"updated_at"  xorm:"'updated_at' updated"` // 更新时间, 自动生成
}

func InitModel() orm.Model {
	// 初始化数据库连接
	orm.InitDB("sqlite3", ":memory:")

	// 注册模型
	m := orm.MustLoadStructModel[User]()
	// 建表
	m.Sync()

	return m
}

func TestAllModels(t *testing.T) {
	InitModel()
	models := orm.AllModels()
	fmt.Println(models)
}

func TestExample(t *testing.T) {
	InitModel()

	session := orm.NewSession()
	defer session.Close()

	m := orm.MustEntityOps[User]().WithSession(session)

	var testData = User{ID: "1", Name: "测试2", Age: 18}

	// 插入测试数据
	affected, err := m.Upsert(&testData)
	fmt.Println(affected, err)

	// 查询测试数据
	result, err := m.Get(testData.ID)
	fmt.Println(result, err)
}

func TestTx(t *testing.T) {
	InitModel()

	session := orm.NewSession()
	defer session.Close()

	m := orm.MustEntityOps[User]().WithSession(session)

	session.Begin()

	var testData = User{ID: "1", Name: "测试2", Age: rand.Intn(100)}

	result, err := m.Get(testData.ID)
	fmt.Printf("\nresult: %+v, err: %+v\n\n", result.Age, err)

	// 插入测试数据
	_, err = m.Upsert(&testData)
	// fmt.Println(affected, err)
	assert.NoError(t, err)

	result, err = m.Get(testData.ID)
	fmt.Printf("\nresult: %+v, err: %+v\n\n", result.Age, err)

	session.Rollback()

}

func TestSearchPage(t *testing.T) {
	InitModel()
	session := orm.NewSession()
	defer session.Close()
	m := orm.MustEntityOps[User]().WithSession(session)

	r, err := m.SearchPage(map[string]string{
		"select":          "id,name,age",
		"where.name.like": "测试",
		"where.age.gt":    "16",
		"page":            "0",
		"pagesize":        "2",
	})
	// SELECT `id`, `name`, `age` FROM `user` WHERE name LIKE ? AND age>? LIMIT 2
	assert.NoError(t, err)
	json, err := json.MarshalIndent(r, "", "  ")
	assert.NoError(t, err)
	fmt.Println(string(json))
}
