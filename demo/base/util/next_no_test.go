package util_test

import (
	"fmt"
	"sync"
	"testing"

	"github.com/cometwk/base/util"
	"github.com/cometwk/lib/pkg/orm"
	"github.com/stretchr/testify/assert"
)

func TestIdGenerator(t *testing.T) {
	orm.InitDefaultDB()
	db := orm.MustDB()

	idGenerator := util.NewIdGenerator2(db, "test2", "")

	t.Run("ensure variable json value", func(t *testing.T) {
		id := idGenerator.GetNextId()
		println(id)
	})
}

// TestForceOptimisticLock 强制触发乐观锁失败的测试
func TestForceOptimisticLock(t *testing.T) {
	orm.InitDefaultDB()
	db := orm.MustDB()

	// 清理测试数据
	db.Exec("delete from bpm_property where name = 'test_force_optimistic_lock'")

	// 创建多个ID生成器，使用特殊的名称来触发延迟
	generators := make([]util.IdGenerator, 5)
	for i := 0; i < 5; i++ {
		generators[i] = util.NewIdGenerator2(db, "test_force_optimistic_lock", fmt.Sprintf("%d", i), 1) // 小批量大小，更容易触发
	}

	// 并发获取ID，必然触发乐观锁失败
	var wg sync.WaitGroup
	var optimisticLockErrors int
	var mu sync.Mutex

	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()

			defer func() {
				if r := recover(); r != nil {
					mu.Lock()
					optimisticLockErrors++
					mu.Unlock()
					t.Logf("Goroutine %d 触发乐观锁失败: %v", index, r)
				}
			}()

			// 随机选择生成器
			generatorIndex := index % len(generators)
			t.Logf("Goroutine %d , %d Trying", index, generatorIndex)
			id := generators[generatorIndex].GetNextId()
			t.Logf("Goroutine %d , %d 成功获取ID: %s", index, generatorIndex, id)

		}(i)
	}

	wg.Wait()

	// 验证是否触发了乐观锁失败
	t.Logf("乐观锁失败次数: %d", optimisticLockErrors)
	assert.Greater(t, optimisticLockErrors, 0, "应该至少触发一次乐观锁失败")
}
func TestDeferError(t *testing.T) {

	openTx := func(i int) int {
		fmt.Printf("open tx %d\n", i)
		return i
	}
	commitTx := func(i int) {
		fmt.Printf("commit tx %d\n", i)
	}

	closeTx := func(i int) {
		fmt.Printf("close tx %d\n", i)
	}

	doSomethingErrorCase := func() {
		for i := 0; i < 3; i++ {
			tx := openTx(i)
			defer closeTx(tx)

			if i == 0 {
				fmt.Println("continue")
				continue
			}
			fmt.Println("do something")
			commitTx(tx)
			return
		}
	}

	t.Run("error case", func(t *testing.T) {
		doSomethingErrorCase()
	})

	doSomethingRightCase := func() {
		for i := 0; i < 3; i++ {
			// 用匿名函数作用域来控制 defer 的生命周期
			retry := func() bool {
				tx := openTx(i)
				defer closeTx(tx)

				if i == 0 {
					fmt.Println("continue")
					return true
				}
				fmt.Println("do something")
				commitTx(tx)
				return false
			}()
			if retry {
				continue
			}
			return
		}

	}

	t.Run("right case", func(t *testing.T) {
		doSomethingRightCase()
	})

}
