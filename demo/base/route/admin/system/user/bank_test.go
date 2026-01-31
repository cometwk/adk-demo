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

func TestBank(t *testing.T) {
	e, _ := setup()
	t.Run("BankSuccess", func(t *testing.T) {
		// 先重置用户状态：删除旧记录（如果存在），然后创建新用户
		_, _ = model.UserModel.Delete("test-uuid")
		err := model.UserModel.UpsertOne(&db.User{
			UUID:         "test-uuid",
			Name:         "测试用户",
			UserId:       "testuser",
			Email:        "test@example.com",
			Mobile:       "13800138000",
			AcctNo:       "123",
			AcctMobile:   "13800138001",
			AcctIdno:     "110101199001011235",
			AcctBankName: "测试银行OLD",
			SigninAt:     time.Now(),
		})
		assert.NoError(t, err)

		p := `{"uuid":"test-uuid", "name":"测试用户", "no":"1234567890123456", "mobile":"13800138000", "idno":"110101199001011234", "bank_name":"测试银行"}`
		rec := testutil.Post(e, "/admin/system/user/bank", p)
		assert.Equal(t, http.StatusOK, rec.Code)

		user, err := model.UserModel.GetOne("test-uuid")
		assert.NoError(t, err)
		assert.Equal(t, "测试用户", user.Name)
		assert.Equal(t, "1234567890123456", user.AcctNo)
		assert.Equal(t, "13800138000", user.AcctMobile)
		assert.Equal(t, "110101199001011234", user.AcctIdno)
		assert.Equal(t, "测试银行", user.AcctBankName)
	})

}
