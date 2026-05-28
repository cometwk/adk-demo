-- 图书馆初始化数据
-- 基于增强版图书馆模型：6类型/10关系/8约束

-- ============================================================
-- 实体数据
-- ============================================================

-- 分馆
INSERT INTO lib_branch (id, branch_code, name, max_borrow_per_reader, new_book_protection_days, allow_inter_library_loan) VALUES
(1, 'branch_central', '中央图书馆', 3, 7, 1),
(2, 'branch_west',    '西区分馆',   3, 7, 1);

-- 类目
INSERT INTO lib_category (id, category_code, name, is_restricted, required_membership_level) VALUES
(1, 'cat_science', '自然科学', 1, 'gold'),
(2, 'cat_fiction', '文学虚构', 0, 'basic'),
(3, 'cat_history', '历史人文', 0, 'basic');

-- 作者
INSERT INTO lib_author (id, author_code, name, nationality, active_book_count) VALUES
(1, 'author_liu',     '刘慈欣',       '中国',   4),
(2, 'author_rowling', 'J.K.罗琳',     '英国',   3),
(3, 'author_harari',  '尤瓦尔·赫拉利', '以色列', 1);

-- 系列
INSERT INTO lib_series (id, series_code, name, total_volumes) VALUES
(1, 'series_three_body', '三体三部曲', 3),
(2, 'series_hp',         '哈利波特',   7);

-- 书籍
-- author_id/category_id/series_id 引用上方实体ID
INSERT INTO lib_book (id, book_code, title, isbn, days_on_shelf, total_copies, available_copies, series_volume, author_id, category_id, series_id) VALUES
-- 三体系列（科学类，刘慈欣）
(1, 'book_tb1',      '三体（第一部）',            '978-7-229-03093-3', 100, 4, 1, 1, 1, 1, 1),
(2, 'book_tb2',      '三体·黑暗森林（第二部）',    '978-7-229-03094-0',  80, 3, 0, 2, 1, 1, 1),
(3, 'book_tb3',      '三体·死神永生（第三部）',    '978-7-229-03095-7',  50, 2, 2, 3, 1, 1, 1),
-- 哈利波特系列（文学类，罗琳）
(4, 'book_hp1',      '哈利·波特与魔法石',         '978-7-5327-4356-2', 300, 4, 2, 1, 2, 2, 2),
(5, 'book_hp2',      '哈利·波特与密室',           '978-7-5327-4357-9', 200, 2, 0, 2, 2, 2, 2),
(6, 'book_hp3',      '哈利·波特与阿兹卡班的囚徒', '978-7-5327-4358-6',   5, 2, 1, 3, 2, 2, 2),
-- 独立书目
(7, 'book_quantum',  '量子纠缠导论',              '978-7-03-061234-8',   2, 1, 1, 0, 1, 1, 0),
(8, 'book_sapiens',  '人类简史',                  '978-0-06-231609-7',  90, 5, 3, 0, 3, 3, 0),
-- 馆际互借测试专用：只在主馆有库存
(9, 'book_cosmos',   '宇宙的奇迹',                '978-7-5327-9876-3', 120, 2, 2, 0, 3, 3, 0);

-- 读者
INSERT INTO lib_reader (id, reader_code, name, membership_level, current_borrow_count, registered_days, branch_id) VALUES
(1, 'xiao_ming',  '小明', 'gold',   2, 365, 1),  -- 金卡，已借2本，中央馆
(2, 'xiao_hong',  '小红', 'basic',  0,  30, 2),  -- 普通卡，0借，西馆
(3, 'lao_wang',   '老王', 'silver', 3, 720, 1),  -- 银卡，已借3本达上限，中央馆
(4, 'xiao_li',    '小李', 'gold',   1, 180, 2),  -- 金卡，已借1本，有逾期，西馆
(5, 'user_a',     '用户A', 'basic',  0,  60, 1),  -- 虚拟用户，占预约位
(6, 'user_b',     '用户B', 'basic',  0,  60, 2);  -- 虚拟用户，占预约位

-- ============================================================
-- 关系数据
-- ============================================================

-- ── 分馆互联 ──
INSERT INTO lib_relation (id, from_type, from_id, to_type, to_id, rel_type) VALUES
(1,  'Branch', 1, 'Branch', 2, 'partners_with'),
(2,  'Branch', 2, 'Branch', 1, 'partners_with');

-- ── 作者专长 ──
INSERT INTO lib_relation (id, from_type, from_id, to_type, to_id, rel_type) VALUES
(3,  'Author', 1, 'Category', 1, 'specializes_in'),  -- 刘慈欣 → 自然科学
(4,  'Author', 2, 'Category', 2, 'specializes_in'),  -- 罗琳 → 文学虚构
(5,  'Author', 3, 'Category', 3, 'specializes_in');  -- 赫拉利 → 历史人文

-- ── 书籍 → 作者 (written_by) ──
INSERT INTO lib_relation (id, from_type, from_id, to_type, to_id, rel_type) VALUES
(6,  'Book', 1, 'Author', 1, 'written_by'),   -- tb1 → 刘慈欣
(7,  'Book', 2, 'Author', 1, 'written_by'),   -- tb2 → 刘慈欣
(8,  'Book', 3, 'Author', 1, 'written_by'),   -- tb3 → 刘慈欣
(9,  'Book', 7, 'Author', 1, 'written_by'),   -- quantum → 刘慈欣
(10, 'Book', 4, 'Author', 2, 'written_by'),   -- hp1 → 罗琳
(11, 'Book', 5, 'Author', 2, 'written_by'),   -- hp2 → 罗琳
(12, 'Book', 6, 'Author', 2, 'written_by'),   -- hp3 → 罗琳
(13, 'Book', 8, 'Author', 3, 'written_by'),   -- sapiens → 赫拉利
(14, 'Book', 9, 'Author', 3, 'written_by');   -- cosmos → 赫拉利

-- ── 书籍 → 类目 (belongs_to) ──
INSERT INTO lib_relation (id, from_type, from_id, to_type, to_id, rel_type) VALUES
(15, 'Book', 1, 'Category', 1, 'belongs_to'),  -- tb1 → 自然科学
(16, 'Book', 2, 'Category', 1, 'belongs_to'),  -- tb2 → 自然科学
(17, 'Book', 3, 'Category', 1, 'belongs_to'),  -- tb3 → 自然科学
(18, 'Book', 7, 'Category', 1, 'belongs_to'),  -- quantum → 自然科学
(19, 'Book', 4, 'Category', 2, 'belongs_to'),  -- hp1 → 文学虚构
(20, 'Book', 5, 'Category', 2, 'belongs_to'),  -- hp2 → 文学虚构
(21, 'Book', 6, 'Category', 2, 'belongs_to'),  -- hp3 → 文学虚构
(22, 'Book', 8, 'Category', 3, 'belongs_to'),  -- sapiens → 历史人文
(23, 'Book', 9, 'Category', 3, 'belongs_to');  -- cosmos → 历史人文

-- ── 书籍 → 系列 (part_of) ──
INSERT INTO lib_relation (id, from_type, from_id, to_type, to_id, rel_type) VALUES
(24, 'Book', 1, 'Series', 1, 'part_of'),  -- tb1 → 三体三部曲
(25, 'Book', 2, 'Series', 1, 'part_of'),  -- tb2 → 三体三部曲
(26, 'Book', 3, 'Series', 1, 'part_of'),  -- tb3 → 三体三部曲
(27, 'Book', 4, 'Series', 2, 'part_of'),  -- hp1 → 哈利波特
(28, 'Book', 5, 'Series', 2, 'part_of'),  -- hp2 → 哈利波特
(29, 'Book', 6, 'Series', 2, 'part_of');  -- hp3 → 哈利波特

-- ── 书籍 → 分馆库存 (available_at) ──
INSERT INTO lib_relation (id, from_type, from_id, to_type, to_id, rel_type) VALUES
(30, 'Book', 1, 'Branch', 1, 'available_at'),  -- tb1 → 中央馆
(31, 'Book', 1, 'Branch', 2, 'available_at'),  -- tb1 → 西馆
(32, 'Book', 2, 'Branch', 1, 'available_at'),  -- tb2 → 中央馆
(33, 'Book', 3, 'Branch', 2, 'available_at'),  -- tb3 → 西馆
(34, 'Book', 4, 'Branch', 1, 'available_at'),  -- hp1 → 中央馆
(35, 'Book', 4, 'Branch', 2, 'available_at'),  -- hp1 → 西馆
(36, 'Book', 5, 'Branch', 1, 'available_at'),  -- hp2 → 中央馆
(37, 'Book', 6, 'Branch', 2, 'available_at'),  -- hp3 → 西馆
(38, 'Book', 7, 'Branch', 1, 'available_at'),  -- quantum → 中央馆
(39, 'Book', 8, 'Branch', 1, 'available_at'),  -- sapiens → 中央馆
(40, 'Book', 8, 'Branch', 2, 'available_at'),  -- sapiens → 西馆
(41, 'Book', 9, 'Branch', 1, 'available_at');  -- cosmos → 中央馆

-- ── 读者 → 分馆注册 (registered_at) ──
INSERT INTO lib_relation (id, from_type, from_id, to_type, to_id, rel_type) VALUES
(42, 'Reader', 1, 'Branch', 1, 'registered_at'),  -- 小明 → 中央馆
(43, 'Reader', 2, 'Branch', 2, 'registered_at'),  -- 小红 → 西馆
(44, 'Reader', 3, 'Branch', 1, 'registered_at'),  -- 老王 → 中央馆
(45, 'Reader', 4, 'Branch', 2, 'registered_at'),  -- 小李 → 西馆
(46, 'Reader', 5, 'Branch', 1, 'registered_at'),  -- 用户A → 中央馆
(47, 'Reader', 6, 'Branch', 2, 'registered_at');  -- 用户B → 西馆

-- ── 读者 → 书籍借阅 (borrows) ──
INSERT INTO lib_relation (id, from_type, from_id, to_type, to_id, rel_type) VALUES
-- 小明：借了 tb1 + tb2
(48, 'Reader', 1, 'Book', 1, 'borrows'),
(49, 'Reader', 1, 'Book', 2, 'borrows'),
-- 老王：借了 hp1 + sapiens + tb1（达上限3本）
(50, 'Reader', 3, 'Book', 4, 'borrows'),
(51, 'Reader', 3, 'Book', 8, 'borrows'),
(52, 'Reader', 3, 'Book', 1, 'borrows'),
-- 小李：借了 hp1
(53, 'Reader', 4, 'Book', 4, 'borrows');

-- ── 读者 → 逾期 (overdue) ──
INSERT INTO lib_relation (id, from_type, from_id, to_type, to_id, rel_type) VALUES
(54, 'Reader', 4, 'Book', 5, 'overdue');  -- 小李逾期未还 hp2

-- ── 读者 → 预约 (reserves) ──
-- book_hp3 有 6 个预约，超过 5 个上限
INSERT INTO lib_relation (id, from_type, from_id, to_type, to_id, rel_type) VALUES
(55, 'Reader', 1, 'Book', 6, 'reserves'),   -- 小明预约 hp3
(56, 'Reader', 2, 'Book', 6, 'reserves'),   -- 小红预约 hp3
(57, 'Reader', 3, 'Book', 6, 'reserves'),   -- 老王预约 hp3
(58, 'Reader', 4, 'Book', 6, 'reserves'),   -- 小李预约 hp3
(59, 'Reader', 5, 'Book', 6, 'reserves'),   -- 用户A预约 hp3
(60, 'Reader', 6, 'Book', 6, 'reserves');   -- 用户B预约 hp3
