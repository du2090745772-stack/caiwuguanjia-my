/* 端到端验收：真起 HTTP 服务 + 真连 MySQL 9.7.4，逐条对着 PRD ACC-02 / ACC-04 测。
   不写桩件——认证最容易出错的地方恰恰是 SQL 绑定、UTC 时区、事务与唯一索引，
   mock 掉数据库就只能验证「代码按我想的跑」，验证不了「按 MySQL 的方式跑」。 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import ExcelJS from 'exceljs';

/* 测试用 X-Forwarded-For 给每次调用分配独立 IP，让 IP 维度的频控互相隔离，
   也顺带把 TRUST_PROXY=true 这条分支跑一遍。必须在 import src 之前设好——
   config.js 是导入即固化的，而 ESM 的 import 会先于本文件语句执行，所以 src 走动态导入。 */
process.env.TRUST_PROXY = 'true';

const { createApp } = await import('../src/app.js');
const { query, run, closePool } = await import('../src/db.js');

/* 故意造 4xx 会让 errorHandler 每行刷一条摘要，把测试输出埋了；跑完还原 */
const realConsoleInfo = console.info;
console.info = () => {};

const RUN_TAG = `z${Date.now().toString(36)}${randomBytes(2).toString('hex')}`.toLowerCase();
const IP_PREFIX = '10.99';
let seq = 0;

/* 每次调用一套独立的「浏览器」身份：用户名 13+2 字符，稳在 3–20 位内 */
function identity() {
  seq += 1;
  return {
    ip: `${IP_PREFIX}.${(seq >> 8) & 255}.${seq & 255}`,
    device: `${RUN_TAG}d${seq}`
  };
}
const nameFor = (n) => `${RUN_TAG}u${n}`;
const PASSWORD = 'MisT3se-Pass!';

let httpServer = null;
let baseUrl = '';

async function api(method, path, { body, token, who } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  if (who) {
    headers['x-forwarded-for'] = who.ip;
    headers['x-device-id'] = who.device;
  }
  const res = await fetch(baseUrl + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  return {
    status: res.status,
    body: text ? JSON.parse(text) : null,
    text,
    retryAfter: res.headers.get('retry-after')
  };
}

const register = (username, who, extra = {}) =>
  api('POST', '/api/v1/auth/register', {
    who,
    body: { username, password: PASSWORD, privacy_accepted: true, ...extra }
  });
const login = (username, who, password = PASSWORD) =>
  api('POST', '/api/v1/auth/login', { who, body: { username, password } });

async function userRow(username) {
  const rows = await query(`SELECT * FROM users WHERE username = ?`, [username.toLowerCase()]);
  return rows[0];
}

async function clearThrottle(keys) {
  for (const key of keys) {
    await run(`DELETE FROM auth_login_attempts WHERE target_key = ?`, [key]);
  }
}

before(async () => {
  httpServer = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => httpServer.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
});

after(async () => {
  console.info = realConsoleInfo;
  /* 用户名 LIKE 匹配建出来的号（auth_sessions 等按 FK 级联），以及本次测试造出的频控计数 */
  await run(`DELETE FROM users WHERE username LIKE ?`, [`${RUN_TAG}%`]);
  await run(`DELETE FROM auth_login_attempts WHERE target_key LIKE ? OR target_key LIKE ?`,
    [`${RUN_TAG}%`, `${IP_PREFIX}.%`]);
  httpServer.close();
  await closePool();
});

test('注册：201 返回双 Token，库里只落 argon2id 散列与加盐后的 Refresh 摘要', async () => {
  const who = identity();
  const mixedCase = nameFor(1).slice(0, 1) + nameFor(1).slice(1).toUpperCase();
  const res = await register(mixedCase, who);

  assert.equal(res.status, 201);
  assert.equal(res.body.token_type, 'Bearer');
  assert.equal(res.body.expires_in, 7200, 'Access 有效期须为 2 小时（ACC-02 架构要求3）');
  assert.equal(res.body.user.username, nameFor(1), '用户名须归一化为小写入库（ACC-02 规则1）');
  assert.equal(res.body.user.is_new_account, true);
  assert.equal(res.body.cloud_summary.bill_count, 0, '登录响应要带云端笔数，供流程四的迁移弹窗');
  assert.equal(res.body.access_token.split('.').length, 3);

  const user = await userRow(nameFor(1));
  assert.ok(user, '用户行应已落库');
  assert.match(user.password_hash, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/, '散列须是 argon2id 且参数与配置一致');
  assert.ok(!user.password_hash.includes(PASSWORD) && !JSON.stringify(user).includes(PASSWORD),
    '任何列都不得出现明文密码（第七章数据安全5）');

  const sessions = await query(
    `SELECT refresh_token_hash,
            TIMESTAMPDIFF(SECOND, created_at, access_expires_at) AS access_span,
            TIMESTAMPDIFF(SECOND, created_at, refresh_expires_at) AS refresh_span
       FROM auth_sessions WHERE user_id = ?`,
    [user.id]
  );
  assert.equal(sessions.length, 1);
  assert.match(sessions[0].refresh_token_hash, /^[0-9a-f]{64}$/, 'Refresh 只存 sha256 hex，正好对上 CHAR(64)');
  assert.ok(!sessions[0].refresh_token_hash.includes(res.body.refresh_token));
  assert.equal(Number(sessions[0].access_span), 7200, 'DATE_ADD 绑参：Access 应恰好 2 小时');
  assert.equal(Number(sessions[0].refresh_span), 2592000, 'DATE_ADD 绑参：Refresh 应恰好 30 天');
});

test('注册：同名不同大小写撞唯一索引 → 409（不做预查，靠 1062）', async () => {
  const res = await register(nameFor(1).toUpperCase(), identity());
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'name_taken');
  assert.equal(res.body.error.message, '这个用户名已经有了，换一个或直接登录');
});

test('注册：未勾选隐私政策 → 400', async () => {
  const res = await register(nameFor(2), identity(), { privacy_accepted: false });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'privacy_policy_required');
  assert.equal(await userRow(nameFor(2)), undefined, '合规未过不应已经建号');
});

test('注册：用户名与密码不合表单口径 → 400，文案照 PRD 5.5', async () => {
  const badNames = ['ab', 'abcd efgh', 'a!b@c#d', ''];
  for (const username of badNames) {
    const res = await register(username, identity());
    assert.equal(res.status, 400, `「${username}」本应被拒`);
    assert.equal(res.body.error.code, 'invalid_username');
    assert.equal(res.body.error.message, '用户名要 3–20 位，不能有空格');
  }
  const tooLong = await register(`${RUN_TAG}x`.padEnd(21, '9'), identity());
  assert.equal(tooLong.status, 400);

  const res = await register(nameFor(3), identity(), { password: '12345' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'invalid_password');
  assert.equal(res.body.error.message, '密码至少 6 位');
  assert.equal(await userRow(nameFor(3)), undefined);
});

test('登录：凭据正确 → 200 且写入 last_login_at', async () => {
  const who = identity();
  const res = await login(nameFor(1), who);
  assert.equal(res.status, 200);
  assert.equal(res.body.user.username, nameFor(1));
  assert.equal(res.body.user.is_new_account, false);
  assert.ok(res.body.refresh_token);

  const user = await userRow(nameFor(1));
  assert.ok(user.last_login_at, '成功登录须刷新 last_login_at');
});

test('防枚举：密码错 与 账号不存在 的响应逐字节一致', async () => {
  const wrongPassword = await login(nameFor(1), identity(), `${PASSWORD}x`);
  const noSuchUser = await login(nameFor(9), identity());

  assert.equal(wrongPassword.status, 401);
  assert.equal(noSuchUser.status, 401);
  assert.equal(wrongPassword.text, noSuchUser.text,
    '两种失败必须给出完全相同的响应，否则响应差异本身就在回答「这个用户名存不存在」（ACC-02 规则2）');
  assert.equal(noSuchUser.body.error.message, '账号或密码不对，再检查一下');
  assert.ok(!JSON.stringify(noSuchUser.body).includes('exist'), '响应里不得出现任何存在性提示');
});

test('频控：同一用户名连续失败后递增锁定，锁定期内连正确密码也被拒', async () => {
  const username = nameFor(4);
  const who = identity();
  await register(username, who);

  /* 注册计数与这条用户名无关，但要先把可能的历史计数清干净，让断言只反映本用例 */
  await clearThrottle([username.toLowerCase(), who.ip]);

  let locked = null;
  for (let attempt = 1; attempt <= 7 && !locked; attempt += 1) {
    const res = await login(username, who, `${PASSWORD}x`);
    if (attempt <= 4) assert.equal(res.status, 401, '前 4 次应仍按普通凭据错误返回');
    if (res.status === 429) locked = { attempt, res };
  }
  assert.ok(locked, '连续失败触顶后应返回 429（ACC-02 规则5）');
  assert.equal(locked.res.body.error.code, 'account_locked');
  assert.equal(locked.res.body.error.message, '尝试次数太多，请稍后再试');
  assert.ok(Number(locked.res.body.error.retry_after_seconds) > 0);
  assert.equal(locked.res.retryAfter, String(locked.res.body.error.retry_after_seconds),
    '429 必须带 Retry-After，前端才知道要不要禁用按钮');

  const right = await login(username, who);
  assert.equal(right.status, 429, '锁定的前置检查在校验密码之前——否则锁定态本身成了枚举探针');

  await clearThrottle([username.toLowerCase(), who.ip]);
});

test('Refresh 轮换：旧 Token 复用即判重放，吊销该账号全部会话', async () => {
  const who = identity();
  const first = await register(nameFor(5), who);
  const rotated = await api('POST', '/api/v1/auth/refresh', {
    who, body: { refresh_token: first.body.refresh_token }
  });
  assert.equal(rotated.status, 200);
  assert.ok(rotated.body.access_token);
  assert.notEqual(rotated.body.refresh_token, first.body.refresh_token, '滚动续期必须换发新 Refresh');
  assert.equal(rotated.body.cloud_summary, undefined, '续期响应不带用户资料，省一列查询');

  const replay = await api('POST', '/api/v1/auth/refresh', {
    who, body: { refresh_token: first.body.refresh_token }
  });
  assert.equal(replay.status, 401);
  assert.equal(replay.body.error.code, 'signed_out');
  assert.equal(replay.body.error.message, '登录已过期，请重新登录');

  const stolenSibling = await api('POST', '/api/v1/auth/refresh', {
    who, body: { refresh_token: rotated.body.refresh_token }
  });
  assert.equal(stolenSibling.status, 401, '判定重放后整条链都应失效');

  const missing = await api('POST', '/api/v1/auth/refresh', { who, body: {} });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error.code, 'missing_field');
});

test('多浏览器：一个浏览器退出不牵连其他浏览器（ACC-04 规则4）', async () => {
  const username = nameFor(6);
  const browserA = identity();
  const browserB = identity();
  const a = await register(username, browserA);
  const b = await login(username, browserB);
  assert.equal(b.status, 200);

  const signedOut = await api('DELETE', '/api/v1/auth/session', { token: a.body.access_token, who: browserA });
  assert.equal(signedOut.status, 204);
  assert.equal(signedOut.text, '');

  const stillAlive = await api('POST', '/api/v1/auth/refresh', {
    who: browserB, body: { refresh_token: b.body.refresh_token }
  });
  assert.equal(stillAlive.status, 200, 'B 浏览器的会话不能因为 A 退出而被吊销');

  const repeat = await api('DELETE', '/api/v1/auth/session', { token: a.body.access_token, who: browserA });
  assert.equal(repeat.status, 401);
  assert.equal(repeat.body.error.code, 'signed_out');
});

test('登录态：缺失或伪造 Bearer → 401，签名不过的一律要求重新登录', async () => {
  const who = identity();
  const noHeader = await api('DELETE', '/api/v1/auth/session', { who });
  assert.equal(noHeader.status, 401);
  assert.equal(noHeader.body.error.message, '登录已过期，请重新登录');

  const wrongScheme = await api('DELETE', '/api/v1/auth/session', { who, token: 'Basic abc' });
  assert.equal(wrongScheme.status, 401);

  const forged = await api('DELETE', '/api/v1/auth/session', {
    who, token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4Iiwic2lkIjoieSIsInR5cCI6ImFjY2VzcyIsImlzcyI6ImRhaWx5LWxlZGdlciJ9.deadbeef'
  });
  assert.equal(forged.status, 401);
});

test('请求体：非 JSON 与未知路由各有确定错误', async () => {
  const who = identity();
  const brokenJson = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': who.ip },
    body: '{"username":'
  });
  assert.equal(brokenJson.status, 400);
  assert.equal((await brokenJson.json()).error.code, 'invalid_body');

  const unknown = await api('GET', '/api/v1/auth/nope', { who });
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error.code, 'not_found');

  const health = await api('GET', '/healthz', { who });
  assert.equal(health.status, 200);
  assert.equal(health.body.ok, true);
});

test('同名并发注册：只有一个成功，另一个 409', async () => {
  const username = nameFor(7);
  const [x, y] = await Promise.all([register(username, identity()), register(username, identity())]);
  const statuses = [x.status, y.status].sort();
  assert.deepEqual(statuses, [201, 409], '唯一索引要保证并发建号不产生两个同名账号');
});

test('时间口径：库里存 UTC，出接口必须转成带 Z 的 ISO 时刻', async () => {
  const who = identity();
  const username = nameFor(20);
  const registered = await register(username, who);
  assert.equal(registered.body.cloud_summary.latest_bill_at, null, '新账号没有账单，最近变更时间应为空');

  const { id } = await userRow(username);
  await run(`INSERT INTO bill_records (user_id, amount_cent, record_date) VALUES (?, ?, ?)`,
    [id, 1200, '2026-11-19']);
  const res = await login(username, who);
  const iso = res.body.cloud_summary.latest_bill_at;

  assert.match(iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    '少了 Z 前端会按本地时间解析，流程四的「云端最近变更」会整整差一个时区');
  const [row] = await query(`SELECT updated_at FROM bill_records WHERE user_id = ?`, [id]);
  assert.equal(Date.parse(iso), Date.parse(`${row.updated_at.replace(' ', 'T')}Z`), '转格式只能改表示，不能改时刻');

  await run(`DELETE FROM bill_records WHERE user_id = ?`, [id]);
});

test('云端账本：分类、账单、预算、资料与账号隔离', async () => {
  await run(`CREATE TABLE IF NOT EXISTS user_avatars (user_id CHAR(36) NOT NULL PRIMARY KEY, image_data MEDIUMTEXT NOT NULL, updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), CONSTRAINT fk_avatar_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  const a=await register(nameFor('a'),identity());
  const b=await register(nameFor('b'),identity());
  assert.equal(a.status,201);assert.equal(b.status,201);
  const at=a.body.access_token,bt=b.body.access_token;
  const category=await api('POST','/api/v1/data/categories',{token:at,body:{name:'自测餐饮',icon:'🍜',type:'expense'}});
  assert.equal(category.status,201);
  const id=category.body.id;
  const bill=await api('POST','/api/v1/data/records',{token:at,body:{type:'expense',amount:12.34,date:'2026-11-20',categoryId:id,note:'测试午餐'}});
  assert.equal(bill.status,201);
  assert.equal((await api('PUT',`/api/v1/data/records/${bill.body.id}`,{token:bt,body:{type:'expense',amount:99,date:'2026-11-20',categoryId:id,note:''}})).status,400);
  assert.equal((await api('DELETE',`/api/v1/data/records/${bill.body.id}`,{token:bt})).status,404);
  const own=await api('GET','/api/v1/data/records?month=2026-11',{token:at});
  const other=await api('GET','/api/v1/data/records?month=2026-11',{token:bt});
  assert.equal(own.body.records.length,1);assert.equal(other.body.records.length,0);
  assert.equal(own.body.records[0].note,'测试午餐');
  assert.equal((await api('PUT',`/api/v1/data/records/${bill.body.id}`,{token:at,body:{type:'expense',amount:13.45,date:'2026-11-21',categoryId:id,note:'修改后'}})).status,200);
  assert.equal((await api('GET','/api/v1/data/export',{token:at})).body.records[0].note,'修改后');
  assert.equal((await api('PUT',`/api/v1/data/categories/${id}`,{token:at,body:{name:'午餐分类',icon:'🥗'}})).status,200);
  assert.equal((await api('GET','/api/v1/data/records?month=2026-11',{token:at})).body.records[0].category,'午餐分类');
  assert.equal((await api('PUT',`/api/v1/data/categories/${id}`,{token:at,body:{name:'自测餐饮',icon:'🍜'}})).status,200);
  const excelResponse=await fetch(baseUrl+'/api/v1/data/export-excel?month=2026-11',{headers:{authorization:`Bearer ${at}`}});
  assert.equal(excelResponse.status,200);
  const workbook=new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(await excelResponse.arrayBuffer()));
  assert.equal(workbook.getWorksheet('账单明细').getRow(2).getCell(3).value,'🍜 自测餐饮');
  assert.equal((await api('PUT','/api/v1/data/budgets',{token:at,body:{month:'2026-11',amount:100}})).status,200);
  assert.equal((await api('GET','/api/v1/data/budgets?month=2026-11',{token:bt})).body.total,null);
  const avatar='data:image/png;base64,aGVsbG8=';
  assert.equal((await api('PUT','/api/v1/data/profile',{token:at,body:{nickname:'新昵称',bio:'简介',avatar}})).status,200);
  assert.equal((await api('GET','/api/v1/data/profile',{token:at})).body.profile.avatar,avatar);
  assert.equal((await api('GET','/api/v1/data/profile',{token:bt})).body.profile.avatar,null);
  assert.equal((await api('GET','/api/v1/data/summary?month=2026-11',{token:at})).body.expense,13.45);
  const removedCategory=await api('DELETE',`/api/v1/data/categories/${id}`,{token:at});
  assert.equal(removedCategory.status,200);
  assert.equal(removedCategory.body.deleted,true);
  assert.equal((await api('GET','/api/v1/data/categories',{token:at})).body.categories.some((item)=>item.id===id),false);
  assert.equal((await api('GET','/api/v1/data/records?month=2026-11',{token:at})).body.records[0].category,'自测餐饮');
  const restoredCategory=await api('POST','/api/v1/data/categories',{token:at,body:{name:'自测餐饮',icon:'🍽️',type:'expense'}});
  assert.equal(restoredCategory.status,201);
  assert.notEqual(restoredCategory.body.id,id);
  assert.equal((await api('GET','/api/v1/data/analytics?month=2026-11',{token:bt})).body.rows.length,0);
  assert.equal((await api('PUT','/api/v1/data/password',{token:at,body:{oldPassword:'wrong',newPassword:'New-pass-123'}})).status,401);
  assert.equal((await api('PUT','/api/v1/data/password',{token:at,body:{oldPassword:PASSWORD,newPassword:'New-pass-123'}})).status,200);
  assert.equal((await login(nameFor('a'),identity(),PASSWORD)).status,401);
  const restored=await login(nameFor('a'),identity(),'New-pass-123');
  assert.equal(restored.status,200);
  assert.equal((await api('POST','/api/v1/data/account-deletion',{token:at,body:{username:'wrong',exportPrompted:true}})).status,400);
  assert.equal((await api('POST','/api/v1/data/account-deletion',{token:at,body:{username:nameFor('a'),exportPrompted:true}})).status,200);
  assert.equal((await api('GET','/api/v1/data/profile',{token:at})).status,401);
  const reactivated=await login(nameFor('a'),identity(),'New-pass-123');
  assert.equal(reactivated.status,200);
  assert.equal((await userRow(nameFor('a'))).status,'active');
  assert.equal((await api('DELETE',`/api/v1/data/records/${bill.body.id}`,{token:reactivated.body.access_token})).status,204);
  assert.equal((await api('GET','/api/v1/data/records?month=2026-11',{token:reactivated.body.access_token})).body.records.length,0);
  const newUsername=nameFor('c');
  assert.equal((await api('PUT','/api/v1/data/profile',{token:reactivated.body.access_token,body:{username:newUsername,nickname:'新昵称',bio:'简介',avatar}})).status,200);
  assert.equal((await api('GET','/api/v1/data/profile',{token:reactivated.body.access_token})).body.profile.username,newUsername);
});
