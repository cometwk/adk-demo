package biz

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"xorm.io/builder"
	"xorm.io/xorm"
)

type CompositeKey interface {
	Encode() string
	Decode(id string) error
	Filter() builder.Cond
}

// spec

// PRIMARY KEY (ancestor_id, descendant_id),
const compositeKeySeparator = "_"

func (c *AgentClosure) Encode() string {
	return fmt.Sprintf("%d%s%d", c.AncestorID, compositeKeySeparator, c.DescendantID)
}

func (c *AgentClosure) Decode(id string) error {
	var err error
	arr := strings.Split(id, compositeKeySeparator)
	if len(arr) != 2 {
		return fmt.Errorf("invalid id: %s", id)
	}
	c.AncestorID, err = strconv.ParseInt(arr[0], 10, 64)
	if err != nil {
		return fmt.Errorf("invalid ancestor id: %s", arr[0])
	}
	c.DescendantID, err = strconv.ParseInt(arr[1], 10, 64)
	if err != nil {
		return fmt.Errorf("invalid descendant id: %s", arr[1])
	}
	return nil
}

func (e *AgentClosure) MarshalJSON() ([]byte, error) {
	type Alias AgentClosure

	return json.Marshal(&struct {
		*Alias
		ID string `json:"id"`
	}{
		Alias: (*Alias)(e),
		ID:    e.Encode(),
	})
}

func (e *AgentClosure) Filter() builder.Cond {
	cond := builder.And(
		builder.Eq{"ancestor_id": e.AncestorID},
		builder.Eq{"descendant_id": e.DescendantID},
	)
	return cond
}

var _ CompositeKey = &AgentClosure{}

func applyCompositeKeyFilter[T any](session *xorm.Session, params map[string]string) (*xorm.Session, error) {
	ck, ok := any(new(T)).(CompositeKey)
	if !ok {
		return session, nil
	}
	id := params["id"]
	if id != "" {
		delete(params, "id")
	} else if id = params["where.id.eq"]; id != "" {
		delete(params, "where.id.eq")
	}
	if id == "" {
		return session, nil
	}
	if err := ck.Decode(id); err != nil {
		return session, fmt.Errorf("invalid CompositeKey id: %w", err)
	}
	return session.Where(ck.Filter()), nil
}
