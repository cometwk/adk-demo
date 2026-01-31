package ocr

import (
	"encoding/json"
	"reflect"
)

type License struct {
	UnifiedSocialCreditCode string `json:"unifiedSocialCreditCode" jsonschema:"type:string 统一社会信用代码"`
	CompanyName             string `json:"companyName" jsonschema:"type:string 公司名称"`
	Type                    string `json:"type" jsonschema:"type:string 企业类型"`
	LegalRepresentative     string `json:"legalRepresentative" jsonschema:"type:string 法定代表人"`
	RegisteredCapital       string `json:"registeredCapital" jsonschema:"type:string 注册资本（含单位，如“100万元人民币”）"`
	EstablishmentDate       string `json:"establishmentDate" jsonschema:"type:string 成立日期（如“2020年05月12日”）"`
	BusinessTerm            string `json:"businessTerm" jsonschema:"type:string 营业期限（如“2020年05月12日至长期 (或: 至******)”）"`
	Address                 string `json:"address" jsonschema:"type:string 住所 (或: 注册地址)"`
	BusinessScope           string `json:"businessScope" jsonschema:"type:string 经营范围"`
	RegistrationAuthority   string `json:"registrationAuthority" jsonschema:"type:string 登记机关"`
	IssueDate               string `json:"issueDate" jsonschema:"type:string 发照日期"`
}

func OCRLicense(path string) (*License, error) {
	var license License
	schema, err := toSchema(reflect.TypeFor[License]())
	if err != nil {
		return nil, err
	}
	imageBase64, err := readImageToBase64(path)
	if err != nil {
		return nil, err
	}
	result, err := OCR(`请识别图片中的营业执照信息`, imageBase64, schema)
	if err != nil {
		return nil, err
	}
	err = json.Unmarshal([]byte(result.Choices[0].Message.Content), &license)
	if err != nil {
		return nil, err
	}
	return &license, nil
}
