import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const project = resolve(root, '..');
const backend = resolve(project, '004前端开发/框架开发');
const name = process.env.TEST_DB_NAME || 'daily_ledger_test';
if (!/^[a-z][a-z0-9_]*_test$/.test(name) || name === 'daily_ledger') throw Error('测试库名必须以 _test 结尾，且不能是正式库');
process.loadEnvFile(resolve(backend, '.env'));
const require = createRequire(pathToFileURL(resolve(backend, 'package.json')));
const mysql = require('mysql2/promise');
const connection = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || '',
  multipleStatements: true,
});
try {
  for (const file of ['01_schema.sql', '02_seed.sql']) {
    const sql = readFileSync(resolve(project, '005数据库脚本', file), 'utf8').replaceAll('`daily_ledger`', `\`${name}\``);
    await connection.query(sql);
  }
  const [rows] = await connection.query(`SELECT COUNT(*) AS count FROM \`${name}\`.category_templates`);
  if (Number(rows[0].count) !== 14) throw Error('测试库默认分类模板数量不正确');
  console.log(`隔离测试库 ${name} 已就绪，默认分类 14 条`);
} finally {
  await connection.end();
}
