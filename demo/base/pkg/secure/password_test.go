package secure

import (
	"fmt"
	"testing"
)

func TestHashPassword(t *testing.T) {
	password := "123123"
	hash := HashPassword(password)
	if hash == "" {
		t.Error("HashPassword() returned empty hash for valid password")
	}
	fmt.Println(hash)
}

func TestVerifyPassword(t *testing.T) {
	password := "123123"
	hash := HashPassword(password)

	hash2 := "$argon2id$v=19$m=65536,t=3,p=2$hbEf+FyI2S0jmghnO5+7jw$gljag6J+YGV4jfhkpaNDxcZVBDIvShw5QqnrF9Mehrg"
	x2 := ValidatePassword(password, hash2)
	x := ValidatePassword(password, hash)
	fmt.Println(x, password, hash)
	fmt.Println(x2, password, hash2)
}
