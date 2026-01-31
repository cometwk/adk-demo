package user

import (
	"net/http"
	"testing"

	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/base/model"
	"github.com/cometwk/lib/pkg/testutil"
	"github.com/stretchr/testify/assert"
)

func TestUserid(t *testing.T) {
	e, _ := setup()
	t.Run("UseridSuccess", func(t *testing.T) {

		err := model.UserModel.UpsertOne(&db.User{
			UUID:   "test-user-uuid",
			UserId: "olduserid",
		})
		assert.NoError(t, err)

		p := `{"userid":"newuserid"}`
		rec := testutil.Post(e, "/admin/user/userid", p)
		assert.Equal(t, http.StatusOK, rec.Code)

		// 验证 userid 已被更新
		user, err := model.UserModel.GetOne("test-user-uuid")
		assert.NoError(t, err)
		assert.Equal(t, "newuserid", user.UserId)
	})

	t.Run("UseridConflict", func(t *testing.T) {
		// 创建另一个用户
		_, _ = model.UserModel.Delete("other-user-uuid")
		err := model.UserModel.UpsertOne(&db.User{
			UUID:   "other-user-uuid",
			UserId: "existinguser",
		})
		assert.NoError(t, err)

		// 尝试使用已存在的 userid
		p := `{"userid":"existinguser"}`
		rec := testutil.Post(e, "/admin/user/userid", p)
		assert.Equal(t, http.StatusConflict, rec.Code)
	})

	t.Run("UseridMissingField", func(t *testing.T) {
		p := `{}`
		rec := testutil.Post(e, "/admin/user/userid", p)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
}
