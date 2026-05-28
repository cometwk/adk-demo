package sms

import (
	"encoding/json"
	"fmt"

	openapi "github.com/alibabacloud-go/darabonba-openapi/v2/client"
	dysmsapi20170525 "github.com/alibabacloud-go/dysmsapi-20170525/v5/client"
	util "github.com/alibabacloud-go/tea-utils/v2/service"
	"github.com/alibabacloud-go/tea/tea"
	"github.com/lucky-byte/base/lib/db"
	"github.com/pkg/errors"
)

func createAliyunClient(sms *db.SMS) (*dysmsapi20170525.Client, error) {
	config := &openapi.Config{
		AccessKeyId:     tea.String(sms.SecretId),
		AccessKeySecret: tea.String(sms.SecretKey),
		Endpoint:        tea.String("dysmsapi.aliyuncs.com"),
	}
	return dysmsapi20170525.NewClient(config)
}

// sendWithAliyun 通过阿里云发送短信
// mobile: 手机号，templateCode: 短信模板 Code，params: 模板变量值列表，sms: 服务商配置
func sendWithAliyun(mobile string, templateCode string, params map[string]string, sms *db.SMS) error {
	if len(sms.SecretId) == 0 || len(sms.SecretKey) == 0 || len(sms.Prefix) == 0 {
		return fmt.Errorf("阿里云短信服务配置不完整")
	}

	client, err := createAliyunClient(sms)
	if err != nil {
		return errors.Wrap(err, "创建阿里云短信客户端错")
	}

	// 将参数列表构建为 JSON，阿里云模板变量为 {"code": "123456"} 形式
	templateParam := "{}"
	if len(params) > 0 {
		b, err := json.Marshal(params)
		if err != nil {
			return errors.Wrap(err, "构建模板参数错")
		}
		templateParam = string(b)
	}

	req := &dysmsapi20170525.SendSmsRequest{
		PhoneNumbers:  tea.String(mobile),
		SignName:      tea.String(sms.Prefix),
		TemplateCode:  tea.String(templateCode),
		TemplateParam: tea.String(templateParam),
	}

	xlog.Infof("发送阿里云短信请求: phoneNumbers=%s templateCode=%s", mobile, templateCode)

	resp, err := client.SendSmsWithOptions(req, &util.RuntimeOptions{})
	if err != nil {
		if sdkErr, ok := err.(*tea.SDKError); ok {
			return fmt.Errorf("阿里云短信发送失败: %s", tea.StringValue(sdkErr.Message))
		}
		return errors.Wrap(err, "阿里云短信发送失败")
	}

	xlog.Infof("发送阿里云短信响应: %+v", resp.Body)

	if resp.Body != nil && tea.StringValue(resp.Body.Code) != "OK" {
		return fmt.Errorf("阿里云短信发送失败: %s", tea.StringValue(resp.Body.Message))
	}

	return nil
}
