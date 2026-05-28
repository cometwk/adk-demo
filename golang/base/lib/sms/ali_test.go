package sms

import (
	"testing"

	"github.com/lucky-byte/base/lib/db"
)

func TestSendWithAliyun(t *testing.T) {
	keyId := ""
	keySecret := ""
	sms := &db.SMS{
		ISP:       "aliyun",
		ISPName:   "阿里云",
		SecretId:  keyId,
		SecretKey: keySecret,
		Prefix:    "彩道科技",
		TextNo1:   "SMS_504145037",
	}

	err := sendWithAliyun("13708009054", sms.TextNo1, map[string]string{"name": "测试企业名称"}, sms)
	if err != nil {
		t.Fatal(err)
	}
	t.Log("发送成功")
}
