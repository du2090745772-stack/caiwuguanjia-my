/* Bearer Access Token 校验。
   注意：Access Token 是无状态 JWT，签名与有效期过了就算通过；
   需要「退出即彻底失效」的接口要再查一次会话是否仍活着（见 routes.js 的退出接口）。
   后续账单类接口若要强制吊销即时生效，在这里加会话查询即可，不必改各路由。 */

import { errors } from '../http/errors.js';
import { verifyAccessToken } from '../auth/tokens.js';
import { findActiveSession } from '../auth/sessions.js';

export async function requireAuth(req, res, next) {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (!/^Bearer$/i.test(scheme ?? '') || !token) {
    throw errors.signedOut('missing_access_token');
  }
  const decoded = verifyAccessToken(token.trim());
  if (!decoded) throw errors.signedOut('invalid_access_token');
  if (!await findActiveSession(decoded.sessionId)) throw errors.signedOut('session_revoked');
  req.auth = decoded;
  next();
}
