/* 运行配置。全部来自环境变量，缺失即拒绝启动——不给「内置一个默认签名密钥」的兜底，
   否则生产环境很容易带着可预测的密钥上线（PRD 第七章数据安全）。
   .env 放在本包根目录，已被仓库 .gitignore 排除；.env.example 是给同事抄的模板。 */

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = resolve(process.cwd(), '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function str(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`缺少环境变量 ${name}，请参考 .env.example 配置 ${envFile}`);
  }
  return raw;
}

function num(name, fallback) {
  const value = Number(str(name, String(fallback)));
  if (!Number.isFinite(value)) throw new Error(`环境变量 ${name} 必须是数字，当前值=${value}`);
  return value;
}

function secret(name, minBytes) {
  const value = str(name);
  if (value.length < minBytes * 2) {
    throw new Error(`${name} 太短：至少需要 ${minBytes} 字节随机值的 hex 长度（${minBytes * 2} 字符）`);
  }
  return value;
}

export const config = {
  env: str('NODE_ENV', 'development'),
  port: num('PORT', 3000),

  db: {
    host: str('DB_HOST', '127.0.0.1'),
    port: num('DB_PORT', 3306),
    user: str('DB_USER', 'root'),
    password: str('DB_PASSWORD', ''),
    database: str('DB_NAME', 'daily_ledger'),
    poolSize: num('DB_POOL_SIZE', 8)
  },

  /* PRD ACC-02 架构要求3：Access Token 2 小时 + Refresh Token 30 天滚动续期 */
  tokens: {
    jwtSecret: secret('JWT_SECRET', 32),
    issuer: str('JWT_ISSUER', 'daily-ledger'),
    /* Token 加盐哈希入库（第七章数据安全4）。列宽 CHAR(64) 就是 sha256 hex，别改成长度不匹配的摘要。 */
    pepper: secret('TOKEN_PEPPER', 16),
    accessTtlSec: num('ACCESS_TTL_SEC', 2 * HOUR_MS / 1000),
    refreshTtlSec: num('REFRESH_TTL_SEC', 30 * DAY_MS / 1000)
  },

  /* argon2id 参数取 OWASP 2024 下限（m=19456KiB≈19MB, t=2, p=1）。
     调高会直接顶到 ACC-02「认证接口 P95 ≤ 800ms」的预算上，改之前先压测。 */
  password: {
    memoryCostKib: num('ARGON2_MEMORY_KIB', 19456),
    timeCost: num('ARGON2_TIME_COST', 2),
    parallelism: num('ARGON2_PARALLELISM', 1),
    hashLength: num('ARGON2_HASH_LENGTH', 32)
  },

  /* 限流与锁定（ACC-02 规则5、第七章数据安全6），实现落在 auth_login_attempts 表 */
  throttle: {
    loginMaxFailsPerUsername: num('LOGIN_MAX_FAILS_USERNAME', 5),
    loginMaxFailsPerIp: num('LOGIN_MAX_FAILS_IP', 30),
    /* 递增退避：超出阈值后第 n 次锁 15s / 60s / 5m / 15m / 1h，之后一律 1h */
    backoffSeconds: [15, 60, 300, 900, 3600],
    failWindowSec: num('LOGIN_FAIL_WINDOW_SEC', 15 * 60),
    registerIpLimit: num('REGISTER_IP_LIMIT', 10),
    registerIpWindowSec: num('REGISTER_IP_WINDOW_SEC', HOUR_MS / 1000),
    registerDeviceLimit: num('REGISTER_DEVICE_LIMIT', 5),
    registerDeviceWindowSec: num('REGISTER_DEVICE_WINDOW_SEC', HOUR_MS / 1000)
  },

  /* 表单口径（PRD ACC-02 / 5.5），改这里等于改产品需求，先走评审 */
  username: { min: 3, max: 20 },
  passwordPolicy: { min: 6, max: 64 },

  /* 只在显式置于可信反代后才信任 X-Forwarded-For；默认不信任，否则 IP 频控可被伪造头绕过 */
  trustProxy: str('TRUST_PROXY', 'false') === 'true',

  /* 允许跨域调用 /api/v1/auth/* 的前端来源。默认给 004前端开发/画面设计 的原型
     （README 里用 python3 -m http.server 8080 起）。设成 * 只该出现在本机联调。 */
  corsOrigins: str('CORS_ORIGINS', 'http://localhost:8080,http://127.0.0.1:8080')
    .split(',').map((item) => item.trim()).filter(Boolean),

  /* 原型页面由本进程一起托管，页面和接口同源，跨域这一整层坑就此消失，
     本机联调也只需要起一个进程。环境变量 STATIC_DIR 设成空字符串即可关掉。 */
  staticDir: process.env.STATIC_DIR === undefined
    ? resolve(packageRoot, '..', '004前端开发', '画面设计')
    : process.env.STATIC_DIR === '' ? '' : resolve(packageRoot, process.env.STATIC_DIR)
};

export const isProduction = config.env === 'production';
