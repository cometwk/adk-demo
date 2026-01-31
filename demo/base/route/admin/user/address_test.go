package user

import (
	"net/http"
	"testing"

	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/base/model"
	"github.com/cometwk/lib/pkg/testutil"
	"github.com/stretchr/testify/assert"
)

func TestAddress(t *testing.T) {
	e, _ := setup()
	t.Run("AddressSuccess", func(t *testing.T) {
		err := model.UserModel.UpsertOne(&db.User{
			UUID:    "test-user-uuid",
			Address: "旧地址",
		})
		assert.NoError(t, err)

		p := `{"address":"新地址"}`
		rec := testutil.Post(e, "/admin/user/address", p)
		assert.Equal(t, http.StatusOK, rec.Code)

		// 验证地址已被更新
		user, err := model.UserModel.GetOne("test-user-uuid")
		assert.NoError(t, err)
		assert.Equal(t, "新地址", user.Address)
	})
}
