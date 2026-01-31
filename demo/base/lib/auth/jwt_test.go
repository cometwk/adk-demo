package auth_test

import (
	"testing"
	"time"

	"github.com/cometwk/base/lib/auth"
	"github.com/stretchr/testify/assert"
)

func TestJWTGenerateAndParse(t *testing.T) {
	tests := []struct {
		name    string
		jwt     *auth.AuthJWT
		wantErr bool
	}{
		{
			name:    "正常用户JWT",
			jwt:     auth.NewAuthJWT("testuser", true, 24*time.Hour),
			wantErr: false,
		},
		{
			name:    "未激活用户JWT",
			jwt:     auth.NewAuthJWT("inactiveuser", false, 24*time.Hour),
			wantErr: false,
		},
		{
			name:    "短期JWT",
			jwt:     auth.NewAuthJWT("shortuser", true, 1*time.Hour),
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// 生成 JWT
			token, err := auth.JWTGenerate(nil, tt.jwt)
			if tt.wantErr {
				assert.Error(t, err)
				return
			}
			assert.NoError(t, err)
			assert.NotEmpty(t, token)

			// 解析 JWT
			parsed, err := auth.JWTParse(nil, token)
			assert.NoError(t, err)
			assert.NotNil(t, parsed)

			// 验证解析后的数据
			assert.Equal(t, tt.jwt.User, parsed.User)
			assert.Equal(t, tt.jwt.Activate, parsed.Activate)
			assert.Equal(t, "LUCKYBYTE", parsed.Issuer)
			assert.True(t, parsed.ExpiresAt.After(time.Now()))
		})
	}
}

func TestJWTParse_Invalid(t *testing.T) {
	tests := []struct {
		name    string
		token   string
		wantErr bool
	}{
		{
			name:    "空token",
			token:   "",
			wantErr: true,
		},
		{
			name:    "无效token",
			token:   "invalid.token.string",
			wantErr: true,
		},
		{
			name:    "格式错误的token",
			token:   "invalidtoken",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parsed, err := auth.JWTParse(nil, tt.token)
			assert.Error(t, err)
			assert.Nil(t, parsed)
		})
	}
}
