// 安装包和调试版默认连接服务器上的 004 账号服务。
// 配置 VITE_API_BASE_URL 时优先使用该地址。
const defaultApi = 'http://121.4.120.161:88/api/v1';

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  defaultApi
).replace(/\/$/, '');
