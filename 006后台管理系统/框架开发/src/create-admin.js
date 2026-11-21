import { createInterface, emitKeypressEvents } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { hash, Algorithm } from '@node-rs/argon2';
import { one, run, closePool } from './db.js';
const rl = createInterface({ input: stdin, output: stdout });
const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));
async function secret(prompt) {
  if (!stdin.isTTY) throw new Error('请在交互式终端创建管理员');
  rl.close();
  stdout.write(prompt);
  emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  let value = '';
  try {
    return await new Promise((resolve, reject) => {
      const onKey = (character, key) => {
        if (key?.name === 'return' || key?.name === 'enter') { stdin.off('keypress', onKey); stdout.write('\n'); resolve(value); }
        else if (key?.sequence === '\u0003') { stdin.off('keypress', onKey); reject(new Error('已取消')); }
        else if (key?.name === 'backspace' || key?.name === 'delete') value = value.slice(0, -1);
        else if (character && !key?.ctrl && !key?.meta) value += character;
      };
      stdin.on('keypress', onKey);
    });
  } finally { stdin.setRawMode(false); stdin.pause(); }
}
try {
  const username = (await question('管理员用户名（3–20 位）：')).trim().toLowerCase();
  const password = await secret('管理员密码（至少 12 位，输入时不显示）：');
  if (!/^[\p{L}\p{N}_]{3,20}$/u.test(username) || !/[\p{L}\p{N}]/u.test(username)) throw new Error('用户名格式不正确');
  if (password.length < 12) throw new Error('密码至少 12 位');
  if (await one('SELECT id FROM admin_accounts WHERE username=?', [username])) throw new Error('管理员用户名已存在');
  const digest = await hash(password, { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  await run("INSERT INTO admin_accounts (username,password_hash,password_algo,role,status) VALUES (?,?,'argon2id','admin','active')", [username, digest]);
  console.log(`管理员 ${username} 已创建。`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { rl.close(); await closePool(); }
