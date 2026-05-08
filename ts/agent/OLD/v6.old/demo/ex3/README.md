### demo/ex3（图书馆借书决策支持场景）

## 场景描述

📚 **小明想借一本书**

图书馆规定：
- 每个读者最多只能借 3 本书；
- 新书（刚上架不到 7 天）不能外借，只能在馆内阅读；
- 如果读者有逾期未还的书，就不能再借新书。

---

## 领域建模

### 实体类型

| 类型 | 属性 | 方法 |
|------|------|------|
| `Reader` | `borrowedCount`, `hasOverdue`, `overdueCount` | `checkBorrowCapacity()`, `checkOverdueBlock()` |
| `Book` | `title`, `category`, `isNew`, `shelvedAt`, `canCheckout`, `status` | `checkNewBookStatus()`, `checkAvailability()` |
| `Library` | `name`, `borrowLimit`, `newBookRestrictionDays` | `evaluateBorrowRequest()` |
| `BorrowRecord` | `borrowedAt`, `dueDate`, `returnedAt`, `isOverdue` | `checkOverdue()` |

### 关系

```
Reader --member_of--> Library
Reader --borrows--> Book
Reader --has_record--> BorrowRecord
BorrowRecord --for_book--> Book
Library --holds--> Book
Book --borrowed_by--> Reader
```

---

## 规则设计

| rule id | kind | direction | 描述 | veto |
|---------|------|-----------|------|------|
| `reader_borrow_limit` | hard_constraint | risk_up | 已借 ≥ 3 本 → 拒绝 | ALLOWED |
| `new_book_restricted` | hard_constraint | risk_up | 上架 < 7 天 → 仅馆内阅读 | ALLOWED |
| `reader_overdue_block` | hard_constraint | risk_up | 有逾期 → 禁止借新书 | ALLOWED |
| `book_availability` | soft_criterion | risk_up | 图书不可用（已借出/仅馆内） | - |
| `compute_days_since_shelved` | inference_rule | neutral | 计算上架天数（派生事实） | - |

### 候选答案

- `ALLOWED`: 可以借阅
- `DENIED`: 拒绝借阅

---

## 因果图

用于诊断模式（分析借阅被拒绝的原因）：

```
book_shelved → isNew=true
isNew=true && daysSinceShelved<7 → borrow_rejected (new_book_restricted)

due_date_passed → hasOverdue=true
hasOverdue=true → borrow_rejected (reader_overdue_block)

borrowedCount>=3 → borrow_rejected (reader_borrow_limit)

book_borrowed → status=borrowed
status=borrowed || canCheckout=false → borrow_rejected (book_availability)
```

---

## 事件时间线

| 时间 | 事件 | 影响 |
|------|------|------|
| T-10d | 李四借书 | `borrowedCount += 1` |
| T-4d | 李四逾期 | `hasOverdue = true` |
| T-2d | 新书上架 | `isNew = true`, `shelvedAt = 2026-05-01` |
| T-0 | 小明尝试借新书 | `borrow_rejected` (new_book_restricted) |
| T-0 | 李四尝试借书 | `borrow_rejected` (reader_overdue_block) |

---

## 测试场景

| 读者 | 图书 | 预期结果 | 阻止规则 |
|------|------|----------|----------|
| 小明 (2本,无逾期) | book_new_ai (上架2天) | DENIED | new_book_restricted |
| 小明 (2本,无逾期) | book_design_patterns (上架32天) | DENIED | book_availability (已被借) |
| 张三 (3本,无逾期) | book_design_patterns | DENIED | reader_borrow_limit |
| 李四 (1本,有逾期) | book_new_ai | DENIED | reader_overdue_block |
| 王五 (0本,无逾期) | book_new_ai | DENIED | new_book_restricted |
| 王五 (0本,无逾期) | book_design_patterns | DENIED | book_availability |

---

## 运行方式

```bash
npx tsx src/v6/demo/ex3/main.ts
```

运行四轮：
1. Predictive：小明可以借 book_new_ai 吗？
2. Diagnostic：小明借 book_new_ai 为什么被拒绝？
3. Predictive：张三可以借 book_design_patterns 吗？（达到上限）
4. Predictive：李四可以借 book_new_ai 吗？（逾期阻止）