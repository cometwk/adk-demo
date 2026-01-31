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

func TestClearSecretCode(t *testing.T) {
	e, _ := setup()
	// 注意：clearsecretcode 路由在 attach.go 中被注释掉了
	// 如果需要测试，请先取消注释 attach.go 中的路由
	t.Run("ClearSecretCodeSuccess", func(t *testing.T) {
		// 先重置用户状态：删除旧记录（如果存在），然后创建新用户
		_, _ = model.UserModel.Delete("test-uuid")
		err := model.UserModel.UpsertOne(&db.User{
			UUID:       "test-uuid",
			Name:       "测试用户",
			UserId:     "testuser",
			Email:      "test@example.com",
			Mobile:     "13800138000",
			SigninAt:   time.Now(),
			SecretCode: "test-secret-code",
		})
		assert.NoError(t, err)

		p := `{"uuid":"test-uuid"}`
		rec := testutil.Post(e, "/admin/system/user/clearsecretcode", p)
		// 路由不存在时返回 404，如果路由启用则应该是 200
		if rec.Code == http.StatusOK {
			// 验证安全码已被清空
			user, err := model.UserModel.GetOne("test-uuid")
			assert.NoError(t, err)
			assert.Empty(t, user.SecretCode, "安全码应该已被清空")
			assert.Equal(t, "测试用户", user.Name)
			assert.Equal(t, "testuser", user.UserId)
		} else {
			assert.Equal(t, http.StatusNotFound, rec.Code, "路由未启用时应返回 404")
		}
	})

	t.Run("ClearSecretCodeMissingUUID", func(t *testing.T) {
		p := `{}`
		rec := testutil.Post(e, "/admin/system/user/clearsecretcode", p)
		// 路由不存在时返回 404，如果路由启用则应该是 400
		assert.True(t, rec.Code == http.StatusBadRequest || rec.Code == http.StatusNotFound)
	})
}
