package sms

import (
	"fmt"
	"regexp"

	"github.com/lucky-byte/base/lib/db"
	"github.com/pkg/errors"
)

func Send(mobile string, textno int, params map[string]string) error {
	if len(mobile) == 0 {
		return fmt.Errorf("手机号不能为空")
	}
	r, err := regexp.Compile(`^1[0-9]{10}$`)
	if err != nil {
		return errors.Wrap(err, "检查手机号格式错(编译正则表达式错误)")
	}
	m := mobile
	if !r.MatchString(m) {
		return fmt.Errorf("手机号格式错误(%s)", m)
	}
	if textno < 1 || textno > 4 {
		return fmt.Errorf("textno %d 无效", textno)
	}
	ql := `select * from smss where disabled = false order by sortno`
	var smss []db.SMS

	if err := db.Select(ql, &smss); err != nil {
		return err
	}
	// 逐个尝试，遇到第一个成功发送的为止
	for _, s := range smss {
		err := SendWith(&s, mobile, textno, params)
		if err != nil {
			xlog.WithError(err).Errorf("通过 %s 发送短信错", s.ISP)
			continue
		}
		return nil
	}
	return fmt.Errorf("所有 %d 个短信服务商发送短信全部失败", len(smss))
}

func SendWith(sms *db.SMS, mobile string, textno int, params map[string]string) error {
	var err error = fmt.Errorf("短信运营商[%s][%s]不支持", sms.ISP, sms.ISPName)
	// if sms.ISP == "tencent" {
	// 	return sendWithTencent(mobile, textNo(sms, textno), params, sms)
	// }
	if sms.ISP == "aliyun" {
		err = sendWithAliyun(mobile, textNo(sms, textno), params, sms)
	}
	if err != nil {
		return err
	}

	ql := `update smss set nsent = nsent + 1 where uuid = ?`
	if err := db.Exec(ql, sms.UUID); err != nil {
		return err
	}
	return nil
}

func textNo(sms *db.SMS, textno int) string {
	switch textno {
	case 1:
		return sms.TextNo1
	case 2:
		return sms.TextNo2
	case 3:
		return sms.TextNo3
	case 4:
		return sms.TextNo4
	default:
		xlog.Panicf("短信 textno %d 无效", textno)
		return ""
	}
}

// 发送短信验证码
func SendTextNo1(mobile string, params map[string]string) error {
	return Send(mobile, 1, params)
}

// 发送通知短信
func SendTextNo2(mobile string, params map[string]string) error {
	return Send(mobile, 2, params)
}
