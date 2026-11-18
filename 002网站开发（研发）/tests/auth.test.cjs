/* 演示账号层单测：用户名 + 密码，注册与登录分属两个动作（PRD V1.0.1 ACC-02/ACC-04）
   用假时钟 + 内存存储跑纯逻辑，不依赖浏览器。 node tests/auth.test.cjs */
const assert = require('assert');
const A = require('../js/auth.js');

const NAME = 'taozi_2026';
const PASS = 'abc123';
const HOUR = 3600e3;
const DAY = 864e5;

let passed = 0;
let now = 0;
let mem = null;

function reset() {
  now = 0;
  mem = null;
  A.wipeAll();
  A.configure({ now: () => now, load: () => mem, save: (s) => { mem = s; } });
}
function t(name, fn) { fn(); passed += 1; }
const r = (id, updated) => ({ id, date: '2026-11-01', updated_at: new Date(updated).toISOString() });

t('用户名校验与归一化', () => {
  reset();
  assert.strictEqual(A.validName(' Taozi_2026 '), true);
  assert.strictEqual(A.normalizeName(' Taozi_2026 '), NAME, '大小写与首尾空格归一');
  assert.strictEqual(A.validName('淘宝记账'), true);
  assert.strictEqual(A.validName('ab'), false, '少于 3 位');
  assert.strictEqual(A.validName(new Array(22).join('x')), false, '超过 20 位');
  assert.strictEqual(A.validName('tao zi'), false, '不能有空格');
  assert.strictEqual(A.validName('tao@zi'), false, '不能有特殊符号');
  assert.strictEqual(A.validName(''), false);
});

t('密码长度规则', () => {
  reset();
  assert.strictEqual(A.validPass('12345'), false);
  assert.strictEqual(A.validPass('123456'), true);
  assert.strictEqual(A.validPass(new Array(66).join('x')), false);
  assert.strictEqual(A.validPass(''), false);
});

t('密码摘要稳定且本机不留明文', () => {
  reset();
  assert.strictEqual(A.hashPassword(PASS), A.hashPassword(PASS));
  assert.notStrictEqual(A.hashPassword(PASS), A.hashPassword(PASS + 'x'));
  A.register(NAME, PASS);
  assert.ok(JSON.stringify(A.state()).indexOf(PASS) < 0, '本机状态里不应出现明文密码');
});

t('注册即建号并直接进入登录态', () => {
  reset();
  const res = A.register(NAME, PASS);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.is_new_account, true);
  assert.strictEqual(res.cloud.count, 0);
  assert.strictEqual(A.session().status, 'active');
  assert.strictEqual(A.name(), NAME);
  assert.strictEqual(A.hasAccount(NAME), true);
});

t('重名注册被拒，且不覆盖原密码', () => {
  reset();
  A.register(NAME, PASS);
  A.logout();
  const dup = A.register(NAME, 'other9');
  assert.strictEqual(dup.ok, false);
  assert.strictEqual(dup.reason, 'name_taken');
  assert.strictEqual(A.session().status, 'none', '注册失败不应留下登录态');
  assert.strictEqual(A.login(NAME, PASS).ok, true, '原密码仍然有效');
  assert.strictEqual(A.login(NAME, 'other9').ok, false);
});

t('登录不建号', () => {
  reset();
  const res = A.login(NAME, PASS);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'bad_credentials');
  assert.strictEqual(A.hasAccount(NAME), false, '登录绝不能静默建号');
  assert.strictEqual(A.session().status, 'none');
});

t('用户名不存在与密码错误同文案，不给枚举留口', () => {
  reset();
  A.register(NAME, PASS);
  A.logout();
  assert.strictEqual(A.login(NAME, 'wrong1').reason, 'bad_credentials');
  assert.strictEqual(A.login('nobody_99', PASS).reason, 'bad_credentials');
  const good = A.login(NAME, PASS);
  assert.strictEqual(good.ok, true);
  assert.strictEqual(good.is_new_account, false, '老账号登录不该算新建');
});

t('非法入参不建号', () => {
  reset();
  assert.strictEqual(A.register('no', PASS).reason, 'bad_name');
  assert.strictEqual(A.register(NAME, '123').reason, 'bad_pass');
  assert.strictEqual(A.login('no', PASS).reason, 'bad_name');
  assert.strictEqual(A.login(NAME, '123').reason, 'bad_pass');
  assert.strictEqual(A.hasAccount(NAME), false);
});

t('换用户名即切号', () => {
  reset();
  A.register(NAME, PASS);
  A.backup([r('a', 0)]);
  const res = A.register('other_99', PASS);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(A.name(), 'other_99');
  assert.strictEqual(A.cloudSummary().count, 0, '换账号后看不到上一个账号的快照');
});

t('Access 过期需静默续期，Refresh 过期才算退出', () => {
  reset();
  A.register(NAME, PASS);
  now += 2 * HOUR;
  assert.strictEqual(A.session().status, 'needs_refresh');
  assert.strictEqual(A.refresh().ok, true);
  assert.strictEqual(A.session().status, 'active');
  now += 30 * DAY;
  assert.strictEqual(A.session().status, 'none');
  assert.strictEqual(A.refresh().ok, false);
});

t('退出登录保留账号与备份快照', () => {
  reset();
  A.register(NAME, PASS);
  A.backup([r('a', 0)]);
  A.logout();
  assert.strictEqual(A.session().status, 'none');
  assert.strictEqual(A.hasAccount(NAME), true);
  assert.strictEqual(A.cloudSummary().count, 1);
  assert.strictEqual(A.backup([r('a', 0)]).reason, 'signed_out', '未登录不能写快照');
  assert.strictEqual(A.login(NAME, 'other9').ok, false);
  assert.strictEqual(A.login(NAME, PASS).ok, true, '退出后同一密码仍可登录');
  assert.strictEqual(A.cloudSummary().count, 1, '重新登录找回同一份快照');
});

t('待备份计数：新增、变更、删除与抵消局限', () => {
  reset();
  A.register(NAME, PASS);
  assert.strictEqual(A.pendingCount([r('a', 0), r('b', 0)]), 2, '没有快照时全算待备份');
  A.backup([r('a', 0), r('b', 0)]);
  assert.strictEqual(A.pendingCount([r('a', 0), r('b', 0)]), 0);
  assert.strictEqual(A.pendingCount([r('a', 0), r('b', 5000), r('c', 5000)]), 2, '一条变更 + 一条新增');
  // 已知局限：只比对笔数与更新时间，新增 1 条的同时删掉 1 条会相互抵消
  assert.strictEqual(A.pendingCount([r('a', 0), r('d', 9000)]), 1);
  assert.strictEqual(A.pendingCount([r('a', 0)]), 1, '只删不增时按差额计');
  now = 100000;
  A.backup([r('a', 0), r('d', 9000)]);
  assert.strictEqual(A.pendingCount([r('a', 0), r('d', 9000)]), 0);
});

t('合并：按 id 去重、同键取更新时间新者', () => {
  reset();
  const local = [r('a', 10), r('b', 10)];
  const cloud = [r('b', 5), r('c', 20)];
  const both = A.merge(local, cloud, 'keep_both');
  assert.strictEqual(both.kept.length, 3);
  assert.strictEqual(both.added, 1);
  assert.strictEqual(both.superseded, 0, '云端那条更旧，不该覆盖本机');
  const newer = A.merge(local, [r('b', 30)], 'keep_both');
  assert.strictEqual(newer.superseded, 1);
  assert.strictEqual(newer.kept.find((x) => x.id === 'b').updated_at, new Date(30).toISOString());
  const only = A.merge(local, cloud, 'local_only');
  assert.deepStrictEqual(only.kept, local);
});

t('忘记密码只能清掉本机账号', () => {
  reset();
  A.register(NAME, PASS);
  assert.strictEqual(A.forgetAccount('other_99').reason, 'no_account');
  A.logout();
  assert.strictEqual(A.forgetAccount(NAME).ok, true);
  assert.strictEqual(A.hasAccount(NAME), false);
  assert.strictEqual(A.login(NAME, PASS).ok, false, '清掉账号后旧密码不再能登录');
  assert.strictEqual(A.register(NAME, 'brandnew').is_new_account, true, '同名可重新注册');
});

t('注销：用户名核对、7 天冷静期、重新登录撤销、到期清空', () => {
  reset();
  A.register(NAME, PASS);
  A.backup([r('a', 0)]);
  assert.strictEqual(A.deactivate('other_99').reason, 'name_mismatch');
  const res = A.deactivate(NAME);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.grace_until, 7 * DAY);
  assert.strictEqual(A.session().status, 'none');
  assert.strictEqual(A.cloudSummary().deactivated_until, 7 * DAY);
  assert.strictEqual(A.purgeExpired(), false);
  now = 7 * DAY + 1;
  assert.strictEqual(A.purgeExpired(), true);
  assert.strictEqual(A.cloudSummary().count, 0);

  now = 0;
  A.login(NAME, PASS);
  A.backup([r('a', 0)]);
  A.deactivate(NAME);
  now += 1000;
  const back = A.login(NAME, PASS);
  assert.strictEqual(back.revoked_deactivation, true);
  assert.strictEqual(A.cloudSummary().deactivated_until, 0);
  assert.strictEqual(A.cloudSummary().count, 1, '冷静期内撤销不该丢数据');
});

t('状态可跨刷新恢复', () => {
  reset();
  A.register(NAME, PASS);
  A.backup([r('a', 0)]);
  const saved = JSON.parse(JSON.stringify(mem));
  A.configure({ load: () => saved });
  assert.strictEqual(A.session().status, 'active');
  assert.strictEqual(A.cloudSummary().count, 1);
  assert.strictEqual(A.hasAccount(NAME), true);
});

console.log(passed + ' 组断言通过');
