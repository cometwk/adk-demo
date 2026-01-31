package user

import (
	"net/http"
	"testing"

	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/base/model"
	"github.com/cometwk/base/pkg/secure"
	"github.com/cometwk/lib/pkg/testutil"
	"github.com/stretchr/testify/assert"
)

func TestPasswd(t *testing.T) {
	e, _ := setup()
	t.Run("PasswdSuccess", func(t *testing.T) {

		oldPasswordHash, err := secure.DefaultPHC().Hash("oldpassword")
		assert.NoError(t, err)
		err = model.UserModel.UpsertOne(&db.User{
			UUID:   "test-user-uuid",
			Passwd: oldPasswordHash,
		})
		assert.NoError(t, err)

		p := `{"oldPassword":"oldpassword","newPassword":"newpassword"}`
		rec := testutil.Post(e, "/admin/user/passwd", p)
		assert.Equal(t, http.StatusOK, rec.Code)

		// 验证密码已被更新
		user, err := model.UserModel.GetOne("test-user-uuid")
		assert.NoError(t, err)
		assert.NotEmpty(t, user.Passwd)
		assert.NotEqual(t, oldPasswordHash, user.Passwd)
	})

	t.Run("PasswdWrongOldPassword", func(t *testing.T) {

		oldPasswordHash, err := secure.DefaultPHC().Hash("oldpassword")
		assert.NoError(t, err)
		err = model.UserModel.UpsertOne(&db.User{
			UUID:   "test-user-uuid",
			Passwd: oldPasswordHash,
		})
		assert.NoError(t, err)

		p := `{"oldPassword":"wrongpassword","newPassword":"newpassword"}`
		rec := testutil.Post(e, "/admin/user/passwd", p)
		assert.Equal(t, http.StatusForbidden, rec.Code)
	})

	t.Run("PasswdMissingFields", func(t *testing.T) {
		p := `{}`
		rec := testutil.Post(e, "/admin/user/passwd", p)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
}
