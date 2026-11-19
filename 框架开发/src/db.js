/* MySQL 连接池。
   时间口径：库里 DATETIME(3) 一律存 UTC（005数据库脚本/01_schema.sql 全局口径 B）。
   为避免驱动时区解释带来的偏差，本模块把时间当字符串处理：
     - dateStrings: true  → 读回来就是库里那串 UTC 文本，不做本地时区换算
     - toSqlUtc()         → 写入前显式格式化成 'YYYY-MM-DD HH:mm:ss.SSS'
   需要「现在 + N 秒」这类计算时交给 SQL 的 NOW(3) + INTERVAL，让数据库当唯一时钟源，
   应用多实例部署也不会因为机器时钟漂移产生不一致。 */

import mysql from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  connectionLimit: config.db.poolSize,
  waitForConnections: true,
  queueLimit: 0,
  dateStrings: true,
  supportBigNumbers: true,
  multipleStatements: false
});

export function query(sql, params = []) {
  return pool.execute(sql, params).then(([rows]) => rows);
}

export async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

export async function run(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result;
}

export async function transaction(handler) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await handler(conn);
    await conn.commit();
    return out;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

export function toSqlUtc(date = new Date()) {
  return date.toISOString().slice(0, 23).replace('T', ' ');
}

export function fromSqlUtc(text) {
  if (!text) return null;
  const ms = Date.parse(String(text).replace(' ', 'T') + 'Z');
  return Number.isNaN(ms) ? null : new Date(ms);
}

export async function ping() {
  await one('SELECT 1 AS ok');
}

export async function closePool() {
  await pool.end();
}
