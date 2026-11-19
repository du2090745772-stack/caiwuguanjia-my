/* auth_sessions 数据访问：签发、轮换、吊销。
   刷新走一个事务：SELECT ... FOR UPDATE 锁住被使用的那一行，再「吊销旧 + 插新」。
   不加行锁的话，同一个 Refresh Token 被并发提交两次会各自成功，滚动续期就形同虚设。 */

import { randomUUID } from 'node:crypto';
import { one, run, toSqlUtc, fromSqlUtc, transaction } from '../db.js';
import { config } from '../config.js';
import { hashRefreshToken, newRefreshToken } from './tokens.js';

const { accessTtlSec, refreshTtlSec } = config.tokens;

/* 时间一律用 DATE_ADD(基准UTC串, INTERVAL n SECOND) 落库，
   让数据库时钟做唯一时间源，多实例部署不受应用机器时钟漂移影响。 */
async function insertSession(executor, {
  userId,
  refreshToken,
  platform,
  deviceLabel,
  clientIp,
  userAgent,
  rotatedFromId
}) {
  const sessionId = randomUUID();
  const now = toSqlUtc();
  await executor(
    `INSERT INTO auth_sessions
       (id, user_id, refresh_token_hash, access_expires_at, refresh_expires_at,
        rotated_from_id, platform, device_label, client_ip, user_agent, last_used_at, created_at, updated_at)
     VALUES (?, ?, ?, DATE_ADD(?, INTERVAL ? SECOND), DATE_ADD(?, INTERVAL ? SECOND),
             ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sessionId, userId, hashRefreshToken(refreshToken),
      now, accessTtlSec, now, refreshTtlSec,
      rotatedFromId, platform, deviceLabel, clientIp, userAgent, now, now, now
    ]
  );
  return sessionId;
}

const executeOnPool = (sql, params) => run(sql, params).then(() => undefined);

export function createSession(attrs) {
  return insertSession(executeOnPool, { ...attrs, rotatedFromId: attrs.rotatedFromId ?? null });
}

export function rotateSession({ refreshToken, deviceLabel, clientIp, userAgent }) {
  const tokenHash = hashRefreshToken(refreshToken);
  return transaction(async (conn) => {
    const execute = (sql, params) => conn.execute(sql, params);
    const [rows] = await execute(
      `SELECT s.id, s.user_id, s.revoked_at, s.refresh_expires_at, s.platform,
              u.username, u.status AS user_status
         FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.refresh_token_hash = ?
        FOR UPDATE`,
      [tokenHash]
    );
    const row = rows[0];
    if (!row) return { kind: 'invalid' };

    const expiresAt = fromSqlUtc(row.refresh_expires_at);
    if (!expiresAt || expiresAt.getTime() <= Date.now()) {
      await execute(
        `UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, NOW(3)) WHERE id = ?`,
        [row.id]
      );
      return { kind: 'expired' };
    }

    if (row.revoked_at) {
      /* 已吊销且能查到「由它轮换出来的后继会话」→ 判定为重放，整条链一律吊销。
         查不到后继 → 用户正常退出后又拿旧 token 来刷，只按失效处理；
         此时不能顺手踢掉该账号其他浏览器的会话（ACC-04 规则4 允许多浏览器同时在线）。 */
      const [successors] = await execute(
        `SELECT 1 AS hit FROM auth_sessions WHERE rotated_from_id = ? LIMIT 1`,
        [row.id]
      );
      if (successors.length > 0) {
        await execute(
          `UPDATE auth_sessions SET revoked_at = NOW(3) WHERE user_id = ? AND revoked_at IS NULL`,
          [row.user_id]
        );
        return { kind: 'replay' };
      }
      return { kind: 'signed_out' };
    }

    /* 冷静期内的账号（status=deactivating）不允许静默续期，需重新走登录来撤销注销 */
    if (row.user_status !== 'active') return { kind: 'signed_out' };

    await execute(`UPDATE auth_sessions SET revoked_at = NOW(3), last_used_at = NOW(3) WHERE id = ?`, [row.id]);
    const nextRefreshToken = newRefreshToken();
    const sessionId = await insertSession(execute, {
      userId: row.user_id,
      refreshToken: nextRefreshToken,
      platform: row.platform,
      deviceLabel,
      clientIp,
      userAgent,
      rotatedFromId: row.id
    });
    return {
      kind: 'ok',
      sessionId,
      userId: row.user_id,
      username: row.username,
      refreshToken: nextRefreshToken
    };
  });
}

export function findActiveSession(sessionId) {
  return one(
    `SELECT id, user_id, revoked_at FROM auth_sessions WHERE id = ? AND revoked_at IS NULL LIMIT 1`,
    [sessionId]
  );
}

export function revokeSession(sessionId) {
  return run(
    `UPDATE auth_sessions SET revoked_at = NOW(3), last_used_at = NOW(3)
      WHERE id = ? AND revoked_at IS NULL`,
    [sessionId]
  );
}
