import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { hash, Algorithm } from '@node-rs/argon2';
import ExcelJS from 'exceljs';
import { createApp } from '../src/server.js';
import { one, run, closePool } from '../src/db.js';

const username = `adm${randomBytes(4).toString('hex')}`;
const password = randomBytes(18).toString('base64url');
let server, base, cookie;
async function get(path, options={}) { return fetch(`${base}${path}`, { headers:cookie?{Cookie:cookie}:undefined, ...options }); }
before(async () => {
  const digest=await hash(password,{algorithm:Algorithm.Argon2id,memoryCost:19456,timeCost:2,parallelism:1});
  await run("INSERT INTO admin_accounts (username,password_hash,password_algo,role,status) VALUES (?,?,'argon2id','admin','active')",[username,digest]);
  server=createApp().listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));await run('DELETE FROM admin_accounts WHERE username=?',[username]);await closePool();});
test('后台接口仅管理员可读，登录与退出生效',async()=>{
  const unauth=await fetch(`${base}/api/admin/overview`);assert.equal(unauth.status,401);
  const regular=await fetch(`${base}/api/admin/overview`,{headers:{Authorization:'Bearer ordinary-user-token'}});assert.equal(regular.status,403);
  const bad=await fetch(`${base}/api/admin/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:'wrong-password'})});assert.equal(bad.status,401);
  const login=await fetch(`${base}/api/admin/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});assert.equal(login.status,200);
  cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await get('/api/admin/session')).status,200);
  for(const route of ['/api/admin/overview','/api/admin/users','/api/admin/records','/api/admin/analytics','/api/admin/budgets','/api/admin/categories','/api/admin/system']){
    const response=await get(route);assert.equal(response.status,200,route);await response.json();
  }
  const users=await (await get('/api/admin/users')).json();assert.equal(Array.isArray(users.rows),true);assert.equal(JSON.stringify(users).includes('password_hash'),false);
  if(users.rows.length){const detail=await get(`/api/admin/users/${users.rows[0].id}`);assert.equal(detail.status,200);assert.equal(JSON.stringify(await detail.json()).includes('password_hash'),false);}
  const records=await (await get('/api/admin/records')).json();
  if(records.rows.length){const detail=await get(`/api/admin/records/${records.rows[0].id}`);assert.equal(detail.status,200);}
  const xlsx=await get('/api/admin/export/summary');assert.equal(xlsx.status,200);const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await xlsx.arrayBuffer()));assert.ok(book.getWorksheet('收支汇总'));
  const origin=await get('/api/admin/logout',{method:'POST',headers:{Cookie:cookie,Origin:'https://attacker.example','Content-Type':'application/json'},body:'{}'});assert.equal(origin.status,403);
  const logout=await get('/api/admin/logout',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:'{}'});assert.equal(logout.status,200);
  assert.equal((await get('/api/admin/overview')).status,401);
});
