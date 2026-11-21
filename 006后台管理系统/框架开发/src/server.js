import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { one, closePool } from './db.js';
import { authRoutes, requireAdmin } from './auth.js';
import { dataRoutes } from './routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    if (req.path.startsWith('/api/') && !['GET','HEAD','OPTIONS'].includes(req.method)) {
      if (req.headers.origin && req.headers.origin !== `${req.protocol}://${req.get('host')}`) return res.status(403).json({ error: '请求来源不允许' });
      if (req.headers['content-type']?.split(';')[0] !== 'application/json') return res.status(415).json({ error: '仅支持 JSON 请求' });
    }
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  authRoutes(app);
  app.use('/api/admin', requireAdmin);
  dataRoutes(app);
  app.get('/api/admin/health', async (req, res) => { await one('SELECT 1 AS ok'); res.json({ api: 'ok', database: 'ok', checkedAt: new Date().toISOString() }); });
  app.use(express.static(config.staticDir, { index: 'index.html' }));
  app.get(['/admin','/admin/'], (req, res) => res.redirect('/'));
  app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在' }));
  app.use((error, req, res, next) => { console.error('[admin]', error); if (res.headersSent) return next(error); res.status(500).json({ error: '服务暂时不可用' }); });
  return app;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await one('SELECT 1 AS ok');
    const table = await one("SELECT COUNT(*) AS count FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='admin_accounts'");
    if (!Number(table.count)) throw Error('缺少 admin_accounts 表，请先执行 005数据库脚本/03_admin_accounts.sql');
    const server = createApp().listen(config.port, () => console.log(`后台管理系统已启动：http://127.0.0.1:${config.port}`));
    for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(async () => { await closePool(); process.exit(0); }));
  } catch (error) { console.error('后台启动失败：', error.message); process.exit(1); }
}
