package util

import (
	"errors"
	"strconv"
	"sync"

	"github.com/cometwk/base/model"
	"xorm.io/xorm"
)

const ID_GENERATOR_NAME = "next.dbid"

type IdGenerator interface {
	GetNextId() int64
}

type defaultIdGenerator struct {
	_id         string
	name        string
	idBlockSize int64
	nextId      int64
	lastId      int64
	db          *xorm.Engine
	lock        sync.Mutex
}

var ErrOptimisticLock = errors.New("optimistic lock failed")

func (d *defaultIdGenerator) GetNextId() int64 {
	d.lock.Lock()
	defer d.lock.Unlock()

	if d.nextId >= d.lastId {
		if err := d.getNewBlock(); err != nil {
			panic(err)
		}
	}

	id := d.nextId
	d.nextId++
	return id
}

func (d *defaultIdGenerator) getNewBlockOnce() error {
	tx := d.db.NewSession()
	defer tx.Close()

	if err := tx.Begin(); err != nil {
		return err
	}

	// 先查询
	property := &model.PropertyEntity{}
	found, err := tx.ID(d.name).Get(property)
	if err != nil {
		return err
	}
	if !found {
		property = &model.PropertyEntity{
			Name:  d.name,
			Value: "0",
		}
	}

	oldValue, err := strconv.ParseInt(property.Value, 10, 64)
	if err != nil {
		return err
	}
	newValue := oldValue + d.idBlockSize
	property.Value = strconv.FormatInt(newValue, 10)

	// if d.name == "test_force_optimistic_lock" {
	// 	// 添加延迟来增加并发冲突的概率
	// 	time.Sleep(10 * time.Millisecond)
	// }

	// UPSERT
	if found {
		n, err := tx.ID(d.name).Update(property)
		if err != nil {
			return err
		}
		if n == 0 {
			return ErrOptimisticLock
		}
	} else {
		n, err := tx.Insert(property)
		if err != nil {
			return err
		}
		if n == 0 {
			return errors.New("insert failed")
		}
	}

	d.nextId = oldValue
	d.lastId = newValue

	return tx.Commit()
}

func (d *defaultIdGenerator) getNewBlock() error {
	maxRetries := 3
	for retry := range maxRetries {
		if err := d.getNewBlockOnce(); err != nil {
			if errors.Is(err, ErrOptimisticLock) {
				// if d.name == "test_force_optimistic_lock" {
				// 	// 乐观锁失败，记录日志并重试
				// 	fmt.Printf("%s乐观锁失败，重试次数:%d\n", d._id, retry+1)
				// }
				if retry == maxRetries-1 {
					return errors.New("optimistic lock failed after max retries")
				}
				continue
			}
			return err
		}
		return nil
	}
	return errors.New("optimistic lock failed after max retries")
}

func NewIdGenerator(db *xorm.Engine, idBlockSize ...int64) IdGenerator {
	return NewIdGenerator2(db, ID_GENERATOR_NAME, "", idBlockSize...)
}

func NewIdGenerator2(db *xorm.Engine, name, id string, idBlockSize ...int64) IdGenerator {
	var blockSize int64 = 100
	if len(idBlockSize) > 0 {
		blockSize = idBlockSize[0]
	}
	return &defaultIdGenerator{
		_id:         id,
		name:        name,
		db:          db,
		idBlockSize: blockSize,
	}
}
