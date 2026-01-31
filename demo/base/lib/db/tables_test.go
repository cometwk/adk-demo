package db_test

import (
	"fmt"
	"testing"

	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/lib/pkg/orm"
	"github.com/google/uuid"
	"github.com/k0kubun/pp"
	"github.com/stretchr/testify/assert"
)

func TestJust(t *testing.T) {
	orm.InitDefaultDB()

	t.Run("check user entity", func(t *testing.T) {
		var user db.User
		err := db.SelectOne("select * from users where LOWER(userid) = LOWER(?)", &user, "wk")
		assert.Error(t, err)
		pp.Println(user)
	})
}

func TestUsers(t *testing.T) {
	// config.MustEnv()
	orm.InitDefaultDB()
	session := orm.MustSession(nil)

	t.Run("sqlx selectOne tree", func(t *testing.T) {
		var tree db.Tree
		// id := "f4e6e9bc-702e-439a-ba92-b092cee6f6b2"
		ql := `select * from tree where uuid = '94034e6b-a29e-4481-975b-4f98e7fa2da0'`
		// err := db.SelectOne(ql, &tree, id)
		err := db.SelectOne(ql, &tree)
		if err != nil {
			t.Fatalf("err=%v\n", err)
		}
		fmt.Printf("tree: %#v\n", tree)
	})

	t.Run("sqlx upsert user", func(t *testing.T) {
		var user db.User

		db.Upsert(&db.User{
			UUID:     uuid.New().String(),
			Name:     "testname",
			UserId:   "wk",
			Passwd:   "123123",
			Disabled: false,
		})

		// 查询用户信息
		ok, err := session.Where("LOWER(user_id) = LOWER(?)", "wk").Get(&user)
		if err != nil {
			t.Fatalf("err=%v\n", err)
		}
		if !ok {
			t.Fatalf("user not found")
		}
		fmt.Printf("user: %+v\n", user)
	})

	t.Run("sqlx selectOne user", func(t *testing.T) {
		var user db.User
		ql := `select * from users where LOWER(userid) = LOWER(?)`
		err := db.SelectOne(ql, &user, "wk")
		if err != nil {
			t.Fatalf("err=%v\n", err)
		}
		fmt.Printf("user = %+v\n", user)
	})

	t.Run("selectOne error", func(t *testing.T) {
		var user db.User
		err := db.SelectOne("select * from users where LOWER(userid) = LOWER(?)", &user, "non_existent_user")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "未返回结果")
		assert.Zero(t, user)
	})
}
