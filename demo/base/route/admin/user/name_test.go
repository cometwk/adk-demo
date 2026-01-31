package user

import (
	"net/http"
	"testing"

	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/base/model"
	"github.com/cometwk/lib/pkg/testutil"
	"github.com/stretchr/testify/assert"
)

func TestName(t *testing.T) {
	e, _ := setup()
	t.Run("NameSuccess", func(t *testing.T) {

		err := model.UserModel.UpsertOne(&db.User{
			UUID:   "test-user-uuid",
			UserId: "testuser",
			Name:   "旧名称",
		})
		assert.NoError(t, err)

		p := `{"name":"新名称"}`
		rec := testutil.Post(e, "/admin/user/name", p)
		assert.Equal(t, http.StatusOK, rec.Code)

		// 验证名称已被更新
		user, err := model.UserModel.GetOne("test-user-uuid")
		assert.NoError(t, err)
		assert.Equal(t, "新名称", user.Name)
	})

	t.Run("NameMissingField", func(t *testing.T) {
		p := `{}`
		rec := testutil.Post(e, "/admin/user/name", p)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
}
