/* Token 签发与校验（PRD ACC-02：Access 2 小时 + Refresh 30 天滚动续期；第七章：Token 加盐哈希存储）。
   - Access Token：JWT HS256，无状态，只承载「我是哪个会话签发的」，服务端不落明文。
   - Refresh Token：不透明随机串，库裡只存 sha256(pepper:token)——hex 长度 64，正好对上
     auth_sessions.refresh_token_hash CHAR(64)。拖库拿到该行也还原不出可用凭据。 */

import { createHmac, randomBytes, createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

const { jwtSecret, issuer, pepper, accessTtlSec } = config.tokens;

export function signAccessToken({ userId, sessionId, username }) {
  return jwt.sign({ sid: sessionId, uname: username, typ: 'access' }, jwtSecret, {
    algorithm: 'HS256',
    subject: userId,
    issuer,
    expiresIn: accessTtlSec
  });
}

export function newRefreshToken() {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token) {
  return createHash('sha256').update(`${pepper}:${token}`).digest('hex');
}

/* Access Token 校验：签名、有效期、issuer 一并过；任何不合法都归到「重新登录」 */
export function verifyAccessToken(token) {
  try {
    const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'], issuer });
    if (decoded.typ !== 'access' || !decoded.sid) throw new Error('claim 不合法');
    return { userId: decoded.sub, sessionId: decoded.sid, username: decoded.uname };
  } catch {
    return null;
  }
}

/* 设备/浏览器标识：客户端可带 X-Device-Id（本机迁移与注册频控都要用），
   没带就用 IP 派生的稳定哈希，保证 auth_sessions 与频控记录始终有归属可查。 */
export function deviceIdOf(req) {
  const header = req.get('x-device-id');
  const value = typeof header === 'string' ? header.trim() : '';
  if (value) return value.slice(0, 64);
  return `ip_${createHmac('sha256', pepper).update(clientIpOf(req)).digest('hex').slice(0, 40)}`;
}

/* 默认只认 socket 来源地址；显式 TRUST_PROXY=true 才取 X-Forwarded-For 首段，
   否则伪造这个头就能绕过 IP 维度的注册频控 */
export function clientIpOf(req) {
  if (config.trustProxy) {
    const forwarded = req.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim().slice(0, 45);
  }
  return (req.socket.remoteAddress || 'unknown').slice(0, 45);
}
