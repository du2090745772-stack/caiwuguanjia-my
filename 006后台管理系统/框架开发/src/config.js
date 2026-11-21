import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const envFile = resolve(process.cwd(), '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
const required = (name) => { const value = process.env[name]; if (!value) throw new Error(`缺少 ${name}，请配置 .env`); return value; };
export const config = {
  production: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 3100),
  database: { host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306), user: required('DB_USER'), password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME || 'daily_ledger' },
  sessionSecret: required('ADMIN_SESSION_SECRET'),
  staticDir: resolve(process.cwd(), '../画面设计'),
};
if (Buffer.byteLength(config.sessionSecret) < 32) throw new Error('ADMIN_SESSION_SECRET 至少 32 字节');
