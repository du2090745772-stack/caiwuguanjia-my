-- 每日记账本后台管理系统唯一专用表。
-- 仅用于后台管理员身份与登录安全状态；不修改现有用户、账单等业务表。
-- 本脚本可重复执行，不创建初始管理员账号。

CREATE TABLE IF NOT EXISTS `admin_accounts` (
  `id`              CHAR(36)     NOT NULL DEFAULT (UUID()) COMMENT '后台管理员账号 ID',
  `username`        VARCHAR(20)  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '管理员登录名，大小写不敏感',
  `password_hash`   VARCHAR(255) NOT NULL COMMENT '加盐密码摘要；不存明文密码',
  `password_algo`   VARCHAR(32)  NOT NULL DEFAULT 'argon2id' COMMENT '密码摘要算法标识',
  `role`            ENUM('admin','viewer') NOT NULL DEFAULT 'admin' COMMENT '首版仅启用 admin；viewer 预留',
  `status`          ENUM('active','disabled') NOT NULL DEFAULT 'active' COMMENT '停用后拒绝后台访问',
  `failed_attempts` SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '连续登录失败次数',
  `locked_until`    DATETIME(3)  DEFAULT NULL COMMENT '临时锁定到期时间，按 UTC 存储',
  `last_login_at`   DATETIME(3)  DEFAULT NULL COMMENT '最近登录成功时间，按 UTC 存储',
  `created_at`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_admin_accounts_username` (`username`),
  KEY `idx_admin_accounts_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='后台管理系统专用管理员账号表';
