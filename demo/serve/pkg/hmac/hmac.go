package hmac

import (
	"crypto/sha256"
	"encoding/hex"
	"sort"
	"strings"
)

// SHA256HexAuth 计算请求签名，返回十六进制字符串（小写）。
//
// 签名串拼接规则：
//  1) 将 params 按 key 字母序排序，构造 k=v&k=v...
//  2) 追加固定顺序：
//     &x-timestamp=<timestamp>&<authHeaderKeyName>=<authID>&key=<key>
//
// 注意：authHeaderKeyName 必须是完整 header 名称（例如 "x-auth-saas-no" / "x-auth-merno"）。
func SHA256HexAuth(params map[string]string, timestamp, authHeaderKeyName, authID, key string) string {
	keyValueString := buildKeyValueString(params)
	input := keyValueString +
		"&x-timestamp=" + timestamp +
		"&" + authHeaderKeyName + "=" + authID +
		"&key=" + key
	hash := sha256.Sum256([]byte(input))
	return hex.EncodeToString(hash[:])
}

// SHA256HexMerch 商户侧签名（wrapper）。
func SHA256HexMerch(params map[string]string, timestamp, merno, key string) string {
	return SHA256HexAuth(params, timestamp, "x-auth-merno", merno, key)
}

// SHA256HexSaas 服务商侧签名（wrapper）。
func SHA256HexSaas(params map[string]string, timestamp, saasNo, key string) string {
	return SHA256HexAuth(params, timestamp, "x-auth-saas-no", saasNo, key)
}

func buildKeyValueString(params map[string]string) string {
	if len(params) == 0 {
		return ""
	}

	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	pairs := make([]string, 0, len(keys))
	for _, k := range keys {
		pairs = append(pairs, k+"="+params[k])
	}

	return strings.Join(pairs, "&")
}

