import { test } from 'node:test';
import assert from 'node:assert/strict';

test('账号服务健康检查返回可用状态', async () => {
  const base = process.env.TEST_BACKEND_URL || 'http://127.0.0.1:3000';
  const response = await fetch(new URL('/healthz', base), { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
});
