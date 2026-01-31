package signin

import (
	"fmt"
	"net/http"
	"strconv"
	"testing"
	"time"

	"github.com/cometwk/base/lib/db"
	"github.com/cometwk/base/model"
	biztestutil "github.com/cometwk/base/model/testutil"
	"github.com/cometwk/base/pkg/secure"
	"github.com/cometwk/lib/pkg/testutil"
	"github.com/pquerna/otp/totp"
	"github.com/stretchr/testify/assert"
)

func TestPassword(t *testing.T) {
	hashedPassword := secure.HashPassword("123123")
	println(hashedPassword)
}

func TestSignin(t *testing.T) {
	e, egnine := setup()
	defer egnine.Close()

	t.Run("SigninSuccess", func(t *testing.T) {
		// 创建测试密码
		hashedPassword := secure.HashPassword("testpassword123")
		assert.NotEmpty(t, hashedPassword)

		err := model.UserModel.UpsertOne(&db.User{
			UUID:     "test-user-uuid",
			Name:     "测试登录用户",
			UserId:   "testuser",
			Email:    "test@example.com",
			Mobile:   "13800138000",
			Passwd:   hashedPassword,
			SigninAt: time.Now(),
			ACL:      biztestutil.ACL_ADMIN_UUID,
		})
		assert.NoError(t, err)

		// 测试登录
		p := `{"mobile":"testuser", "password":"testpassword123", "clientid":"1234567890"}`
		rec := testutil.Post(e, "/login/signin", p)
		assert.Equal(t, http.StatusOK, rec.Code)

		body, err := rec.BodyJson()
		assert.NoError(t, err)
		testutil.PrintPretty(body)
	})

	t.Run("OTPLoginSuccess", func(t *testing.T) {
		// 创建测试密码
		hashedPassword := secure.HashPassword("testpassword123")
		assert.NotEmpty(t, hashedPassword)

		// 创建 TOTP 密钥
		key, err := totp.Generate(totp.GenerateOpts{
			Issuer:      "lucky-byte.com",
			AccountName: "testuser",
		})
		assert.NoError(t, err)
		totpSecret := key.Secret()
		code, err := totp.GenerateCode(totpSecret, time.Now())
		assert.NoError(t, err)

		err = model.UserModel.UpsertOne(&db.User{
			UUID:       "test-user-uuid",
			Name:       "测试登录用户",
			UserId:     "testuser",
			Email:      "test@example.com",
			Mobile:     "13800138000",
			Passwd:     hashedPassword,
			SigninAt:   time.Now(),
			ACL:        biztestutil.ACL_ADMIN_UUID,
			TFA:        true,
			TOTPSecret: totpSecret,
		})
		assert.NoError(t, err)

		// 测试登录
		p := `{"mobile":"testuser", "password":"testpassword123", "clientid":"1234567890"}`
		rec := testutil.Post(e, "/login/signin", p)
		assert.Equal(t, http.StatusOK, rec.Code)

		body, err := rec.BodyJson()
		assert.NoError(t, err)
		testutil.PrintPretty(body)
		token := body["token"].(string)
		historyid := body["historyid"].(string)

		trust := body["trust"].(bool)
		if !trust {
			// OTP login
			p := fmt.Sprintf(`{"code":%s, "trust":true, "historyid":%s}`,
				strconv.Quote(code), strconv.Quote(historyid))
			rec := testutil.PostWithHeader(e, "/login/signin/otp/verify", p, http.Header{"Authorization": {"Bearer " + token}})
			assert.Equal(t, http.StatusOK, rec.Code)

			body, err := rec.BodyJson()
			assert.NoError(t, err)
			testutil.PrintPretty(body)

		}
	})

}
