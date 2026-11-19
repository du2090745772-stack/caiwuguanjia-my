/* 账号服务四个接口（PRD ACC-02 架构要求1 的接口约定）：
     POST   /api/v1/auth/register   用户名唯一校验 + 建号 + 签发 Token
     POST   /api/v1/auth/login      校验凭据换 Token；账号不存在与密码错误一律 401 同文案
     POST   /api/v1/auth/refresh    滚动续期
     DELETE /api/v1/auth/session    退出（吊销当前会话）
   异步处理函数直接抛错交给 errorHandler——Express 5 会把 rejected promise 转给错误中间件，
   不需要 Express 4 那样手写 wrap(fn)。 */

import { Router } from 'express';
import { config } from '../config.js';
import { fromSqlUtc } from '../db.js';
import { errors } from '../http/errors.js';
import { requireAuth } from '../middleware/require-auth.js';
import { validatePassword, validateUsername } from './validators.js';
import { hashPassword, verifyDummyPassword, verifyPassword } from './password.js';
import {
  cancelDeactivation, cloudSummary, createUser, findForAuth, toPublicUser, touchLastLogin
} from './users.js';
import { createSession, findActiveSession, revokeSession, rotateSession } from './sessions.js';
import { clientIpOf, deviceIdOf, newRefreshToken, signAccessToken } from './tokens.js';
import {
  assertLoginNotBlocked, clearLoginFailures, loginFailureForIp, loginFailureForUsername,
  registerQuotaForDevice, registerQuotaForIp
} from './throttle.js';

/* auth_sessions.platform 是 ENUM，写进去的值必须先过白名单，否则 MySQL 报 1265 */
const PLATFORMS = new Set(['web', 'ios', 'android', 'miniprogram', 'unknown']);

function requestMeta(req) {
  const body = req.body ?? {};
  const declared = typeof body.platform === 'string' ? body.platform : req.get('x-platform');
  const userAgent = req.get('user-agent') ?? null;
  return {
    platform: PLATFORMS.has(declared) ? declared : 'web',
    deviceLabel: (userAgent ?? '').slice(0, 64) || null,
    userAgent: userAgent ? userAgent.slice(0, 255) : null,
    clientIp: clientIpOf(req),
    deviceId: deviceIdOf(req)
  };
}

function bodyOf(req) {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw errors.invalidBody();
  return body;
}

async function issueSession(user, meta, rotatedFromId = null) {
  const refreshToken = newRefreshToken();
  const sessionId = await createSession({
    userId: user.id,
    refreshToken,
    platform: meta.platform,
    deviceLabel: meta.deviceLabel,
    clientIp: meta.clientIp,
    userAgent: meta.userAgent,
    rotatedFromId
  });
  const accessToken = signAccessToken({ userId: user.id, sessionId, username: user.username });
  return { accessToken, refreshToken, sessionId };
}

/* 响应里带云端笔数：流程四要求登录成功后立刻渲染
   「本机 N 笔／云端 M 笔」的迁移确认弹窗，省掉前端一次额外请求 */
async function authResponse(user, tokens, { isNew }) {
  const cloud = await cloudSummary(user.id);
  return {
    token_type: 'Bearer',
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expires_in: config.tokens.accessTtlSec,
    user: { ...toPublicUser(user), is_new_account: isNew },
    cloud_summary: {
      bill_count: Number(cloud?.bill_count ?? 0),
      /* 库里 DATETIME(3) 存的是 UTC 文本（005数据库脚本 全局口径 B），直接丢给前端会被
         当成本地时间解析，差 8 小时。出接口一律转成带 Z 的 ISO 时刻，由前端渲染本地时间 */
      latest_bill_at: fromSqlUtc(cloud?.latest_bill_at)?.toISOString() ?? null
    }
  };
}

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const meta = requestMeta(req);
  /* 注册频控放在最前：重名提示必然暴露用户名存在性，靠频控抬高枚举成本（ACC-02 规则3） */
  await registerQuotaForIp(meta.clientIp);
  await registerQuotaForDevice(meta.deviceId);

  const body = bodyOf(req);
  const username = validateUsername(body.username);
  const password = validatePassword(body.password);
  if (body.privacy_accepted !== true) throw errors.privacyRequired();

  const passwordHash = await hashPassword(password);
  const created = await createUser({ username, passwordHash, privacyAccepted: true });
  /* 不预查数据库，直接吃唯一索引的 1062——两个并发同名请求只会成一个（ACC-02 架构要求1） */
  if (!created) throw errors.nameTaken();

  const tokens = await issueSession(created, meta);
  res.status(201).json(await authResponse(created, tokens, { isNew: true }));
});

authRouter.post('/login', async (req, res) => {
  const meta = requestMeta(req);
  const body = bodyOf(req);
  const username = validateUsername(body.username);
  const password = validatePassword(body.password);

  await assertLoginNotBlocked({ username, ip: meta.clientIp });

  const user = await findForAuth(username);
  /* 账号不存在也要烧一次 argon2：否则响应快慢本身就在回答「这个用户名存不存在」 */
  const ok = user
    ? await verifyPassword(user.password_hash, password)
    : await verifyDummyPassword(password);

  if (!ok) {
    await loginFailureForUsername(username);
    await loginFailureForIp(meta.clientIp);
    /* 两种失败对外同一句话、同一个码（ACC-02 规则2）；真实原因只进日志给 EV-12 用 */
    throw errors.badCredentials(user ? 'password_mismatch' : 'account_not_found');
  }

  await clearLoginFailures({ username, ip: meta.clientIp });
  /* ACC-04 规则3：冷静期内重新登录即撤销注销申请 */
  if (user.status === 'deactivating') await cancelDeactivation(user.id);

  const tokens = await issueSession(user, meta);
  await touchLastLogin(user.id);
  res.json(await authResponse(user, tokens, { isNew: false }));
});

authRouter.post('/refresh', async (req, res) => {
  const meta = requestMeta(req);
  const body = bodyOf(req);
  const refreshToken = body.refresh_token;
  if (typeof refreshToken !== 'string' || refreshToken === '') throw errors.missingField('refresh_token');

  const rotated = await rotateSession({
    refreshToken,
    deviceLabel: meta.deviceLabel,
    clientIp: meta.clientIp,
    userAgent: meta.userAgent
  });

  /* invalid / expired / signed_out / replay 四种内部分支对外一律同一个 401，
     不给探测 Token 是否「曾经有效」留空间 */
  if (rotated.kind !== 'ok') throw errors.signedOut(rotated.kind);

  res.json({
    token_type: 'Bearer',
    access_token: signAccessToken({ userId: rotated.userId, sessionId: rotated.sessionId, username: rotated.username }),
    refresh_token: rotated.refreshToken,
    expires_in: config.tokens.accessTtlSec
  });
});

authRouter.delete('/session', requireAuth, async (req, res) => {
  /* 退出只吊销当前会话：同一账号在其他浏览器的登录态必须保留（ACC-04 规则4） */
  const alive = await findActiveSession(req.auth.sessionId);
  if (!alive) throw errors.signedOut('session_already_revoked');
  await revokeSession(req.auth.sessionId);
  res.status(204).end();
});
