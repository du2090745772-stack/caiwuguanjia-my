import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = resolve(root, '../007多端应用app开发/uni-app-应用');
const reportDir = resolve(root, '测试报告');
mkdirSync(reportDir, { recursive: true });
const rows = [];
for (const target of ['mp-weixin', 'app', 'h5']) {
  const result = spawnSync('npm', ['run', `build:${target}`], {
    cwd: app,
    encoding: 'utf8',
    env: { ...process.env, UNI_INPUT_DIR: app },
  });
  rows.push({ target, passed: result.status === 0, output: `${result.stdout || ''}${result.stderr || ''}` });
  process.stdout.write(`${target}: ${result.status === 0 ? '通过' : '失败'}\n`);
}
writeFileSync(resolve(reportDir, 'uni-build.json'), JSON.stringify({ time: new Date().toISOString(), results: rows }, null, 2));
if (rows.some((row) => !row.passed)) process.exit(1);
