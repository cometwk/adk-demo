package cache

import (
	"sync"

	"github.com/lucky-byte/graph/internal/errors"
	"github.com/lucky-byte/graph/internal/ir"
	"github.com/lucky-byte/graph/internal/limits"
)

// PlanCache 进程内 TraversalPlan 缓存。
type PlanCache struct {
	mu    sync.RWMutex
	store sync.Map
	count int
}

// NewPlanCache 创建空缓存。
func NewPlanCache() *PlanCache {
	return &PlanCache{}
}

// Get 按 plan ID 查找。
func (c *PlanCache) Get(id string) (*ir.TraversalPlan, bool) {
	v, ok := c.store.Load(id)
	if !ok {
		return nil, false
	}
	return v.(*ir.TraversalPlan), true
}

// Put 写入 plan；超出上限返回 ErrPlanCacheFull。
func (c *PlanCache) Put(plan *ir.TraversalPlan) error {
	if plan == nil || plan.ID == "" {
		return nil
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, loaded := c.store.LoadOrStore(plan.ID, plan); loaded {
		return nil
	}
	c.count++
	if c.count > limits.MaxPlanCacheEntries {
		c.store.Delete(plan.ID)
		c.count--
		return errors.ErrPlanCacheFull
	}
	return nil
}

// Len 返回条目数（测试用）。
func (c *PlanCache) Len() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.count
}
