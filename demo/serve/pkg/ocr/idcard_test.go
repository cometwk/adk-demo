package ocr_test

import (
	"fmt"
	"testing"

	"github.com/cometwk/serve/pkg/ocr"
	"github.com/stretchr/testify/assert"
)

func TestOCRIdCard(t *testing.T) {
	idCard, err := ocr.OCRIdCard("./testdata/idcard1.jpeg")
	if err != nil {
		fmt.Printf("OCRIdCard error: %v\n", err)
		return
	}
	idCard2, err2 := ocr.OCRIdCard("./testdata/idcard2.jpeg")
	if err2 != nil {
		fmt.Printf("OCRIdCard error: %v\n", err2)
		return
	}
	fmt.Printf("IdCard: %+v\n", idCard)
	fmt.Printf("IdCard2: %+v\n", idCard2)

	assert.Equal(t, idCard.Address, "山东省滕州市龙阳镇")
	assert.Equal(t, idCard.BirthDate, "1989年6月01日")
	assert.Equal(t, idCard.Ethnicity, "汉")
	assert.Equal(t, idCard.Gender, "男")
	assert.Equal(t, idCard.IDNumber, "532101198906010015")
	assert.Equal(t, idCard.IssuingAuthority, "")
	assert.Equal(t, idCard.Name, "陈朋涛")
	assert.Equal(t, idCard.ValidPeriod, "")
	//
	assert.Equal(t, idCard2.Address, "")
	assert.Equal(t, idCard2.BirthDate, "")
	assert.Equal(t, idCard2.Ethnicity, "")
	assert.Equal(t, idCard2.Gender, "")
	assert.Equal(t, idCard2.IDNumber, "")
	assert.Equal(t, idCard2.IssuingAuthority, "上海市公安局静安分局")
	assert.Equal(t, idCard2.Name, "")
	assert.Equal(t, idCard2.ValidPeriod, "2008.09.08-2028.09.08")
}

func TestOCRIdCard0(t *testing.T) {
	idCard, err := ocr.OCRIdCard("./testdata/idcard1.jpeg")
	if err != nil {
		fmt.Printf("OCRIdCard error: %v\n", err)
		return
	}

	fmt.Printf("IdCard: %+v\n", idCard)
}
