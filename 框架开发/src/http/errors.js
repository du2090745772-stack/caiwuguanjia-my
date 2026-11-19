/* 统一错误响应。
   对外文案严格照 PRD 5.5 页面状态表，不改字、不加码——前端要按这些文案做状态机；
   对内保留 internalReason，供日志与 EV-12 埋点区分「密码错」还是「账号不存在」，
   但这个区分绝不能出现在响应体里（ACC-02 规则2：不给账号枚举留口）。 */

export class ApiError extends Error {
  constructor(status, code, message, internalReason) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.internalReason = internalReason ?? code;
  }
}

export const errors = {
  invalidUsername: () =>
    new ApiError(400, 'invalid_username', '用户名要 3–20 位，不能有空格'),
  invalidPassword: () =>
    new ApiError(400, 'invalid_password', '密码至少 6 位'),
  missingField: (field) =>
    new ApiError(400, 'missing_field', `${field}不能为空`),
  /* 第七章隐私合规5：《隐私政策》须由用户主动勾选。服务端不拦就等于这条只在 UI 上好看。 */
  privacyRequired: () =>
    new ApiError(400, 'privacy_policy_required', '请先阅读并勾选《隐私政策》'),
  /* 注册如实提示重名（ACC-02 规则3），枚举面由注册频控承担 */
  nameTaken: () =>
    new ApiError(409, 'name_taken', '这个用户名已经有了，换一个或直接登录'),
  /* 用户名不存在与密码错误共用这一条，服务端不再细分（ACC-02 规则2） */
  badCredentials: (reason) =>
    new ApiError(401, 'bad_credentials', '账号或密码不对，再检查一下', reason),
  /* PRD 未给锁定文案，前端按 code 兜底展示剩余秒数 */
  locked: (retryAfterSec, reason) => {
    const err = new ApiError(429, 'account_locked', '尝试次数太多，请稍后再试', reason);
    err.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSec));
    return err;
  },
  rateLimited: (retryAfterSec, reason) => {
    const err = new ApiError(429, 'rate_limited', '操作太频繁，请稍后再试', reason);
    err.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSec));
    return err;
  },
  signedOut: (reason) =>
    new ApiError(401, 'signed_out', '登录已过期，请重新登录', reason),
  invalidBody: () =>
    new ApiError(400, 'invalid_body', '请求格式不正确')
};

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'not_found', message: '接口不存在' } });
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: { code: 'invalid_body', message: '请求格式不正确' } });
  }

  const status = err instanceof ApiError ? err.status : 500;
  const code = err instanceof ApiError ? err.code : 'internal_error';
  const message = err instanceof ApiError ? err.message : '服务开小差了，请稍后再试';

  if (status >= 500) {
    console.error(`[auth] ${req.method} ${req.originalUrl} → ${status} ${code}`, err);
  } else {
    /* 4xx 只记一行摘要，不带请求体：请求体里有用户名与密码（第七章数据安全5：不落明文） */
    console.info(`[auth] ${req.method} ${req.originalUrl} → ${status} ${err.internalReason ?? code}`);
  }

  const body = { error: { code, message } };
  if (err.retryAfterSeconds) {
    body.error.retry_after_seconds = err.retryAfterSeconds;
    res.set('Retry-After', String(err.retryAfterSeconds));
  }
  res.status(status).json(body);
}
