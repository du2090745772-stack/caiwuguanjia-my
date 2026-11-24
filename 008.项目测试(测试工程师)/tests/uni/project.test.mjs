import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const app = fileURLToPath(new URL('../../../007多端应用app开发/uni-app-应用/', import.meta.url));
const read = (name) => readFileSync(resolve(app, name), 'utf8');

test('三端构建入口和单页入口均已配置', () => {
  const pkg = JSON.parse(read('package.json'));
  const pages = read('pages.json');
  for (const target of ['mp-weixin', 'app', 'h5']) {
    assert.ok(pkg.scripts[`build:${target}`], `缺少 ${target} 构建命令`);
  }
  assert.match(pages, /pages\/index\/index/);
});

test('正式包的账号地址由构建环境提供', () => {
  const config = read('config/api.js');
  assert.match(config, /VITE_API_BASE_URL/);
  assert.match(config, /import\.meta\.env\.DEV/);
});
