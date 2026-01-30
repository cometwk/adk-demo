package main

import (
	"encoding/json"
	"fmt"
	"reflect"
)

type IdCard struct {
	Name             *string `json:"name" jsonschema:"type:string 姓名"`
	Gender           *string `json:"gender" jsonschema:"type:string enum:['Male','Female'] 性别"`
	Ethnicity        *string `json:"ethnicity" jsonschema:"type:string 民族"`
	BirthDate        *string `json:"birthDate" jsonschema:"type:string pattern:^\\d{4}年\\d{2}月\\d{2}日$ 出生日期"`
	Address          *string `json:"address" jsonschema:"type:string 住址"`
	IDNumber         *string `json:"idNumber" jsonschema:"type:string pattern:^\\d{17}[\\dXx]$ 公民身份号码"`
	IssuingAuthority *string `json:"issuingAuthority" jsonschema:"type:string 签发机关"`
	ValidPeriod      *string `json:"validPeriod" jsonschema:"type:string pattern:^\\d{4}\\.\\d{2}\\.\\d{2}-\\d{4}\\.\\d{2}\\.\\d{2}$ 有效期限"`
}

func OCRIdCard(path string) (*IdCard, error) {
	var idCard IdCard
	schema, err := toSchema(reflect.TypeFor[IdCard]())
	if err != nil {
		return nil, err
	}
	imageBase64, err := readImageToBase64(path)
	if err != nil {
		return nil, err
	}
	result, err := OCR("请识别图片中的身份证信息", imageBase64, schema)
	if err != nil {
		return nil, err
	}
	err = json.Unmarshal([]byte(result.Choices[0].Message.Content), &idCard)
	if err != nil {
		return nil, err
	}
	return &idCard, nil
}

func main() {
	idCard, err := OCRIdCard("/Users/wukun/dev/justtest/agent-demo/agent/src/sample/idcard1.jpeg")
	if err != nil {
		fmt.Printf("OCRIdCard error: %v\n", err)
		return
	}
	idCard2, err2 := OCRIdCard("/Users/wukun/dev/justtest/agent-demo/agent/src/sample/2.jpeg")
	if err2 != nil {
		fmt.Printf("OCRIdCard error: %v\n", err2)
		return
	}
	fmt.Printf("IdCard: %+v\n", idCard)
	fmt.Printf("IdCard2: %+v\n", idCard2)
}
