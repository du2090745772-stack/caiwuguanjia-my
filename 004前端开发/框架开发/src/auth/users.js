/* users 表数据访问。
   用户名唯一性只依赖数据库唯一索引（ACC-02 架构要求1：注册接口不自行查重），
   这样并发注册同名用户时不会出现「两个请求都通过检查」的窗口。 */

import { randomUUID } from 'node:crypto';
import { one, run, transaction } from '../db.js';
import { PASSWORD_ALGO } from './password.js';

const DUP_ENTRY = 'ER_DUP_ENTRY';

export async function createUser({ username, passwordHash, privacyAccepted }) {
  const sql = `
    INSERT INTO users (id, username, password_hash, password_algo, privacy_policy_accepted_at)
    VALUES (?, ?, ?, ?, ${privacyAccepted ? 'NOW(3)' : 'NULL'})`;
  try {
    await run(sql, [randomUUID(), username, passwordHash, PASSWORD_ALGO]);
  } catch (err) {
    if (err?.code === DUP_ENTRY) return null;
    throw err;
  }
  return findForAuth(username);
}

export function findForAuth(username) {
  return one(
    `SELECT id, username, password_hash, password_algo, status, nickname, last_synced_at
       FROM users WHERE username = ? LIMIT 1`,
    [username]
  );
}

/* ACC-04 规则3：注销冷静期内重新登录即撤销注销。
   同一次事务里改状态 + 标记冷静期任务已取消，避免任务跑到一半把刚回来的账号删了。 */
export function cancelDeactivation(userId) {
  return transaction(async (conn) => {
    await conn.execute(
      `UPDATE users SET status = 'active' WHERE id = ? AND status = 'deactivating'`,
      [userId]
    );
    await conn.execute(
      `UPDATE account_deletions
          SET status = 'cancelled', cancelled_at = NOW(3)
        WHERE user_id = ? AND status = 'grace'`,
      [userId]
    );
  });
}

export function touchLastLogin(userId) {
  return run(`UPDATE users SET last_login_at = NOW(3) WHERE id = ?`, [userId]);
}

/* 流程四：登录·凭据通过后要「拉取云端笔数」，用来渲染迁移确认弹窗的双栏对比。
   口径是云端现有有效账单数与最近一次变更时间；真正的「备份完成时间」在
   users.last_synced_at，由后续的迁移接口写入，不属于本次注册/登录范围。 */
export function cloudSummary(userId) {
  return one(
    `SELECT COUNT(1) AS bill_count, MAX(updated_at) AS latest_bill_at
       FROM bill_records
      WHERE user_id = ? AND deleted_at IS NULL`,
    [userId]
  );
}

/* 只回非敏感字段：password_hash / password_algo / status 一律不出网关 */
export function toPublicUser(row) {
  return {
    username: row.username,
    nickname: row.nickname ?? null
  };
}
