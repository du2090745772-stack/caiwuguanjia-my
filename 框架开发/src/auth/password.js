/* 口令摘要（PRD 第七章数据安全4：argon2id 优先，服务端只存加盐摘要，不落明文）。
   盐由 argon2 内部随机生成并编码进摘要串，不需要单独存列；
   与 users.password_algo 列配合，将来换参数可以按前缀识别并渐进重哈希。 */

import { randomBytes } from 'node:crypto';
import { hash, verify, Algorithm, Version } from '@node-rs/argon2';
import { config } from '../config.js';

export const PASSWORD_ALGO = 'argon2id';

const OPTIONS = {
  algorithm: Algorithm.Argon2id,
  version: Version.V0x13,
  memoryCost: config.password.memoryCostKib,
  timeCost: config.password.timeCost,
  parallelism: config.password.parallelism,
  hashLength: config.password.hashLength
};

export function hashPassword(password) {
  return hash(password, OPTIONS);
}

/* verify 对格式非法的存量摘要会抛异常而不是返回 false，这里统一收敛成「校验不通过」 */
async function safeVerify(stored, password) {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

export const verifyPassword = safeVerify;

/* 用户名不存在时也要烧掉一次 argon2 的时间。
   省掉这一步，「账号不存在」的响应会比「密码错」快一个数量级，
   响应时间本身就成了账号枚举通道——PRD 统一文案的意图会被绕过。
   占位摘要在进程启动时用随机串生成，猜不到也验不出任何东西。 */
const DUMMY_HASH = await hash(randomBytes(32).toString('base64url'), OPTIONS);

export function verifyDummyPassword(password) {
  return safeVerify(DUMMY_HASH, password);
}
