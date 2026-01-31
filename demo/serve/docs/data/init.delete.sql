-- 反向清理测试数据（对应 serve/docs/data/init.sql）
-- 说明：
-- - 该文件仅清理由 init.sql 插入的业务演示数据

START TRANSACTION;

-- 1) 删除用户（users）
DELETE FROM users
WHERE userid IN ('AG001','AG002','AG003','M009_MOCK','M010_CCB','S001')
   OR uuid IN ('e33c792f-3d9e-47c5-a973-AG001','e33c792f-3d9e-47c5-a973-AG002','e33c792f-3d9e-47c5-a973-M009_MOCK',
              'e33c792f-3d9e-47c5-a973-M010_CCB','e33c792f-3d9e-47c5-a973-S001');

COMMIT;


