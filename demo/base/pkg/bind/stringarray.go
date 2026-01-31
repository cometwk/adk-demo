package bind

import (
	"encoding/json"
	"strings"
)

type JsonStringArray []string

func (t *JsonStringArray) UnmarshalParam(src string) error {
	err := json.Unmarshal([]byte(src), t)
	if err != nil {
		return err
	}
	// s, _ := json.Marshal(t)
	// println(string(s))
	return nil
}

type StringArray []string

func (t *StringArray) UnmarshalParam(src string) error {
	a := strings.Split(src, ",")
	*t = a
	return nil
}
