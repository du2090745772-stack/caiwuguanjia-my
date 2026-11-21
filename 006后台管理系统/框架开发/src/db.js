import mysql from 'mysql2/promise';
import { config } from './config.js';
export const pool = mysql.createPool({ ...config.database, connectionLimit: 8, waitForConnections: true, dateStrings: true, multipleStatements: false });
export async function query(sql, params = []) { const [rows] = await pool.execute(sql, params); return rows; }
export async function one(sql, params = []) { return (await query(sql, params))[0] ?? null; }
export async function run(sql, params = []) { const [result] = await pool.execute(sql, params); return result; }
export async function closePool() { await pool.end(); }
