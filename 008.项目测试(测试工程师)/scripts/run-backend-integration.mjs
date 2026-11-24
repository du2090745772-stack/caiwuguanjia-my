import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const db = process.env.DB_NAME;
if (!db || !process.env.TEST_DB_NAME || db !== process.env.TEST_DB_NAME || db === 'daily_ledger' || !/_test$/.test(db)) {
  console.error('拒绝运行会写库的集成测试：请显式设置相同的 DB_NAME 和 TEST_DB_NAME，名称须以 _test 结尾且不能是 daily_ledger。');
  process.exit(2);
}
const reportDir = resolve(root, '测试报告');
mkdirSync(reportDir, { recursive: true });
const backend = resolve(root, '../004前端开发/框架开发');
const result = spawnSync(process.execPath, [
  '--test',
  '--test-reporter=spec', '--test-reporter-destination=stdout',
  '--test-reporter=junit', `--test-reporter-destination=${resolve(reportDir, 'backend-integration-junit.xml')}`,
  resolve(backend, 'test/auth.e2e.test.js'),
], { cwd: backend, stdio: 'inherit', env: process.env });
process.exit(result.status ?? 1);
