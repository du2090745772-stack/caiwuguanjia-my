import { createApp } from './app.js';
import { config } from './config.js';
import { closePool, ping, query, run, transaction } from './db.js';
import { existsSync } from 'node:fs';

async function main() {
  /* 先探库再监听：配置写错要在启动阶段就炸出来，而不是让第一个登录请求替我们发现 */
  await ping();
  await run(`CREATE TABLE IF NOT EXISTS user_avatars (user_id CHAR(36) NOT NULL PRIMARY KEY, image_data MEDIUMTEXT NOT NULL, updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), CONSTRAINT fk_avatar_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  const purgeDue = async () => {
    const due = await query(`SELECT id,user_id FROM account_deletions WHERE status='grace' AND purge_after<=UTC_TIMESTAMP(3)`);
    for (const row of due) {
      await transaction(async (conn) => {
        const [users] = await conn.execute(`SELECT status FROM users WHERE id=? FOR UPDATE`, [row.user_id]);
        const [deletions] = await conn.execute(`SELECT status,purge_after FROM account_deletions WHERE id=? FOR UPDATE`, [row.id]);
        if (users[0]?.status !== 'deactivating' || deletions[0]?.status !== 'grace') return;
        await conn.execute(`DELETE FROM analytics_events WHERE user_id=?`, [row.user_id]);
        await conn.execute(`DELETE FROM users WHERE id=?`, [row.user_id]);
        await conn.execute(`UPDATE account_deletions SET status='purged',purged_at=UTC_TIMESTAMP(3) WHERE id=?`, [row.id]);
      });
    }
  };
  await purgeDue();
  const purgeTimer=setInterval(()=>purgeDue().catch(error=>console.error('[auth] 注销清理失败',error)),60*60*1000);
  purgeTimer.unref();

  const server = createApp().listen(config.port, () => {
    console.log(`[auth] 每日记账本账号服务已启动 → http://127.0.0.1:${config.port}/api/v1/auth（${config.env}）`);
    if (existsSync(config.staticDir)) {
      console.log(`[auth] 原型页面已同源托管 → http://127.0.0.1:${config.port}/pages/auth.html`);
    }
  });

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    clearInterval(purgeTimer);
    console.log(`[auth] 收到 ${signal}，停止接收新请求`);
    server.close(async () => {
      await closePool().catch(() => {});
      process.exit(0);
    });
    /* 给在途请求 5 秒，超时强退，避免连接泄漏把容器卡死 */
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[auth] 启动失败：', err.message);
  process.exit(1);
});
