package bind

import (
	"strings"
	"testing"
)

func Test1(t *testing.T) {
	s := "a,b,c"
	a := strings.Split(s, ",")
	t.Log(a)
}
