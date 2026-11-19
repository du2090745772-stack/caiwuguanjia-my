-- =====================================================================
-- 每日记账本（Web）· 云端数据库建表脚本
-- 方言：MySQL 9.7.4（InnoDB / utf8mb4，实测实例 mysql:9.7.4-1.el9）
--        依赖的语法特性最早出现于 8.0.13（表达式默认值）与 8.0.16（CHECK 强制），
--        故 8.0.16 及以上均可执行；中文全文检索依赖内置 ngram 解析器。
--
-- 设计依据
--   1. 001产品PRD（产品经理）/每日记账本-产品需求文档PRD-V1.0.1.md —— 功能需求 ACC/BR/BILL/STAT/BUD/SET/CARE/EV
--   2. 004前端开发 —— 原型字段口径（records / categories / budgetsByMonth / wallets / profile）
--   3. 002网站开发（研发）/js/store.js —— IndexedDB 已按多端同步口径建模，接后端不改字段
--
-- 全局口径
--   A. 金额一律以「分」为整数（BIGINT）存储，两位小数 × 100，禁止 FLOAT/DECIMAL 混用导致累加误差。
--   B. 时间统一 DATETIME(3)，存 UTC，由服务层做时区展示；日期用 DATE（记账日 ≠ 创建时刻）。
--   C. 业务数据表（分类/账单/预算/资金账户/设置）统一带 ACC-02 架构要求五字段：
--      user_id、created_at、updated_at、sync_status、platform，未来 APP/小程序复用同一套表。
--   D. 主键 id 是客户端生成的 UUID（CHAR(36)）——ACC-02 合并去重键就是 id，同键取 updated_at 新者，
--      因此 id 必须在离线端先确定，不能等服务端自增。
--   E. 免登录模式下客户端写 user_id='local'，该值永不上云；一键上云时由服务层改写为账号 id，
--      过程与结果记入 data_migrations。
--   F. 服务端只存口令加盐摘要与 Token 摘要，不存任何明文密码、不存 Access/Refresh Token 明文。
--   G. 图标列存 emoji（🍜 等 4 字节字符），全库必须 utf8mb4，utf8mb3 会静默截断成 '?'。
--
-- 表 ↔ PRD 需求映射
--   users                 ACC-02 / ACC-04 / 第七章隐私合规
--   account_deletions     ACC-04（7 天冷静期、撤销、到期彻底删除）
--   auth_sessions         ACC-02 接口 /auth/refresh、/auth/session（Access 2h + Refresh 30d 滚动）
--   auth_login_attempts   ACC-02 规则 3/5、第七章数据安全（用户名/IP 双维度限流、注册频控）
--   category_templates    4.3 默认分类清单
--   categories            SET-01 / BR-01 / BR-03
--   wallet_accounts       ACC-03（P2）
--   bill_records          BR-01 / BR-02 / BILL-01 / BILL-02 / BILL-03 / STAT-01~04 / SET-02
--   budgets               BUD-01 / BUD-03
--   budget_categories     BUD-02（P2）
--   user_settings         CARE-01 / CARE-02 / BR-01 / BR-02 / SET-03 / 流程二提示疲劳
--   data_migrations       ACC-02 数据迁移、EV-13
--   analytics_events      第八章 EV-01~EV-13
--   v_bill_monthly_summary STAT-01 / BUD-01（低频兜底，高频走应用层缓存）
-- =====================================================================

SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS `daily_ledger`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

USE `daily_ledger`;

-- ---------------------------------------------------------------------
-- 1. users 账号主表（ACC-02 / ACC-04）
--    注册只索取用户名 + 密码；nickname/bio/avatar_url 是用户事后主动编辑才写入（004 原型个人资料弹窗），
--    符合第七章「不强制索取无关信息」的最小化收集口径。
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id`                          CHAR(36)     NOT NULL DEFAULT (UUID()) COMMENT '账号ID，UUID 字符串',
  `username`                    VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL
                                                                              COMMENT '用户名：3-20 位，中文/字母/数字/下划线，禁空格与纯符号；大小写不敏感，服务层统一转小写后落库，列排序规则 utf8mb4_0900_ai_ci 做兜底（ACC-02）',
  `password_hash`               VARCHAR(255) NOT NULL COMMENT '口令加盐摘要：argon2id 优先、bcrypt 兼容；禁止明文与前端摘要（ACC-02 规则4）',
  `password_algo`               VARCHAR(32)  NOT NULL DEFAULT 'argon2id' COMMENT '摘要算法与参数标识，便于升级时透明重哈希',
  `nickname`                    VARCHAR(20)  DEFAULT NULL COMMENT '网名，≤20 字',
  `bio`                         VARCHAR(100) DEFAULT NULL COMMENT '个人简介，≤100 字',
  `avatar_url`                  VARCHAR(512) DEFAULT NULL COMMENT '头像地址；前端 160×160 dataURL 由服务层转存对象存储后只存 URL',
  `privacy_policy_accepted_at`  DATETIME(3)  DEFAULT NULL COMMENT '《隐私政策》由用户主动勾选的确认时间，不得默认勾选（第七章隐私合规5）',
  `status`                      ENUM('active','deactivating') NOT NULL DEFAULT 'active' COMMENT 'active=正常；deactivating=注销冷静期中（ACC-04）',
  `last_login_at`               DATETIME(3)  DEFAULT NULL COMMENT '最近登录成功时间',
  `last_synced_at`              DATETIME(3)  DEFAULT NULL COMMENT '最近一次备份/同步成功时间，供 PG-11 账号卡片展示「已同步」态',
  `created_at`                  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`                  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_username` (`username`),
  KEY `idx_users_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='账号主表。用户名唯一性由唯一索引保证，注册接口不自行查重（ACC-02 架构要求1）';

-- ---------------------------------------------------------------------
-- 2. account_deletions 注销冷静期（ACC-04）
--    二次确认 → 强制引导导出 CSV → 输入本人用户名确认（服务层校验，库不落此动作）
--    → purge_after = 确认时间 + 7 天 → 定时任务物理删除 users 及其业务数据（CASCADE）。
--    user_id 用 ON DELETE SET NULL：账号清除后本行仍留作「已履行删除权」的审计留痕，
--    且 username_snapshot 使冷静期内重新登录可撤销、到期后该用户名可重新注册。
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `account_deletions` (
  `id`                   CHAR(36)    NOT NULL DEFAULT (UUID()),
  `user_id`              CHAR(36)    DEFAULT NULL COMMENT '提交后账号被物理清除时置空，仅留审计',
  `username_snapshot`    VARCHAR(20) NOT NULL COMMENT '提交注销时的用户名（冷静期撤销与审计凭此定位）',
  `status`               ENUM('grace','cancelled','purged') NOT NULL DEFAULT 'grace' COMMENT 'grace=冷静期内；cancelled=重新登录撤销；purged=云端已彻底删除',
  `bill_count_snapshot`  INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '注销前云端账单笔数，仅用于核对删除范围',
  `export_prompted_at`   DATETIME(3) DEFAULT NULL COMMENT '注销前引导导出 CSV 的时间（ACC-04 规则3）',
  `requested_at`         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `purge_after`          DATETIME(3) NOT NULL COMMENT '冷静期到期时间 = requested_at + 7 天',
  `cancelled_at`         DATETIME(3) DEFAULT NULL,
  `purged_at`            DATETIME(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_del_status_due` (`status`, `purge_after`),
  KEY `idx_del_user` (`user_id`),
  CONSTRAINT `fk_del_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='账号注销 7 天冷静期任务表（ACC-04）';

-- ---------------------------------------------------------------------
-- 3. auth_sessions 登录态（ACC-02 接口约定 / POST /auth/refresh、DELETE /auth/session）
--    一个账号允许多浏览器同时在线（ACC-04 规则4），故不对 user_id 建唯一约束。
--    只存 Refresh Token 的加盐哈希；Access Token 不落库，靠 exp 短期自签。
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `auth_sessions` (
  `id`                   CHAR(36)    NOT NULL DEFAULT (UUID()),
  `user_id`              CHAR(36)    NOT NULL COMMENT '所属账号，注销即级联清除',
  `refresh_token_hash`   CHAR(64)    NOT NULL COMMENT 'Refresh Token 加盐哈希（SHA-256 hex），明文只在响应体出现一次',
  `access_expires_at`    DATETIME(3) NOT NULL COMMENT 'Access Token 到期，有效期 2 小时',
  `refresh_expires_at`   DATETIME(3) NOT NULL COMMENT 'Refresh Token 到期，30 天滚动续期',
  `rotated_from_id`      CHAR(36)    DEFAULT NULL COMMENT '滚动续期来源会话ID（无外键）；同一来源被二次使用即判为重放',
  `platform`             ENUM('web','ios','android','miniprogram','unknown') NOT NULL DEFAULT 'web' COMMENT '来源端，跨平台架构要求2',
  `device_label`         VARCHAR(64) DEFAULT NULL COMMENT '设备描述，供多端登录列表展示',
  `client_ip`            VARCHAR(45) DEFAULT NULL COMMENT 'IPv4/IPv6 文本',
  `user_agent`           VARCHAR(255) DEFAULT NULL,
  `revoked_at`           DATETIME(3) DEFAULT NULL COMMENT '退出登录即吊销；本机只保留 Token（第七章数据安全5）',
  `last_used_at`         DATETIME(3) DEFAULT NULL COMMENT '最近一次续期/校验时间',
  `created_at`           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sessions_refresh_hash` (`refresh_token_hash`),
  KEY `idx_sessions_user_active` (`user_id`, `revoked_at`, `refresh_expires_at`),
  CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='登录态与 Token 会话表';

-- ---------------------------------------------------------------------
-- 4. auth_login_attempts 失败计数与限流（ACC-02 规则3/5、第七章数据安全6）
--    四个频控维度合一表，主键即幂等定位：
--      login_username  登录连续失败 → 递增退避 + 锁定，统一文案「账号或密码不对」
--      login_ip        登录按 IP 频控
--      register_ip     注册批量频控（重名提示必然暴露用户名存在性，靠频控抬高枚举成本）
--      register_device 注册按设备频控
--    V1.1 若写入压力上来，可整体迁 Redis，本表退化为审计兜底，表结构不必改。
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `auth_login_attempts` (
  `scope`             ENUM('login_username','login_ip','register_ip','register_device') NOT NULL
                                        COMMENT '频控维度',
  `target_key`        VARCHAR(64)  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL
                                        COMMENT '用户名维度填归一化小写用户名，IP/设备维度填对应标识',
  `window_started_at` DATETIME(3)  NOT NULL COMMENT '当前统计窗口起点，窗口过后计数清零',
  `fail_count`        SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '窗口内连续失败次数，退避时长按此递增',
  `lock_until`        DATETIME(3)  DEFAULT NULL COMMENT '非空且晚于当前时间即处于锁定中',
  `last_failed_at`    DATETIME(3)  DEFAULT NULL,
  `updated_at`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`scope`, `target_key`),
  KEY `idx_attempts_lock_until` (`lock_until`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='登录/注册限流与失败计数（服务端实现，前端只做文案兜底）';

-- ---------------------------------------------------------------------
-- 5. category_templates 预置分类模板（PRD 4.3）
--    注册建号时按 type 整套复制进 categories 并置 builtin=1；
--    模板本身可增删（运营调整默认清单），不影响用户已有的历史分类。
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `category_templates` (
  `id`    SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `type`  ENUM('expense','income') NOT NULL COMMENT '收支方向',
  `name`  VARCHAR(10)  NOT NULL COMMENT '分类名，与用户分类同长度口径',
  `icon`  VARCHAR(16)  NOT NULL DEFAULT '📌' COMMENT 'emoji/图标 key，跨端统一图标库（跨平台架构要求3）',
  `sort`  SMALLINT     NOT NULL DEFAULT 0 COMMENT '宫格展示顺序',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tpl_type_name` (`type`, `name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='系统预置默认分类清单（4.3），种子数据见 02_seed.sql';

-- ---------------------------------------------------------------------
-- 6. categories 用户分类（SET-01 / BR-01 / BR-03）
--    刻意不对 (user_id, type, name) 建唯一约束：ACC-02 合并去重键是 id，本机与云端
--    可能各有一条同名「餐饮」，唯一键会让「保留双方并合并」直接报 1062 而中断迁移。
--    同名去重交给服务层的提示，不交给索引。
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `categories` (
  `id`          CHAR(36)     NOT NULL DEFAULT (UUID()) COMMENT '客户端 UUID，合并去重键',
  `user_id`     CHAR(36)     NOT NULL,
  `name`        VARCHAR(10)  NOT NULL COMMENT '分类名，服务层截断 10 字（store.js 口径）',
  `icon`        VARCHAR(16)  NOT NULL DEFAULT '📌',
  `type`        ENUM('expense','income') NOT NULL DEFAULT 'expense',
  `sort`        SMALLINT     NOT NULL DEFAULT 0 COMMENT 'SET-01 拖拽排序，从 0 连续编号',
  `hidden`      BOOLEAN      NOT NULL DEFAULT FALSE COMMENT '隐藏态：已被账单使用的分类只能改名或隐藏（SET-01 规则2）',
  `builtin`     BOOLEAN      NOT NULL DEFAULT FALSE COMMENT 'TRUE=建号时由模板复制的预置分类',
  `sync_status` ENUM('local','pending','synced','conflict') NOT NULL DEFAULT 'synced' COMMENT 'ACC-02 同步状态；local 只存在于客户端',
  `platform`    ENUM('web','ios','android','miniprogram','unknown') NOT NULL DEFAULT 'web',
  `deleted_at`  DATETIME(3)  DEFAULT NULL COMMENT '删除墓碑，供 V1.1 双向同步传播删除；硬删除由清理任务执行',
  `created_at`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '同键合并取新者',
  PRIMARY KEY (`id`),
  KEY `idx_cat_user_list` (`user_id`, `type`, `hidden`, `sort`) COMMENT '记账面板分类宫格与分类管理页',
  KEY `idx_cat_user_sync` (`user_id`, `sync_status`) COMMENT '待上传续传扫描',
  CONSTRAINT `fk_cat_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='收支分类（自定义管理，含隐藏与预置标记）';

-- ---------------------------------------------------------------------
-- 7. wallet_accounts 多资金账户（ACC-03，P2）
--    004 原型已把支付账户做进记账面板（record.wallet，默认 微信钱包/支付宝/银行卡），
--    云端按 id 关联账单，账户余额 = initial_balance_cent + 累计收入 - 累计支出，
--    由查询实时汇总，不落冗余余额列，避免改删账单后余额与流水不一致。
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `wallet_accounts` (
  `id`                   CHAR(36)    NOT NULL DEFAULT (UUID()),
  `user_id`              CHAR(36)    NOT NULL,
  `name`                 VARCHAR(20) NOT NULL COMMENT '账户名称，≤20 字（004 添加支付账户弹窗）',
  `kind`                 ENUM('cash','wechat','alipay','bank','credit','other') NOT NULL DEFAULT 'other' COMMENT '现金/微信/支付宝/银行卡等',
  `initial_balance_cent` BIGINT      NOT NULL DEFAULT 0 COMMENT '初始余额（分），可为负',
  `sort`                 SMALLINT    NOT NULL DEFAULT 0,
  `archived`             BOOLEAN     NOT NULL DEFAULT FALSE COMMENT '归档不再可选，历史账单关联保留',
  `sync_status`          ENUM('local','pending','synced','conflict') NOT NULL DEFAULT 'synced',
  `platform`             ENUM('web','ios','android','miniprogram','unknown') NOT NULL DEFAULT 'web',
  `deleted_at`           DATETIME(3) DEFAULT NULL,
  `created_at`           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_wallet_user_list` (`user_id`, `archived`, `sort`),
  CONSTRAINT `fk_wallet_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='资金账户（P2，模块五 ACC-03）';

-- ---------------------------------------------------------------------
-- 8. bill_records 账单流水 —— 核心表（BR-01/02 · BILL-01/02/03 · STAT-01~04 · SET-02）
--    · id 客户端 UUID：离线先记、上云再合并，去重键即 id。
--    · category_id 用 ON DELETE SET NULL：删除限制由服务层按 SET-01 规则2 拦截，
--      索引兜底时宁可留一条待归类账单，也不能因外键把用户的账删失败或连带删数据。
--    · BILL-03 中文备注检索靠 ngram 全文索引；分类名关键词由服务层 JOIN categories 命中。
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `bill_records` (
  `id`           CHAR(36)    NOT NULL DEFAULT (UUID()) COMMENT '账单ID，客户端 UUID / ACC-02 合并去重键',
  `user_id`      CHAR(36)    NOT NULL,
  `type`         ENUM('expense','income') NOT NULL DEFAULT 'expense' COMMENT 'BR-01 默认选中支出',
  `amount_cent`  BIGINT      NOT NULL COMMENT '金额（分），支持两位小数，展示层负责千分位',
  `category_id`  CHAR(36)    DEFAULT NULL COMMENT '必选，空值仅出现在分类被强删的兜底场景',
  `wallet_id`    CHAR(36)    DEFAULT NULL COMMENT '支付账户，ACC-03 未开启时为空',
  `note`         VARCHAR(100) DEFAULT NULL COMMENT '备注，选填限 100 字（BR-01）',
  `record_date`  DATE        NOT NULL COMMENT '记账日期，默认当天可改（BR-01 规则4）；补记时与 created_at 不同',
  `sync_status`  ENUM('local','pending','synced','conflict') NOT NULL DEFAULT 'synced' COMMENT '迁移失败保留 local，下次进入自动续传（ACC-02 数据迁移4）',
  `platform`     ENUM('web','ios','android','miniprogram','unknown') NOT NULL DEFAULT 'web' COMMENT '来源端标记',
  `deleted_at`   DATETIME(3) DEFAULT NULL COMMENT 'BILL-02 删除墓碑，供 V1.1 同步传播；所有业务查询必须带 deleted_at IS NULL',
  `created_at`   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '流水同日并列时的次级排序键（store.js 口径）',
  `updated_at`   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '合并冲突时双方比此值取新者；服务层回写客户端时间时显式赋值即不被自动覆盖',
  PRIMARY KEY (`id`),
  KEY `idx_bill_user_date` (`user_id`, `record_date`, `created_at`) COMMENT 'PG-01 流水倒序 + 按日分组 + 下拉刷新/滚动分页',
  KEY `idx_bill_user_cat_date` (`user_id`, `category_id`, `record_date`) COMMENT 'STAT-02 分类占比与环形图下钻明细',
  KEY `idx_bill_user_type_date` (`user_id`, `type`, `record_date`) COMMENT 'STAT-01/03 周期汇总、每日柱状、月度折线、预算进度',
  KEY `idx_bill_user_sync` (`user_id`, `sync_status`) COMMENT 'N 笔待上传计数与续传扫描（ACC-04 规则1）',
  KEY `idx_bill_category` (`category_id`),
  FULLTEXT KEY `ft_bill_note` (`note`) WITH PARSER ngram COMMENT 'BILL-03 中文关键词检索：必须显式声明 ngram，默认空格分词器切不开中文，MATCH 会静默返回空结果而不报错',
  CONSTRAINT `chk_bill_amount` CHECK (`amount_cent` >= 0),
  CONSTRAINT `fk_bill_user`     FOREIGN KEY (`user_id`)     REFERENCES `users` (`id`)           ON DELETE CASCADE,
  CONSTRAINT `fk_bill_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)      ON DELETE SET NULL,
  CONSTRAINT `fk_bill_wallet`   FOREIGN KEY (`wallet_id`)   REFERENCES `wallet_accounts` (`id`)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci ROW_FORMAT=DYNAMIC
  COMMENT='账单流水（每笔收支一条记录）';

-- ---------------------------------------------------------------------
-- 9. budgets 月度总预算（BUD-01 / BUD-03）
--    period_month 用 'YYYY-MM' 文本，直接对齐 004 原型 budgetsByMonth 与 002 store.setBudget 的键；
--    自然月口径，跨月不结转。提醒档位时间列非空即视为本月该档已发，落实「每档每月仅触发一次」。
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `budgets` (
  `id`                CHAR(36)    NOT NULL DEFAULT (UUID()),
  `user_id`           CHAR(36)    NOT NULL,
  `period_month`      CHAR(7)     NOT NULL COMMENT '预算周期，自然月 YYYY-MM',
  `budget_cent`       BIGINT      NOT NULL COMMENT '本月总支出预算（分），服务层校验 > 0（004 budget-adjust）',
  `wish`              VARCHAR(100) DEFAULT NULL COMMENT '本月小目标（004 budget-exceeded 页 budgetWish，纯文本不触发推送）',
  `alert_80_sent_at`  DATETIME(3) DEFAULT NULL COMMENT '达 80% 提醒（站内横幅）已发时间，BUD-03',
  `alert_100_sent_at` DATETIME(3) DEFAULT NULL COMMENT '达 100% 超支提醒已发时间，BUD-03',
  `sync_status`       ENUM('local','pending','synced','conflict') NOT NULL DEFAULT 'synced',
  `platform`          ENUM('web','ios','android','miniprogram','unknown') NOT NULL DEFAULT 'web',
  `created_at`        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_budget_user_month` (`user_id`, `period_month`),
  CONSTRAINT `chk_budget_positive` CHECK (`budget_cent` > 0),
  CONSTRAINT `fk_budget_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='月度总预算（BUD-01，P1）';

-- ---------------------------------------------------------------------
-- 10. budget_categories 分类预算（BUD-02，P2）
--     004 原型按分类名调整预算（budget-adjust.html?category=餐饮），
--     服务层负责把名称解析成 category_id，库内只认 id。
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `budget_categories` (
  `id`           CHAR(36)    NOT NULL DEFAULT (UUID()),
  `user_id`      CHAR(36)    NOT NULL,
  `period_month` CHAR(7)     NOT NULL COMMENT '与 budgets.period_month 同周期',
  `category_id`  CHAR(36)    NOT NULL,
  `budget_cent`  BIGINT      NOT NULL COMMENT '该分类本月支出上限（分）',
  `sync_status`  ENUM('local','pending','synced','conflict') NOT NULL DEFAULT 'synced',
  `platform`     ENUM('web','ios','android','miniprogram','unknown') NOT NULL DEFAULT 'web',
  `created_at`   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_budgetcat_user_month_cat` (`user_id`, `period_month`, `category_id`),
  KEY `idx_budgetcat_category` (`category_id`),
  CONSTRAINT `chk_budgetcat_positive` CHECK (`budget_cent` > 0),
  CONSTRAINT `fk_budgetcat_user` FOREIGN KEY (`user_id`)     REFERENCES `users` (`id`)      ON DELETE CASCADE,
  CONSTRAINT `fk_budgetcat_cat`  FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='分类月度预算（BUD-02，P2）';

-- ---------------------------------------------------------------------
-- 11. user_settings 用户设置（CARE-01/02 · BR-01/02 · 流程二 · SET-03）
--     一人一行，主键即 user_id；未登录时这些键只在客户端 IndexedDB 的 kv 里。
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_settings` (
  `user_id`                   CHAR(36)    NOT NULL COMMENT '与 users 一对一，也是主键',
  `care_mode`                 BOOLEAN     NOT NULL DEFAULT FALSE COMMENT 'CARE-01 关怀模式：字号×1.3、按钮≥48px、隐藏低频功能',
  `theme`                     ENUM('auto','light','dark') NOT NULL DEFAULT 'auto' COMMENT '跟随系统/浅色/深色，V2.0 多主题在此扩展',
  `continue_mode`             BOOLEAN     NOT NULL DEFAULT FALSE COMMENT 'BR-02 连续记账：保存后保留收支类型与日期',
  `default_category_id`       CHAR(36)    DEFAULT NULL COMMENT 'BR-01 记住上次选择的分类',
  `backup_hint_dismissed_at`  DATETIME(3) DEFAULT NULL COMMENT '流程二第 3 笔记账后的上云引导点「暂不」的时间，服务层按 7 天静默',
  `sync_status`               ENUM('local','pending','synced','conflict') NOT NULL DEFAULT 'synced',
  `platform`                  ENUM('web','ios','android','miniprogram','unknown') NOT NULL DEFAULT 'web',
  `created_at`                DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`                DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`),
  KEY `idx_settings_default_cat` (`default_category_id`),
  CONSTRAINT `fk_settings_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_settings_default_cat` FOREIGN KEY (`default_category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='用户设置（关怀模式/主题/连续记账/记账默认值）';

-- ---------------------------------------------------------------------
-- 12. data_migrations 一键上云与合并审计（ACC-02 数据迁移、EV-13）
--     对应流程四的三个选择：保留双方并合并 / 先只备份本机 / 暂不处理。
--     按 (user_id, device_id) 找 status 为 running|partial 的历史行即可实现「下次进入自动续传」。
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `data_migrations` (
  `id`              CHAR(36)     NOT NULL DEFAULT (UUID()),
  `user_id`         CHAR(36)     NOT NULL,
  `device_id`       VARCHAR(64)  NOT NULL COMMENT '本机浏览器/设备标识，用于断点续传定位与注册频控',
  `action`          ENUM('register_backup','login_merge','manual_sync') NOT NULL COMMENT '注册即备份 / 登录后合并 / 账号卡片手动同步',
  `strategy`        ENUM('merge_keep_both','local_upload_only','deferred') DEFAULT NULL COMMENT 'merge_keep_both=id 去重同键取 updated_at 新者；local_upload_only=全量上传不覆盖；deferred=暂不处理',
  `local_count`     INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '本机账单笔数',
  `cloud_count`     INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '云端账单笔数',
  `uploaded_count`  INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '实际写入云端笔数，成功 Toast「已备份 N 笔账单」取此值',
  `conflict_count`  INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '同 id 双方都存在并按 updated_at 判定的冲突数',
  `duration_ms`     INT UNSIGNED DEFAULT NULL COMMENT '耗时，ACC-02 验收4 要求 1 万笔 ≤ 30 秒',
  `status`          ENUM('running','success','partial','failed') NOT NULL DEFAULT 'running' COMMENT 'partial=中途失败，未上传行保持 sync_status 待续传',
  `failure_reason`  VARCHAR(255) DEFAULT NULL,
  `started_at`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finished_at`     DATETIME(3)  DEFAULT NULL,
  `updated_at`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_mig_user_started` (`user_id`, `started_at`),
  KEY `idx_mig_resumable` (`status`, `user_id`, `device_id`),
  CONSTRAINT `fk_mig_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='数据迁移/备份任务记录（EV-13 埋点的结构化落点）';

-- ---------------------------------------------------------------------
-- 13. analytics_events 埋点事件（第八章 EV-01~EV-13）
--     只留事实表 + JSON payload，不建 13 张事件表：字段差异全在参数里，聚合靠事件名。
--     不加外键：账号注销需按 user_id 清理本表（删除权），但设备级漏斗要能跨账号续算；
--     免登录访客 user_id 为空，靠 device_id 归并。
--     写入量若显著上升，本表整体迁 ClickHouse 或按 event_at 做月度分区，不改业务表。
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `analytics_events` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `event_name`  VARCHAR(32)    NOT NULL COMMENT 'page_view / record_save / record_edit / record_delete / stats_view / chart_drilldown / budget_set / budget_exceed / export_data / signup_success / care_mode_toggle / retention_check / auth_form_submit / auth_result / data_migrate_result',
  `user_id`     CHAR(36)       DEFAULT NULL COMMENT '免登录用户为空',
  `device_id`   VARCHAR(64)    DEFAULT NULL COMMENT '本机标识，无账号时的漏斗归并键',
  `payload`     JSON           NOT NULL COMMENT '各事件上报参数：设备类型、来源渠道、分类、金额区间、耗时、失败原因（name_taken 等）',
  `event_at`    DATETIME(3)    NOT NULL COMMENT '客户端事件发生时间',
  `created_at`  DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '服务端接收时间',
  PRIMARY KEY (`id`),
  KEY `idx_ev_name_time` (`event_name`, `event_at`),
  KEY `idx_ev_user_time` (`user_id`, `event_at`),
  KEY `idx_ev_device_time` (`device_id`, `event_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Web 端埋点事件（第八章），保留期建议 90 天，由归档任务清理';

-- ---------------------------------------------------------------------
-- 14. v_bill_monthly_summary 月度收支汇总视图（STAT-01 / BILL-01 顶部概览 / BUD-01 进度）
--     走 idx_bill_user_type_date 聚合。万级账单下作为兜底口径可用，
--     首页与统计页的高频读取仍应在应用层做预计算缓存（PRD 第十一章技术风险）。
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW `v_bill_monthly_summary` AS
SELECT
  `bill_records`.`user_id`                                                        AS `user_id`,
  DATE_FORMAT(`bill_records`.`record_date`, '%Y-%m')                              AS `period_month`,
  SUM(CASE WHEN `bill_records`.`type` = 'expense' THEN `bill_records`.`amount_cent` ELSE 0 END) AS `expense_cent`,
  SUM(CASE WHEN `bill_records`.`type` = 'income'  THEN `bill_records`.`amount_cent` ELSE 0 END) AS `income_cent`,
  SUM(CASE WHEN `bill_records`.`type` = 'income'  THEN `bill_records`.`amount_cent` ELSE -`bill_records`.`amount_cent` END) AS `balance_cent`,
  COUNT(1)                                                                        AS `bill_count`
FROM `bill_records`
WHERE `bill_records`.`deleted_at` IS NULL
GROUP BY `bill_records`.`user_id`, DATE_FORMAT(`bill_records`.`record_date`, '%Y-%m');

-- =====================================================================
-- 本地重置用：删表顺序与建表相反，外键逐层先行回收。默认注释掉，
-- 确认是本地库再手工放开执行；生产环境一律走迁移工具，不放任何 DROP。
-- ---------------------------------------------------------------------
-- DROP TABLE IF EXISTS `analytics_events`;
-- DROP TABLE IF EXISTS `data_migrations`;
-- DROP TABLE IF EXISTS `user_settings`;
-- DROP TABLE IF EXISTS `budget_categories`;
-- DROP TABLE IF EXISTS `budgets`;
-- DROP TABLE IF EXISTS `bill_records`;
-- DROP TABLE IF EXISTS `wallet_accounts`;
-- DROP TABLE IF EXISTS `categories`;
-- DROP TABLE IF EXISTS `category_templates`;
-- DROP TABLE IF EXISTS `auth_login_attempts`;
-- DROP TABLE IF EXISTS `auth_sessions`;
-- DROP TABLE IF EXISTS `account_deletions`;
-- DROP TABLE IF EXISTS `users`;
-- DROP VIEW IF EXISTS `v_bill_monthly_summary`;
-- =====================================================================

-- =====================================================================
-- 排期外的预留说明（不在本脚本落表，避免空转结构）
--   · 绑定邮箱/手机号找回密码（V1.1，POST /auth/password/reset）→ 届时给 users 加
--     email / phone / email_verified_at 三列，而非新建表。
--   · Web Push 浏览器推送（BUD-03 P2）→ 新增 push_subscriptions 表（endpoint 唯一 + p256dh/auth）。
--   · 多账本（PRD 名词解释「账本」）V1.0 功能清单未含，暂不给 bill_records 加 ledger_id；
--     若 V2.0 引入，ledger_id 允许 NULL 即向后兼容单账本数据。
--   · 统计预计算缓存（STAT 性能目标）走应用层/Redis，不在库内建汇总表，避免与流水双写不一致。
-- =====================================================================
