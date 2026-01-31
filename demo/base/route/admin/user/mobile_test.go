package user

import (
	"net/http"
	"testing"

	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/base/model"
	"github.com/cometwk/lib/pkg/testutil"
	"github.com/stretchr/testify/assert"
)

func TestMobile(t *testing.T) {
	e, _ := setup()
	t.Run("MobileSuccess", func(t *testing.T) {

		err := model.UserModel.UpsertOne(&db.User{
			UUID:   "test-user-uuid",
			Mobile: "13800138000",
		})
		assert.NoError(t, err)

		p := `{"mobile":"13900139000"}`
		rec := testutil.Post(e, "/admin/user/mobile", p)
		assert.Equal(t, http.StatusOK, rec.Code)

		// 验证手机号已被更新
		user, err := model.UserModel.GetOne("test-user-uuid")
		assert.NoError(t, err)
		assert.Equal(t, "13900139000", user.Mobile)
	})

	t.Run("MobileInvalidFormat", func(t *testing.T) {
		p := `{"mobile":"1234567890"}`
		rec := testutil.Post(e, "/admin/user/mobile", p)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("MobileMissingField", func(t *testing.T) {
		p := `{}`
		rec := testutil.Post(e, "/admin/user/mobile", p)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
}
