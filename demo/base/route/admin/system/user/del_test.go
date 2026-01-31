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

func TestDel(t *testing.T) {
	e, _ := setup()
	t.Run("DelSuccess", func(t *testing.T) {
		// 先重置用户状态：删除旧记录（如果存在），然后创建新用户
		_, _ = model.UserModel.Delete("test-uuid")
		err := model.UserModel.UpsertOne(&db.User{
			UUID:     "test-uuid",
			Name:     "测试用户",
			UserId:   "testuser",
			Email:    "test@example.com",
			Mobile:   "13800138000",
			SigninAt: time.Now(),
		})
		assert.NoError(t, err)

		p := `{"uuid":"test-uuid"}`
		rec := testutil.Post(e, "/admin/system/user/delete", p)
		assert.Equal(t, http.StatusOK, rec.Code)

		// 验证用户已被删除
		user, err := model.UserModel.GetOne("test-uuid")
		assert.NoError(t, err)
		assert.True(t, user.Deleted, "用户应该被标记为已删除")
	})

	t.Run("DelMissingUUID", func(t *testing.T) {
		p := `{}`
		rec := testutil.Post(e, "/admin/system/user/delete", p)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
}
