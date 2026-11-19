-- =====================================================================
-- 每日记账本（Web）· 种子数据
-- 方言：MySQL 9.7.4
-- 前置：先执行 01_schema.sql
--
-- 内容只有 category_templates 一张：PRD 4.3「默认分类清单」。
-- 模板表是全局静态字典，不进任何用户的数据表——建号时由服务层按 type 整套
-- 复制进 categories 并置 builtin=1、sort 沿用模板顺序，这样运营后续调整默认
-- 清单不会污染老用户已经排好序的分类。
--
-- 同理，004 原型记账面板里默认的支付账户（微信钱包/支付宝/银行卡）属于
-- ACC-03（P2）的客户端初始清单，不在此落库；开启多账户时由服务层按
-- wallet_accounts 逐用户写入，避免全局模板与用户账户混在一张表。
--
-- 幂等：ON DUPLICATE KEY UPDATE 只刷新 icon 与 sort，不覆盖人工改名，
-- 因此本脚本可重复执行，也能当模板表的增量修订脚本用。
--
-- 语法说明：ON DUPLICATE KEY UPDATE 走行别名（VALUES (...) AS `new` → `new`.col）。
-- 旧式 VALUES(col) 在 9.7.4 上实测报 1287 告警「'VALUES function' is deprecated and will be
-- removed in a future release」，MySQL 官方即建议改行别名，故本脚本不使用旧式写法。
-- =====================================================================

USE `daily_ledger`;

-- 支出分类（PRD 4.3，顺序即记账面板宫格顺序）
INSERT INTO `category_templates` (`type`, `name`, `icon`, `sort`)
VALUES
  ('expense', '餐饮', '🍜', 0),  -- 三餐、零食、饮料
  ('expense', '交通', '🚌', 1),  -- 公交、打车、加油
  ('expense', '购物', '🛍️', 2),  -- 服饰、数码、日用品
  ('expense', '住房', '🏠', 3),  -- 房租、水电、物业
  ('expense', '娱乐', '🎮', 4),  -- 电影、游戏、聚会
  ('expense', '医疗', '💊', 5),  -- 药品、门诊
  ('expense', '人情', '🎁', 6),  -- 红包、礼物
  ('expense', '学习', '📚', 7),  -- 课程、书籍
  ('expense', '其他', '📌', 8)   -- 未归类支出，排宫格末位
AS `new`
ON DUPLICATE KEY UPDATE
  `icon` = `new`.`icon`,
  `sort` = `new`.`sort`;

-- 收入分类（PRD 4.3）
INSERT INTO `category_templates` (`type`, `name`, `icon`, `sort`)
VALUES
  ('income', '工资', '💰', 0),
  ('income', '理财', '📈', 1),
  ('income', '兼职', '💼', 2),
  ('income', '红包', '🧧', 3),
  ('income', '其他', '📌', 4)   -- 与支出「其他」同名不同 type，uk_tpl_type_name 允许共存
AS `new`
ON DUPLICATE KEY UPDATE
  `icon` = `new`.`icon`,
  `sort` = `new`.`sort`;

-- 自检：应为 9 + 5 = 14 行
-- SELECT `type`, COUNT(1) AS `n` FROM `category_templates` GROUP BY `type`;

-- ---------------------------------------------------------------------
-- 联调用的演示账号请本地生成，不要提交进仓库：
--   password_hash 必须是 argon2id 摘要（ACC-02 规则4、第七章数据安全4），
--   示例见 002网站开发（研发）/js/auth.js 的注册流程，真实摘要由服务端计算。
-- ---------------------------------------------------------------------
