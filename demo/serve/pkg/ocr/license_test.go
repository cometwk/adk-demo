package ocr_test

import (
	"fmt"
	"testing"

	"github.com/cometwk/serve/pkg/ocr"
)

func TestOCRLicense(t *testing.T) {
	license, err := ocr.OCRLicense("./testdata/license2.jpg")
	if err != nil {
		fmt.Printf("OCRLicense error: %v\n", err)
		return
	}
	fmt.Printf("license: %+v\n", license)

	// assert.Equal(t, idCard.Address, "山东省滕州市龙阳镇")

}
