package user

import (
	"net/http"
	"testing"
	"time"

	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/base/model"
	"github.com/cometwk/lib/pkg/testutil"
	"github.com/pquerna/otp/totp"
	"github.com/stretchr/testify/assert"
)

func TestOTPURL(t *testing.T) {
	e, _ := setup()
	t.Run("OTPURLSuccess", func(t *testing.T) {

		err := model.UserModel.UpsertOne(&db.User{
			UUID:   "test-user-uuid",
			UserId: "testuser",
		})
		assert.NoError(t, err)

		rec := testutil.Get(e, "/admin/user/otp/url", nil)
		assert.Equal(t, http.StatusOK, rec.Code)

		body, err := rec.BodyJson()
		assert.NoError(t, err)
		assert.NotEmpty(t, body["url"])
		assert.NotEmpty(t, body["secret"])
	})
}

func TestOTPVerify(t *testing.T) {
	e, _ := setup()
	t.Run("OTPVerifySuccess", func(t *testing.T) {

		err := model.UserModel.UpsertOne(&db.User{
			UUID:   "test-user-uuid",
			UserId: "testuser",
		})
		assert.NoError(t, err)

		// 生成一个有效的 TOTP code
		key, err := totp.Generate(totp.GenerateOpts{
			Issuer:      "lucky-byte.com",
			AccountName: "testuser",
		})
		assert.NoError(t, err)

		code, err := totp.GenerateCode(key.Secret(), time.Now())
		assert.NoError(t, err)

		p := `{"code":"` + code + `","secret":"` + key.Secret() + `"}`
		rec := testutil.Post(e, "/admin/user/otp/verify", p)
		assert.Equal(t, http.StatusOK, rec.Code)

		// 验证 TOTP secret 已被保存
		user, err := model.UserModel.GetOne("test-user-uuid")
		assert.NoError(t, err)
		assert.Equal(t, key.Secret(), user.TOTPSecret)
	})

	t.Run("OTPVerifyInvalidCode", func(t *testing.T) {
		key, err := totp.Generate(totp.GenerateOpts{
			Issuer:      "lucky-byte.com",
			AccountName: "testuser",
		})
		assert.NoError(t, err)

		p := `{"code":"000000","secret":"` + key.Secret() + `"}`
		rec := testutil.Post(e, "/admin/user/otp/verify", p)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("OTPVerifyMissingFields", func(t *testing.T) {
		p := `{}`
		rec := testutil.Post(e, "/admin/user/otp/verify", p)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
}

func TestOTPCheck(t *testing.T) {
	e, _ := setup()
	t.Run("OTPCheckSuccess", func(t *testing.T) {
		// 先重置用户状态并设置 TOTP secret

		key, err := totp.Generate(totp.GenerateOpts{
			Issuer:      "lucky-byte.com",
			AccountName: "testuser",
		})
		assert.NoError(t, err)

		err = model.UserModel.UpsertOne(&db.User{
			UUID:       "test-user-uuid",
			TOTPSecret: key.Secret(),
		})
		assert.NoError(t, err)

		code, err := totp.GenerateCode(key.Secret(), time.Now())
		assert.NoError(t, err)

		p := `{"code":"` + code + `"}`
		rec := testutil.Post(e, "/admin/user/otp/check", p)
		assert.Equal(t, http.StatusOK, rec.Code)

		body, err := rec.BodyJson()
		assert.NoError(t, err)
		assert.True(t, body["valid"].(bool))
	})

	t.Run("OTPCheckInvalidCode", func(t *testing.T) {
		key, err := totp.Generate(totp.GenerateOpts{
			Issuer:      "lucky-byte.com",
			AccountName: "testuser",
		})
		assert.NoError(t, err)

		err = model.UserModel.UpsertOne(&db.User{
			UUID:       "test-user-uuid",
			TOTPSecret: key.Secret(),
		})
		assert.NoError(t, err)

		p := `{"code":"000000"}`
		rec := testutil.Post(e, "/admin/user/otp/check", p)
		assert.Equal(t, http.StatusOK, rec.Code)

		body, err := rec.BodyJson()
		assert.NoError(t, err)
		assert.False(t, body["valid"].(bool))
	})

	t.Run("OTPCheckMissingField", func(t *testing.T) {
		p := `{}`
		rec := testutil.Post(e, "/admin/user/otp/check", p)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})
}
