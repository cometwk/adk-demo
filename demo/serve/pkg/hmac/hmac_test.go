package hmac

import (
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

func TestSHA256HexSaas_SpecExample(t *testing.T) {
	params := map[string]string{
		"amount":    "1",
		"attach":    "attach",
		"auth_code": "130261999983158564",
		"body":      "商品",
		"out_ordno": "1234567890_500",
	}
	timestamp := "1766241507"
	saasNo := "M009_MOCK"
	key := "api_key_M009_mock"

	expectedInput := "amount=1&attach=attach&auth_code=130261999983158564&body=商品&out_ordno=1234567890_500" +
		"&x-timestamp=1766241507&x-auth-saas-no=M009_MOCK&key=api_key_M009_mock"
	expectedHashBytes := sha256.Sum256([]byte(expectedInput))
	expectedToken := hex.EncodeToString(expectedHashBytes[:])
	if expectedToken != "eab1b222dba99a8ce9fd69819dcf3e734cf0d317c6d056913f7079d9ae209c87" {
		t.Fatalf("expected token constant drifted: got=%s", expectedToken)
	}

	got := SHA256HexSaas(params, timestamp, saasNo, key)
	if got != expectedToken {
		t.Fatalf("SHA256HexSaas mismatch: got=%s want=%s", got, expectedToken)
	}
}

func TestSHA256HexMerch_CompatibleWithOldTokenExample(t *testing.T) {
	params := map[string]string{
		"amount":    "1",
		"attach":    "attach",
		"auth_code": "130261999983158564",
		"body":      "商品",
		"out_ordno": "1234567890_500",
	}
	timestamp := "1766241507"
	merno := "M009_MOCK"
	key := "api_key_M009_mock"

	// 与历史实现/文档示例一致（x-auth-merno 参与签名串）
	want := "69dea69adb0d4498791c12288f7adaa9208e4f5468b8433c19b1b390c8f95c67"
	got := SHA256HexMerch(params, timestamp, merno, key)
	if got != want {
		t.Fatalf("SHA256HexMerch mismatch: got=%s want=%s", got, want)
	}
}

func TestSHA256HexAuth_DifferentAuthHeaderKeyNameChangesToken(t *testing.T) {
	params := map[string]string{
		"a": "1",
		"b": "2",
	}
	timestamp := "1700000000"
	authID := "ID001"
	key := "k"

	// 同样的 params/timestamp/authID/key，只要参与签名串的 header key 名称不同，签名必须不同
	saas := SHA256HexAuth(params, timestamp, "x-auth-saas-no", authID, key)
	merch := SHA256HexAuth(params, timestamp, "x-auth-merno", authID, key)
	if saas == merch {
		t.Fatalf("token should differ when authHeaderKeyName differs: token=%s", saas)
	}
}
