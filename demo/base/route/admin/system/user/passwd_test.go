package user

import (
	"net/http"
	"testing"
	"time"

	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/base/model"
	"github.com/cometwk/base/pkg/secure"
	"github.com/cometwk/lib/pkg/testutil"
	"github.com/stretchr/testify/assert"
)

func Test1(t *testing.T) {
	passwdHash, err := secure.DefaultPHC().Hash("123123")
	assert.NoError(t, err)
	println(passwdHash)

	// 验证密码
	phc, err := secure.ParsePHC(passwdHash)
	if err != nil {
		t.Fatal(err)
	}
	err = phc.Verify("123123")
	if err != nil {
		t.Fatal(err)
	}
	println("验证密码成功")

	valid := secure.ValidatePassword("123123", passwdHash)
	println(valid)

}
func TestPasswd(t *testing.T) {
	e, _ := setup()
	t.Run("PasswdSuccess", func(t *testing.T) {
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

		p := `{"uuid":"test-uuid", "password":"newpassword123", "sendmail":false}`
		rec := testutil.Post(e, "/admin/system/user/passwd", p)
		assert.Equal(t, http.StatusOK, rec.Code)

		// 验证密码已被更新
		user, err := model.UserModel.GetOne("test-uuid")
		assert.NoError(t, err)
		assert.NotEmpty(t, user.Passwd, "密码应该已被更新")
		assert.Equal(t, "测试用户", user.Name)
		assert.Equal(t, "testuser", user.UserId)
		assert.Equal(t, "test@example.com", user.Email)
		assert.Equal(t, "13800138000", user.Mobile)
	})

	t.Run("PasswdMissingFields", func(t *testing.T) {
		p := `{"uuid":"test-uuid"}`
		rec := testutil.Post(e, "/admin/system/user/passwd", p)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
}
