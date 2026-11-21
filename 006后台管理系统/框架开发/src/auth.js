import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { verify } from '@node-rs/argon2';
import { config } from './config.js';
import { one, run } from './db.js';

const sessions = new Map();
const COOKIE = 'peach_admin_session';
const TTL = 2 * 60 * 60 * 1000;
const sign = (token) => createHmac('sha256', config.sessionSecret).update(token).digest('hex');
const cookieOptions = `HttpOnly; SameSite=Strict; Path=/; Max-Age=${TTL / 1000}${config.production ? '; Secure' : ''}`;
const cookie = (req) => (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
function clearSession(req, res) {
  const value = cookie(req);
  if (value) sessions.delete(value.split('.')[0]);
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${config.production ? '; Secure' : ''}`);
}
export function authRoutes(app) {
  app.post('/api/admin/login', async (req, res) => {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = req.body?.password;
    if (!username || typeof password !== 'string' || password.length > 200) return res.status(400).json({ error: '请输入管理员账号和密码' });
    const user = await one('SELECT id,username,password_hash,role,status,failed_attempts,locked_until FROM admin_accounts WHERE username=?', [username]);
    const now = Date.now();
    if (!user || user.status !== 'active' || user.role !== 'admin' || (user.locked_until && Date.parse(user.locked_until.replace(' ', 'T') + 'Z') > now)) return res.status(401).json({ error: '账号或密码不正确，或账号暂时不可用' });
    let valid = false;
    try { valid = await verify(user.password_hash, password); } catch { /* Invalid stored digest is rejected. */ }
    if (!valid) {
      const attempts = Number(user.failed_attempts) + 1;
      await run('UPDATE admin_accounts SET failed_attempts=?,locked_until=IF(? >= 5,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 15 MINUTE),NULL) WHERE id=?', [attempts, attempts, user.id]);
      return res.status(401).json({ error: '账号或密码不正确，或账号暂时不可用' });
    }
    await run('UPDATE admin_accounts SET failed_attempts=0,locked_until=NULL,last_login_at=UTC_TIMESTAMP(3) WHERE id=?', [user.id]);
    clearSession(req, res);
    const token = randomBytes(32).toString('base64url');
    sessions.set(token, { id: user.id, expires: now + TTL });
    res.setHeader('Set-Cookie', `${COOKIE}=${token}.${sign(token)}; ${cookieOptions}`);
    res.json({ username: user.username });
  });
  app.post('/api/admin/logout', (req, res) => { clearSession(req, res); res.json({ ok: true }); });
  app.get('/api/admin/session', requireAdmin, (req, res) => res.json({ username: req.admin.username, role: req.admin.role }));
}
export async function requireAdmin(req, res, next) {
  const value = cookie(req);
  const [token, mac] = (value || '').split('.');
  if (!token || !mac || !/^[a-f0-9]{64}$/.test(mac)) return res.status(req.headers.authorization ? 403 : 401).json({ error: req.headers.authorization ? '普通用户无后台访问权限' : '请先登录后台' });
  const expected = Buffer.from(sign(token), 'hex');
  const actual = Buffer.from(mac, 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return res.status(401).json({ error: '请先登录后台' });
  const session = sessions.get(token);
  if (!session || session.expires < Date.now()) { sessions.delete(token); return res.status(401).json({ error: '登录已过期' }); }
  const user = await one('SELECT id,username,role,status FROM admin_accounts WHERE id=?', [session.id]);
  if (!user) return res.status(401).json({ error: '请先登录后台' });
  if (user.status !== 'active' || user.role !== 'admin') return res.status(403).json({ error: '无后台访问权限' });
  req.admin = user;
  next();
}
