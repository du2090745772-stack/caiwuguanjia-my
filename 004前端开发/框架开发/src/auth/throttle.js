/* 限流与锁定（ACC-02 规则5、第七章数据安全6）。
   落在 auth_login_attempts 表，四个频控维度共用一张表：
     login_username  连续失败 → 递增退避锁定，响应统一「账号或密码不对」
     login_ip        单 IP 失败量，挡住拿别人的用户名狂试
     register_ip     注册提交频次
     register_device 注册提交频次（按 X-Device-Id）
   对 register_* 而言，fail_count 记的是「窗口内提交次数」而不是失败次数——
   注册成功也要计数，否则批量注册脚本只要每次换个可用名就永不触顶。

   读写都在事务里 SELECT ... FOR UPDATE，避免并发失败把计数加丢。 */

import { run, transaction, toSqlUtc, fromSqlUtc } from '../db.js';
import { config } from '../config.js';
import { errors } from '../http/errors.js';

const { throttle } = config;

const secondsBetween = (futureDate, nowMs) => Math.max(0, (futureDate.getTime() - nowMs) / 1000);

async function lockSecondsRemaining(conn, scope, key, nowMs) {
  const [rows] = await conn.execute(
    `SELECT lock_until FROM auth_login_attempts WHERE scope = ? AND target_key = ? FOR UPDATE`,
    [scope, key]
  );
  const lockUntil = rows[0] ? fromSqlUtc(rows[0].lock_until) : null;
  return lockUntil ? secondsBetween(lockUntil, nowMs) : 0;
}

/* 登录前置检查：用户名维度与 IP 维度任一处于锁定即拒绝。
   429 只暴露「还要等多久」，不暴露是用户名还是 IP 被锁（internalReason 留在日志里）。 */
export function assertLoginNotBlocked({ username, ip }) {
  const now = Date.now();
  return transaction(async (conn) => {
    for (const target of [
      { scope: 'login_username', key: username, reason: 'username_locked' },
      { scope: 'login_ip', key: ip, reason: 'ip_locked' }
    ]) {
      const remaining = await lockSecondsRemaining(conn, target.scope, target.key, now);
      if (remaining > 0) throw errors.locked(remaining, target.reason);
    }
  });
}

function backoffSecondsFor(failCount, maxFails) {
  const steps = throttle.backoffSeconds;
  const index = Math.min(Math.max(failCount - maxFails, 0), steps.length - 1);
  return failCount >= maxFails ? steps[index] : 0;
}

export function recordLoginFailure({ scope, key, maxFails }) {
  return transaction(async (conn) => {
    const execute = (sql, params) => conn.execute(sql, params);
    const now = new Date();
    const [rows] = await execute(
      `SELECT fail_count, window_started_at FROM auth_login_attempts
        WHERE scope = ? AND target_key = ? FOR UPDATE`,
      [scope, key]
    );
    const row = rows[0];
    const windowExpired = !row
      || (fromSqlUtc(row.window_started_at)?.getTime() ?? 0) + throttle.failWindowSec * 1000 <= now.getTime();
    const failCount = windowExpired ? 1 : Number(row.fail_count) + 1;
    const lockSeconds = backoffSecondsFor(failCount, maxFails);

    if (!row) {
      await execute(
        `INSERT INTO auth_login_attempts (scope, target_key, window_started_at, fail_count, lock_until, last_failed_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?, ?)`,
        [scope, key, toSqlUtc(now), lockSeconds > 0 ? toSqlUtc(new Date(now.getTime() + lockSeconds * 1000)) : null, toSqlUtc(now), toSqlUtc(now)]
      );
    } else {
      await execute(
        `UPDATE auth_login_attempts
            SET window_started_at = ?, fail_count = ?, lock_until = ?, last_failed_at = ?, updated_at = ?
          WHERE scope = ? AND target_key = ?`,
        [
          windowExpired ? toSqlUtc(now) : row.window_started_at,
          failCount,
          lockSeconds > 0 ? toSqlUtc(new Date(now.getTime() + lockSeconds * 1000)) : null,
          toSqlUtc(now),
          toSqlUtc(now),
          scope,
          key
        ]
      );
    }
    return { failCount, lockSeconds };
  });
}

/* 登录成功即清零两个维度的失败计数，让「连续失败」名副其实 */
export async function clearLoginFailures({ username, ip }) {
  await Promise.all([
    run(`DELETE FROM auth_login_attempts WHERE scope = 'login_username' AND target_key = ?`, [username]),
    run(`DELETE FROM auth_login_attempts WHERE scope = 'login_ip' AND target_key = ?`, [ip])
  ]);
}

/* 注册频次配额：超限直接 429，不区分用户名是否可用，减少一次可被枚举的数据库写入 */
export function consumeRegisterQuota({ scope, key, limit, windowSec, reason }) {
  return transaction(async (conn) => {
    const execute = (sql, params) => conn.execute(sql, params);
    const now = new Date();
    const [rows] = await execute(
      `SELECT fail_count, window_started_at FROM auth_login_attempts
        WHERE scope = ? AND target_key = ? FOR UPDATE`,
      [scope, key]
    );
    const row = rows[0];
    const windowStart = row ? fromSqlUtc(row.window_started_at)?.getTime() ?? 0 : 0;
    const windowExpired = !row || windowStart + windowSec * 1000 <= now.getTime();
    const attempts = windowExpired ? 1 : Number(row.fail_count) + 1;

    if (attempts > limit) {
      const retryAfter = Math.max(1, (windowStart + windowSec * 1000 - now.getTime()) / 1000);
      throw errors.rateLimited(retryAfter, reason);
    }

    if (!row) {
      await execute(
        `INSERT INTO auth_login_attempts (scope, target_key, window_started_at, fail_count, lock_until, last_failed_at, updated_at)
         VALUES (?, ?, ?, 1, NULL, ?, ?)`,
        [scope, key, toSqlUtc(now), toSqlUtc(now), toSqlUtc(now)]
      );
    } else {
      await execute(
        `UPDATE auth_login_attempts
            SET window_started_at = ?, fail_count = ?, last_failed_at = ?, updated_at = ?
          WHERE scope = ? AND target_key = ?`,
        [windowExpired ? toSqlUtc(now) : row.window_started_at, attempts, toSqlUtc(now), toSqlUtc(now), scope, key]
      );
    }
  });
}

export const registerQuotaForIp = (ip) =>
  consumeRegisterQuota({
    scope: 'register_ip',
    key: ip,
    limit: throttle.registerIpLimit,
    windowSec: throttle.registerIpWindowSec,
    reason: 'register_ip_quota'
  });

export const registerQuotaForDevice = (deviceId) =>
  consumeRegisterQuota({
    scope: 'register_device',
    key: deviceId,
    limit: throttle.registerDeviceLimit,
    windowSec: throttle.registerDeviceWindowSec,
    reason: 'register_device_quota'
  });

export const loginFailureForUsername = (username) =>
  recordLoginFailure({ scope: 'login_username', key: username, maxFails: throttle.loginMaxFailsPerUsername });

export const loginFailureForIp = (ip) =>
  recordLoginFailure({ scope: 'login_ip', key: ip, maxFails: throttle.loginMaxFailsPerIp });
