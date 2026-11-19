/* 表单校验（PRD ACC-02 表单与校验 / 5.5 状态表）。
   口径统一在服务端，前端校验只是省一次往返，不能作为约束来源。

   关于用户名正则，三份材料原本不一致：
     002网站开发/js/auth.js   /^[A-Za-z0-9_\u4e00-\u9fa5]{3,20}$/
     004前端开发/assets/js/app.js  /^[\p{L}\p{N}_]{3,20}$/u + 「不能纯符号」
   这里采用 004 的写法：\u4e00-\u9fa5 只覆盖 CJK 基本区，会把繁体扩展字和带音调的拉丁
   字母挡在门外；而 PRD「禁空格与纯符号」这条必须有「至少一个字母或数字」才拦得住 "___"。
   长度按码点算，不按 UTF-16 长度——生僻字与 emoji 是代理对，用 .length 会多数一位。 */

import { errors } from '../http/errors.js';
import { config } from '../config.js';

const NAME_RE = /^[\p{L}\p{N}_]+$/u;
const HAS_ALNUM = /[\p{L}\p{N}]/u;

/* PRD：大小写不敏感，提交前统一转小写。数据库列排序规则只是兜底，
   归一化必须在这里做一次，否则同一用户名会以两种形态落库。 */
export function normalizeUsername(raw) {
  return String(raw ?? '').trim().toLowerCase();
}

const codePointLength = (text) => Array.from(text).length;

export function validateUsername(raw) {
  if (typeof raw !== 'string') throw errors.missingField('用户名');
  const username = normalizeUsername(raw);
  const len = codePointLength(username);
  if (len < config.username.min || len > config.username.max) throw errors.invalidUsername();
  if (!NAME_RE.test(username)) throw errors.invalidUsername();
  if (!HAS_ALNUM.test(username)) throw errors.invalidUsername();
  return username;
}

/* 密码不做复杂度约束（PRD：长辈用户能用住比能猜到更重要），只卡 6–64 位。
   不做 trim：末尾空格可能是用户密码的一部分，静默改写会导致下次登录不上。 */
export function validatePassword(raw) {
  if (typeof raw !== 'string' || raw === '') throw errors.missingField('密码');
  const len = codePointLength(raw);
  if (len < config.passwordPolicy.min || len > config.passwordPolicy.max) throw errors.invalidPassword();
  return raw;
}
