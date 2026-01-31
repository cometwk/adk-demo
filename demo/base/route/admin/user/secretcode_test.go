package user

import (
	"net/http"
	"testing"

	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/base/model"
	"github.com/cometwk/lib/pkg/testutil"
	"github.com/stretchr/testify/assert"
)

func TestSecretcode(t *testing.T) {
	e, _ := setup()
	t.Run("SecretcodeSuccess", func(t *testing.T) {

		err := model.UserModel.UpsertOne(&db.User{
			UUID: "test-user-uuid",
		})
		assert.NoError(t, err)

		p := `{"secretcode":"123456"}`
		rec := testutil.Post(e, "/admin/user/secretcode", p)
		assert.Equal(t, http.StatusOK, rec.Code)

		// 验证 secretcode 已被更新
		user, err := model.UserModel.GetOne("test-user-uuid")
		assert.NoError(t, err)
		assert.NotEmpty(t, user.SecretCode)
	})

	t.Run("SecretcodeInvalidFormat", func(t *testing.T) {
		p := `{"secretcode":"12345"}`
		rec := testutil.Post(e, "/admin/user/secretcode", p)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("SecretcodeMissingField", func(t *testing.T) {
		p := `{}`
		rec := testutil.Post(e, "/admin/user/secretcode", p)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
}
