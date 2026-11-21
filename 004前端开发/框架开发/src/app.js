import express from 'express';
import { existsSync } from 'node:fs';
import { config } from './config.js';
import { ping } from './db.js';
import { authRouter } from './auth/routes.js';
import { dataRouter } from './data/routes.js';
import { cors } from './http/cors.js';
import { errorHandler, notFoundHandler } from './http/errors.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  /* 只在显式声明自己站在可信反代后面时才解析 X-Forwarded-For，
     否则伪造这个头就能绕过 IP 维度的注册频控与登录锁定 */
  if (config.trustProxy) app.set('trust proxy', 1);

  /* 认证请求体就两个字段，16KB 足够；上限压低是给恶意大包留的刹车（第七章性能） */
  /* 预检请求没有 body，CORS 必须排在 body 解析之前 */
  app.use(cors);

  /* 顺带把 004前端开发/画面设计 的原型页面托管了：页面和接口同源，
     既不用第二个进程，也不会再出现「来源不在 CORS 白名单」这类连不上账号服务的报错 */
  if (config.staticDir && existsSync(config.staticDir)) {
    app.use(express.static(config.staticDir));
  }

  app.use('/api/v1/data', express.json({ limit: '256kb' }));
  app.use(express.json({ limit: '16kb' }));

  app.get('/healthz', async (req, res) => {
    await ping();
    res.json({ ok: true, env: config.env });
  });

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/data', dataRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
