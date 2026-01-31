
-- wk/123123
INSERT INTO users (uuid,create_at,update_at,signin_at,disabled,deleted,userid,passwd,name,avatar,email,mobile,idno,address,acct_name,acct_no,acct_idno,acct_mobile,acct_bank_name,tfa,acl,secretcode,totp_secret,n_signin,noti_popup,noti_browser,noti_mail) VALUES
	 ('e33c792f-3d9e-47c5-a973-f4ffc016a3dd','2025-01-01 03:45:36','2025-01-01 03:45:36','2025-02-11 03:52:13',0,0,'wk','$argon2id$v=19$m=65536,t=3,p=2$hbEf+FyI2S0jmghnO5+7jw$gljag6J+YGV4jfhkpaNDxcZVBDIvShw5QqnrF9Mehrg','wk','','wk@123.com','12308001234','','','','','','','',0,'7e9633f6-c83a-49a4-9a96-e120d6ca6055','','',87,1,0,0);

INSERT INTO tasks (uuid,create_at,update_at,name,summary,cron,type,path,last_fire,nfire,disabled,note) VALUES
	 ('task-uuid-001','2025-01-01 03:45:36','2025-01-01 03:45:36','每日数据备份','每天凌晨2点执行数据库备份任务','0 2 * * *',2,'/tasks/backup/daily',CURRENT_TIMESTAMP,0,0,'每日自动备份数据库'),
	 ('task-uuid-002','2025-01-01 03:45:36','2025-01-01 03:45:36','每小时清理日志','每小时清理过期的日志文件','0 * * * *',2,'/tasks/cleanup/logs',CURRENT_TIMESTAMP,0,0,'定期清理系统日志'),
	 ('task-uuid-003','2025-01-01 03:45:36','2025-01-01 03:45:36','每周数据统计','每周一上午9点生成数据统计报告','0 9 * * 1',2,'/tasks/report/weekly',CURRENT_TIMESTAMP,0,0,'生成周报统计数据'),
	 ('task-uuid-004','2025-01-01 03:45:36','2025-01-01 03:45:36','每月数据归档','每月1号凌晨3点执行数据归档','0 3 1 * *',2,'/tasks/archive/monthly',CURRENT_TIMESTAMP,0,1,'已禁用的归档任务'),
	 ('task-uuid-005','2025-01-01 03:45:36','2025-01-01 03:45:36','每5分钟心跳检测','每5分钟执行一次系统心跳检测','*/5 * * * *',2,'/tasks/health/check',CURRENT_TIMESTAMP,0,0,'系统健康检查任务');
