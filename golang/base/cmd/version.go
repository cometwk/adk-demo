package cmd

import (
	"fmt"
	"time"
)

var (
	Name      = "ReactGo"
	Version   = "dev"
	BuildDate = ""
	BuildYear = ""
)

func GetVersion() string {
	if BuildDate == "" {
		BuildDate = time.Now().Format("20060102")
	}
	return fmt.Sprintf("v1.0-%s", BuildDate)
}
