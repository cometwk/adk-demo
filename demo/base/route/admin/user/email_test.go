package user

import (
	"net/http"
	"testing"

	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/base/model"
	"github.com/cometwk/lib/pkg/testutil"
	"github.com/stretchr/testify/assert"
)

func TestEmail(t *testing.T) {
	e, _ := setup()
	t.Run("EmailSuccess", func(t *testing.T) {

		err := model.UserModel.UpsertOne(&db.User{
			UUID:  "test-user-uuid",
			Email: "old@example.com",
		})
		assert.NoError(t, err)

		p := `{"email":"new@example.com"}`
		rec := testutil.Post(e, "/admin/user/email", p)
		assert.Equal(t, http.StatusOK, rec.Code)

		// 验证邮箱已被更新
		user, err := model.UserModel.GetOne("test-user-uuid")
		assert.NoError(t, err)
		assert.Equal(t, "new@example.com", user.Email)
	})

	t.Run("EmailInvalidFormat", func(t *testing.T) {
		p := `{"email":"invalid-email"}`
		rec := testutil.Post(e, "/admin/user/email", p)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("EmailMissingField", func(t *testing.T) {
		p := `{}`
		rec := testutil.Post(e, "/admin/user/email", p)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
}
