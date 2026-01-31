package user

import (
	"net/http"
	"testing"
	"time"

	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/base/model"
	"github.com/cometwk/lib/pkg/testutil"
	"github.com/stretchr/testify/assert"
)

func TestClearTOTP(t *testing.T) {
	e, _ := setup()
	t.Run("ClearTOTPSuccess", func(t *testing.T) {
		// 先重置用户状态：删除旧记录（如果存在），然后创建新用户
		_, _ = model.UserModel.Delete("test-uuid")
		err := model.UserModel.UpsertOne(&db.User{
			UUID:       "test-uuid",
			Name:       "测试用户",
			UserId:     "testuser",
			Email:      "test@example.com",
			Mobile:     "13800138000",
			SigninAt:   time.Now(),
			TOTPSecret: "test-totp-secret",
		})
		assert.NoError(t, err)

		p := `{"uuid":"test-uuid"}`
		rec := testutil.Post(e, "/admin/system/user/cleartotp", p)
		assert.Equal(t, http.StatusOK, rec.Code)

		// 验证 TOTP 密钥已被清空
		user, err := model.UserModel.GetOne("test-uuid")
		assert.NoError(t, err)
		assert.Empty(t, user.TOTPSecret, "TOTP 密钥应该已被清空")
		assert.Equal(t, "测试用户", user.Name)
		assert.Equal(t, "testuser", user.UserId)
	})

	t.Run("ClearTOTPMissingUUID", func(t *testing.T) {
		p := `{}`
		rec := testutil.Post(e, "/admin/system/user/cleartotp", p)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
}
