package main

import (
	"context"
	// "github.com/cometwk/lib/pkg/log"
)

func main() {

	// orm.InitDefaultDB()
	initTestDB()
	// orm.InitDefaultDB()

	RunExample(context.Background(), ExampleOptions{
		Consumer: true,
		Producer: true,
		Stats:    false,
		Cleaner:  false,
	})
}
