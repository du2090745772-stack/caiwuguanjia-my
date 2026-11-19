/* 账号服务客户端：前端唯一碰 /api/v1/auth/* 的地方（PRD ACC-02 架构要求1）。
   页面只管表单和文案，device_id、Token 落地、到期静默续期、错误口径都收在这里，
   否则登录页、注册页、退出页会各写一套 fetch，改接口要翻三个文件。 */
(() => {
  'use strict';

  /* 双击 HTML 打开的是 file:// 页面，浏览器一律不允许它请求 http://127.0.0.1:3000，
     注册必然连不上——这是同源策略，改前端代码绕不过去。所以直接把同一个页面
     换成 http 地址重开，让人不用记命令。服务没起时会停在「拒绝连接」，
     那时双击 004前端开发/框架开发/双击启动.command 即可。 */
  if (location.protocol === 'file:') {
    const path = decodeURIComponent(location.pathname);
    const cut = path.indexOf('/画面设计/');
    const rel = cut === -1 ? '/' : path.slice(cut + '/画面设计'.length);
    location.replace(`http://127.0.0.1:3000${encodeURI(rel)}`);
    return;
  }

  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(`pj.${key}`)) ?? fallback; } catch { return fallback; }
  };
  const write = (key, value) => localStorage.setItem(`pj.${key}`, JSON.stringify(value));
  const drop = (key) => localStorage.removeItem(`pj.${key}`);

  /* 页面现在默认由账号服务自己同源托管（004前端开发/框架开发 npm start → http://127.0.0.1:3000/），
     这时接口就在本页 origin 下，后端换端口也不用改代码；
     还从 README 里的 python3 -m http.server 8080 打开时，退回同主机 :3000。
     需要指别处时用 pj.api_base 覆盖。 */
  const API_BASE = read('api_base', defaultBase());

  function defaultBase() {
    if (location.port === '8080') return `${location.protocol}//${location.hostname}:3000/api/v1`;
    if (/^https?:$/.test(location.protocol)) return `${location.origin}/api/v1`;
    return `http://${location.hostname || '127.0.0.1'}:3000/api/v1`;
  }

  function unreachableHelp() {
    if (location.protocol === 'file:') {
      /* 浏览器把 file:// 当独立来源，页面再怎么改也发不出这个请求，只能换成 http 打开 */
      return '你现在是双击 HTML 打开的（file://），浏览器不允许这种页面访问账号服务。'
        + '请双击 004前端开发/框架开发/双击启动.command（或在里面执行 npm start），它会自动打开 http://127.0.0.1:3000/pages/auth.html。';
    }
    return `连不上账号服务（${API_BASE}）。`
      + (location.port === '8080'
        ? `页面从 ${location.origin} 打开，属跨域：先确认后端已 npm start，`
          + '并把这个来源加进 004前端开发/框架开发/.env 的 CORS_ORIGINS 后重启。'
        : '页面本身就是这个服务端上来的，说明进程已经退出，请重新双击 双击启动.command 或在 004前端开发/框架开发 执行 npm start。');
  }

  class ApiFailure extends Error {
    constructor(message, { code = 'unknown', status = 0, retryAfterSeconds = 0 }) {
      super(message);
      this.name = 'ApiFailure';
      this.code = code;
      this.status = status;
      this.retryAfterSeconds = retryAfterSeconds;
    }
  }

  /* 服务端按 X-Device-Id 做注册频控与登录锁定（ACC-02 规则3），
     浏览器没有稳定的机器标识，本机生成一次后长期复用。 */
  function deviceId() {
    let id = read('device_id', '');
    if (!id) {
      id = (crypto.randomUUID?.() || `d${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).slice(0, 64);
      write('device_id', id);
    }
    return id;
  }

  async function request(path, { method = 'POST', body, token } = {}) {
    const headers = { 'x-device-id': deviceId() };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers.authorization = `Bearer ${token}`;

    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch {
      /* 跨域被拦、后端没起、断网，fetch 一律抛 TypeError，状态码是 0，浏览器不给原因，
         所以按打开方式把最可能的两种坑分别说清楚，而不是笼统让人去猜端口 */
      throw new ApiFailure(unreachableHelp(), { code: 'network_unreachable' });
    }

    if (response.status === 204) return null;
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = data?.error ?? {};
      throw new ApiFailure(error.message || '服务开小差了，请稍后再试', {
        code: error.code || 'unknown',
        status: response.status,
        retryAfterSeconds: Number(error.retry_after_seconds) || 0
      });
    }
    return data;
  }

  const session = () => read('auth', null);
  const isSignedIn = () => Boolean(session()?.access_token);

  /* 只在本机留 Token 与用户名：账单仍走原有 pj.records，登录不改动任何本机数据
     （ACC-02 数据迁移规则3：迁移完成前不删本机数据）。 */
  function saveSession(payload, username) {
    write('auth', {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      access_expires_at: Date.now() + Number(payload.expires_in || 7200) * 1000,
      username
    });
  }

  async function authenticate(path, username, password, extra) {
    const data = await request(path, { body: { username, password, ...extra } });
    saveSession(data, data.user.username);
    return data;
  }

  const register = (username, password) =>
    authenticate('/auth/register', username, password, { privacy_accepted: true });
  const login = (username, password) => authenticate('/auth/login', username, password);

  /* 滚动续期（PRD 登录态策略：Token 失效不打断当前操作） */
  async function refresh() {
    const current = session();
    if (!current?.refresh_token) throw new ApiFailure('登录已过期，请重新登录', { code: 'signed_out', status: 401 });
    const data = await request('/auth/refresh', { body: { refresh_token: current.refresh_token } });
    saveSession(data, current.username);
    return data;
  }

  /* Access Token 只有 2 小时，挂机后退出可能带着过期凭据来：
     先续一次再吊销，避免「点了退出、服务端会话其实还活着」。 */
  async function logout() {
    let current = session();
    if (!current?.access_token) { drop('auth'); return; }
    try {
      if (current.access_expires_at - Date.now() < 60_000) {
        await refresh();
        current = session();
      }
      await request('/auth/session', { method: 'DELETE', token: current.access_token });
    } finally {
      /* 服务端吊销失败也要清本机：留着半截 Token 只会让下次进来以为已登录 */
      drop('auth');
    }
  }

  window.AuthApi = { API_BASE, register, login, refresh, logout, session, isSignedIn, ApiFailure };
})();
