/* PRD V1.0.1 ACC-02/ACC-04 的演示实现：用户名 + 密码，没有后端，账号与「云端」快照都只写在本机。
   纯逻辑 + 可注入时钟/存储，Node 侧可直接跑单测；接口形状对齐 /api/v1/auth/register 与 /auth/login，
   换真后端时只替换本文件。
   注意：hashPassword 只是演示用的非加密摘要，目的是不在本机留下明文密码；真实实现的校验与
   argon2/bcrypt 摘要都在服务端，前端永远拿不到密码摘要。 */
(function (global) {
  'use strict';

  const NAME_MIN = 3;
  const NAME_MAX = 20;
  const PASS_MIN = 6;
  const PASS_MAX = 64;
  const ACCESS_TTL = 2 * 60 * 60 * 1000;
  const REFRESH_TTL = 30 * 24 * 60 * 60 * 1000;
  const GRACE_MS = 7 * 24 * 60 * 60 * 1000;

  // 3–20 位，字母／数字／下划线／中文，天然排除空格与纯符号
  const NAME_RE = /^[A-Za-z0-9_\u4e00-\u9fa5]{3,20}$/;

  let clock = () => Date.now();
  let save = () => {};
  let st = blank();

  function blank() {
    return {
      account: null,
      creds: {},
      snapshot: null
    };
  }

  function commit() {
    save(JSON.parse(JSON.stringify(st)));
    return st;
  }

  function hydrate(next) {
    const src = Object.assign(blank(), next || {});
    st = { account: src.account || null, creds: src.creds || {}, snapshot: src.snapshot || null };
    return st;
  }

  // 用户名大小写不敏感，登录与注册都按同一口径归一
  const normalizeName = (name) => String(name || '').trim().toLowerCase();

  function validName(name) {
    return NAME_RE.test(normalizeName(name));
  }

  function validPass(pass) {
    const p = String(pass || '');
    return p.length >= PASS_MIN && p.length <= PASS_MAX;
  }

  /* FNV-1a 双轮混合：只为避免本机出现明文密码，不构成密码学安全保证。 */
  function hashPassword(pass) {
    const text = 'daily-ledger-demo:' + String(pass);
    let h1 = 0x811c9dc5;
    let h2 = 0x1000193;
    for (let i = 0; i < text.length; i += 1) {
      const c = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 + c + i, 0x85ebca6b) >>> 0;
    }
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  }

  function signIn(id, isNew) {
    const now = clock();
    const existing = st.snapshot && st.snapshot.name === id ? st.snapshot : null;
    if (!existing) st.snapshot = null;
    st.account = {
      name: id,
      created_at: now,
      signed_in_at: now,
      access_expires_at: now + ACCESS_TTL,
      refresh_expires_at: now + REFRESH_TTL
    };
    // 冷静期内用同一个用户名再次进入 → 撤销注销
    let revoked = false;
    if (existing && existing.deactivated_until) {
      existing.deactivated_until = 0;
      revoked = true;
    }
    commit();
    return {
      ok: true,
      is_new_account: isNew,
      revoked_deactivation: revoked,
      cloud: existing ? { count: existing.count, at: existing.at } : { count: 0, at: 0 },
      account: { name: id }
    };
  }

  /* ---------------- 注册：建号并直接进入登录态（PRD 流程四「注册即建号」） ---------------- */
  function register(name, pass) {
    const id = normalizeName(name);
    if (!validName(id)) return { ok: false, reason: 'bad_name' };
    if (!validPass(pass)) return { ok: false, reason: 'bad_pass' };
    // 注册接口如实暴露重名，否则用户无法理解失败原因；登录接口不会（见 bad_credentials）
    if (st.creds[id]) return { ok: false, reason: 'name_taken' };
    st.creds[id] = hashPassword(pass);
    return signIn(id, true);
  }

  /* ---------------- 登录：只校验凭据，不建号 ---------------- */
  function login(name, pass) {
    const id = normalizeName(name);
    if (!validName(id)) return { ok: false, reason: 'bad_name' };
    if (!validPass(pass)) return { ok: false, reason: 'bad_pass' };
    if (st.creds[id] !== hashPassword(pass)) return { ok: false, reason: 'bad_credentials' };
    return signIn(id, false);
  }

  function logout() {
    st.account = null;
    commit();
    return { ok: true };
  }

  // 演示环境没有找回密码的通道：只能把这台设备上的账号清掉，重新注册一个
  function forgetAccount(name) {
    const id = normalizeName(name);
    if (!st.creds[id]) return { ok: false, reason: 'no_account' };
    delete st.creds[id];
    if (st.account && st.account.name === id) st.account = null;
    commit();
    return { ok: true, name: id };
  }

  const hasAccount = (name) => Boolean(st.creds[normalizeName(name)]);
  const name = () => (st.account ? st.account.name : null);

  /* ---------------- 会话 ---------------- */
  function session() {
    const now = clock();
    if (!st.account) return { status: 'none' };
    if (st.account.refresh_expires_at <= now) {
      st.account = null;
      commit();
      return { status: 'none' };
    }
    if (st.account.access_expires_at <= now) return { status: 'needs_refresh', account: st.account };
    return { status: 'active', account: st.account };
  }

  function refresh() {
    const now = clock();
    if (!st.account || st.account.refresh_expires_at <= now) return { ok: false, reason: 'signed_out' };
    st.account.access_expires_at = now + ACCESS_TTL;
    commit();
    return { ok: true, access_expires_at: st.account.access_expires_at };
  }

  /* ---------------- 备份快照（演示中的「云端」）与待上传计数 ---------------- */
  function backup(records) {
    const now = clock();
    if (!st.account) return { ok: false, reason: 'signed_out' };
    const list = records || [];
    st.snapshot = {
      name: st.account.name,
      at: now,
      count: list.length,
      first_date: list.length ? list[list.length - 1].date : null,
      last_date: list.length ? list[0].date : null,
      deactivated_until: 0
    };
    commit();
    return { ok: true, count: list.length, at: now };
  }

  // 本机相对上次快照的新增/变更笔数 + 已被删除的差额，无需保存全量 id
  function pendingCount(records) {
    const list = records || [];
    if (!st.snapshot || st.snapshot.name !== name()) return list.length ? list.length : 0;
    const changed = list.filter((r) => (Date.parse(r.updated_at) || 0) > st.snapshot.at).length;
    const removed = Math.max(0, st.snapshot.count - list.length);
    return changed + removed;
  }

  function cloudSummary() {
    if (!st.snapshot) return { count: 0, at: 0, deactivated_until: 0 };
    return {
      name: st.snapshot.name,
      count: st.snapshot.count,
      at: st.snapshot.at,
      deactivated_until: st.snapshot.deactivated_until || 0
    };
  }

  /* 数据迁移：去重键 id，同键取 updated_at 新者；合并只算纯逻辑，不碰本机数据 */
  function merge(localRecords, cloudRecords, strategy) {
    const local = localRecords || [];
    const cloud = cloudRecords || [];
    if (strategy === 'local_only') return { kept: local.slice(), added: 0, superseded: 0 };
    const byId = new Map();
    local.forEach((r) => byId.set(r.id, r));
    let added = 0;
    let superseded = 0;
    cloud.forEach((r) => {
      const mine = byId.get(r.id);
      if (!mine) { byId.set(r.id, r); added += 1; return; }
      if (Date.parse(r.updated_at) > Date.parse(mine.updated_at)) { byId.set(r.id, r); superseded += 1; }
    });
    return { kept: Array.from(byId.values()), added, superseded };
  }

  /* ---------------- 注销：7 天冷静期，可撤销；到期后清空快照 ---------------- */
  function deactivate(confirmName) {
    if (!st.account) return { ok: false, reason: 'signed_out' };
    if (normalizeName(confirmName) !== st.account.name) return { ok: false, reason: 'name_mismatch' };
    st.snapshot = st.snapshot
      ? Object.assign({}, st.snapshot, { deactivated_until: clock() + GRACE_MS })
      : { name: st.account.name, at: 0, count: 0, deactivated_until: clock() + GRACE_MS };
    st.account = null;
    commit();
    return { ok: true, grace_until: st.snapshot.deactivated_until };
  }

  function purgeExpired() {
    if (st.snapshot && st.snapshot.deactivated_until && st.snapshot.deactivated_until <= clock()) {
      st.snapshot = null;
      commit();
      return true;
    }
    return false;
  }

  function wipeAll() {
    st = blank();
    commit();
  }

  const api = {
    demo: true,
    configure(opts) {
      const o = opts || {};
      if (o.now) clock = o.now;
      if (o.save) save = o.save;
      if (o.load) hydrate(o.load() || {});
      return this;
    },
    state: () => st,
    validName,
    validPass,
    normalizeName,
    hashPassword,
    hasAccount,
    register,
    login,
    forgetAccount,
    logout,
    session,
    refresh,
    name,
    backup,
    pendingCount,
    cloudSummary,
    merge,
    deactivate,
    purgeExpired,
    wipeAll,
    LIMITS: { NAME_MIN, NAME_MAX, PASS_MIN, PASS_MAX, ACCESS_TTL, REFRESH_TTL, GRACE_MS }
  };

  global.Auth = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
