import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const group = process.argv[2];
if (!['backend', 'uni'].includes(group)) {
  console.error('用法：node scripts/run-node-tests.mjs backend|uni');
  process.exit(2);
}

const reportDir = resolve(root, '测试报告');
mkdirSync(reportDir, { recursive: true });
const result = spawnSync(process.execPath, [
  '--test',
  '--test-reporter=spec', '--test-reporter-destination=stdout',
  '--test-reporter=junit', `--test-reporter-destination=${resolve(reportDir, `${group}-junit.xml`)}`,
  ...(group === 'backend'
    ? [resolve(root, 'tests/backend/smoke.test.mjs')]
    : [resolve(root, 'tests/uni/project.test.mjs'), resolve(root, 'tests/uni/ledger-flow.test.mjs')]),
], { stdio: 'inherit', env: process.env });
process.exit(result.status ?? 1);
