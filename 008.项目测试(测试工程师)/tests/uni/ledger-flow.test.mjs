import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../');
const source = readFileSync(resolve(root, '007多端应用app开发/uni-app-应用/services/ledger.js'), 'utf8')
  .replace('import { API_BASE_URL } from "../config/api.js";', 'const API_BASE_URL = "";');
const storage = new Map();
globalThis.uni = {
  getStorageSync: (key) => storage.get(key),
  setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
  removeStorageSync: (key) => storage.delete(key),
};
const ledger = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const month = '2026-11';

test('免登录模式：分类、账单、预算、统计和资料完整流转', async () => {
  ledger.enterGuestMode();
  assert.equal(ledger.isGuestMode(), true);
  assert.equal(ledger.signedIn(), false);
  const initial = await ledger.categories();
  assert.equal(initial.length, 14);

  const category = await ledger.addCategory({ type: 'expense', name: '测试宠物', icon: '🐾' });
  assert.ok(category.id);
  assert.equal((await ledger.categories()).length, 15);
  await assert.rejects(ledger.addCategory({ type: 'expense', name: '测试宠物', icon: '🐾' }), /分类名称已存在/);

  const record = await ledger.addRecord({ type: 'expense', amount: 35, date: '2026-11-22', categoryId: category.id, note: '猫粮' });
  assert.ok(record.id);
  assert.equal((await ledger.records(month))[0].note, '猫粮');
  assert.equal((await ledger.summary(month)).expense, 35);
  await ledger.editCategory(category.id, { name: '宠物用品', icon: '🐈' });
  assert.equal((await ledger.records(month))[0].category, '宠物用品');
  await ledger.editRecord(record.id, { type: 'expense', amount: 55, date: '2026-11-22', categoryId: category.id, note: '猫砂' });
  assert.equal((await ledger.records(month))[0].amount, 55);
  assert.equal((await ledger.summary(month)).categories[0].amount, 55);

  const incomeCategory = (await ledger.categories()).find((c) => c.type === 'income');
  const income = await ledger.addRecord({ type: 'income', amount: 120, date: '2026-11-22', categoryId: incomeCategory.id, note: '奖金' });
  assert.equal((await ledger.summary(month)).income, 120);
  assert.equal((await ledger.summary(month)).balance, 65);
  assert.equal((await ledger.analytics(month)).rows.length, 2);

  await ledger.saveBudget(month, 100);
  await ledger.saveBudget(month, 70, category.id);
  assert.equal((await ledger.budget(month)).total, 100);
  assert.equal((await ledger.budget(month)).categories[0].amount, 70);
  assert.equal((await ledger.summary(month)).budget, 100);
  await ledger.removeBudget(month, category.id);
  assert.equal((await ledger.budget(month)).categories.length, 0);
  await ledger.removeBudget(month);
  assert.equal((await ledger.budget(month)).total, null);

  await ledger.saveProfile({ nickname: '测试用户', bio: '本地体验' });
  assert.equal((await ledger.profile()).nickname, '测试用户');
  assert.equal((await ledger.profile()).recordCount, 2);
  assert.equal(ledger.guestCount(), 2);
  assert.equal((await ledger.allRecords()).length, 2);
  await ledger.removeRecord(record.id);
  await ledger.removeRecord(income.id);
  assert.equal((await ledger.records(month)).length, 0);
  assert.equal((await ledger.summary(month)).expense, 0);
  assert.equal((await ledger.profile()).recordCount, 0);
  await ledger.removeCategory(category.id);
  assert.equal((await ledger.categories()).length, 14);
});
