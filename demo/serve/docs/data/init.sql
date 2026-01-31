-- 初始化测试数据

-- 0. 插入登录用户（users）
-- 约定：密码统一为 123123
DELETE FROM users WHERE userid IN (
  'AG001','AG002'
);

INSERT INTO users (
  uuid,create_at,update_at,signin_at,disabled,deleted,
  userid,passwd,name,avatar,email,mobile,
  idno,address,acct_name,acct_no,acct_idno,acct_mobile,acct_bank_name,
  tfa,acl,bind_no,bind_name,secretcode,totp_secret,n_signin,noti_popup,noti_browser,noti_mail
) VALUES
  -- agents (AG001~AG003)
  ('e33c792f-3d9e-47c5-a973-AG001','2025-01-01 03:45:36','2025-01-01 03:45:36','2025-02-11 03:52:13',0,0,
   'AG001','$argon2id$v=19$t=3,p=2,m=65536$C+KO25+16ZnK37ziiF2uMA$79w3u+OX7+WuKpEXnPo4IGB4ZA5xPJoQgoDX8tTzhPY',
   '代理A','','ag001@123.com','13800138001',
   '','','','','','','',
   0,'7e9633f6-c83a-49a4-9a96-e120d6ca6056','AG001','代理A','','',0,1,0,0),
  ('e33c792f-3d9e-47c5-a973-AG002','2025-01-01 03:45:36','2025-01-01 03:45:36','2025-02-11 03:52:13',0,0,
   'AG002','$argon2id$v=19$t=3,p=2,m=65536$C+KO25+16ZnK37ziiF2uMA$79w3u+OX7+WuKpEXnPo4IGB4ZA5xPJoQgoDX8tTzhPY',
   '代理B','','ag002@123.com','13800138002',
   '','','','','','','',
   0,'7e9633f6-c83a-49a4-9a96-e120d6ca6056','AG002','代理B','','',0,1,0,0),
  
