/* 原型页面跑在 :8080，账号服务在 :3000，带 content-type 与 x-device-id 的请求
   一定会先发 OPTIONS 预检。手写而不引 cors 包——需求只是「按白名单回四个头」。
   Token 走 Authorization 头而非 Cookie，所以不需要 Allow-Credentials，
   也因此不反射任意 Origin：白名单外的来源拿不到 CORS 头，浏览器自行拦掉响应。 */

import { config } from '../config.js';

const ALLOW_METHODS = 'GET, POST, DELETE, OPTIONS';
const ALLOW_HEADERS = 'content-type, authorization, x-device-id, x-platform';
const MAX_AGE_SECONDS = '600';

export function cors(req, res, next) {
  const origin = req.get('origin');
  const allowed = !origin ? null
    : config.corsOrigins.includes('*') ? '*'
    : config.corsOrigins.includes(origin) ? origin
    : null;

  if (allowed) {
    res.set('Access-Control-Allow-Origin', allowed);
    res.set('Access-Control-Allow-Methods', ALLOW_METHODS);
    res.set('Access-Control-Allow-Headers', ALLOW_HEADERS);
    res.set('Access-Control-Max-Age', MAX_AGE_SECONDS);
    if (allowed !== '*') res.set('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
}
