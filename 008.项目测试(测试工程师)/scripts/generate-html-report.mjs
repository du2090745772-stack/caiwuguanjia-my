import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, '测试报告');
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const groups = [
  ['网页版画面设计（桌面与手机比例）', '网页-junit.xml'],
  ['账号与账本后端（隔离 MySQL）', 'backend-integration-junit.xml'],
  ['后端健康检查', 'backend-junit.xml'],
  ['uni-app 本地数据模式', 'uni-junit.xml'],
];
let total = 0, failed = 0;
const sections = groups.map(([title, file]) => {
  const xml = readFileSync(resolve(dir, file), 'utf8');
  const cases = [...xml.matchAll(/<testcase\b([^>]*)>([\s\S]*?)<\/testcase>|<testcase\b([^>]*)\/>/g)].map((m) => {
    const attrs = m[1] || m[3];
    const name = attrs.match(/\bname="([^"]*)"/)?.[1] || '未命名';
    const error = m[2]?.match(/<(?:failure|error)\b[^>]*>([\s\S]*?)<\/(?:failure|error)>/)?.[1];
    return { name, error };
  });
  total += cases.length;
  failed += cases.filter((c) => c.error).length;
  return `<section><h2>${escape(title)} <small>${cases.length - cases.filter((c) => c.error).length}/${cases.length} 通过</small></h2><ol>${cases.map((c) => `<li class="${c.error ? 'fail' : 'pass'}"><span>${c.error ? '失败' : '通过'}</span> ${escape(c.name)}${c.error ? `<pre>${escape(c.error)}</pre>` : ''}</li>`).join('')}</ol></section>`;
});
const build = JSON.parse(readFileSync(resolve(dir, 'uni-build.json'), 'utf8'));
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>每日记账本核心业务测试报告</title><style>body{font:16px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;max-width:980px;margin:auto;padding:32px;color:#33242a;background:#fff9fa}h1{color:#923b57}section{background:#fff;border:1px solid #f1dce3;border-radius:16px;padding:20px 26px;margin:22px 0}h2{margin:0 0 12px}small{font-size:14px;color:#666}li{padding:7px 0}li span{display:inline-block;min-width:44px;font-weight:bold}.pass span{color:#147852}.fail span{color:#c52b43}pre{white-space:pre-wrap;background:#fff0f2;padding:12px;overflow:auto}.summary{font-size:22px;font-weight:bold}.note{color:#6b5960}a{color:#923b57}</style></head><body><h1>每日记账本核心业务测试报告</h1><p>执行时间：${escape(new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}))} · 测试环境：本机隔离数据库 daily_ledger_test</p><p class="summary">${total - failed}/${total} 用例通过，${failed} 失败</p><p>优先覆盖注册登录、免登录记账、分类与账单增删改查、预算、统计、资料、会话安全及账号隔离。所有自动化用例都包含实际结果断言。</p>${sections.join('')}<section><h2>uni-app 构建</h2><ul>${build.results.map((r) => `<li class="${r.passed ? 'pass' : 'fail'}"><span>${r.passed ? '通过' : '失败'}</span> ${escape(r.target)}</li>`).join('')}</ul></section><section><h2>验证范围与待测项</h2><p>网页版已在 Chromium 桌面及手机比例运行。uni-app 已验证本地数据服务并完成微信小程序、App、H5 构建；当前环境没有 iOS 真机、Android 真机及微信开发者工具自动化会话，因此原生界面、设备权限、键盘与网络切换尚未做设备级验证。正式域名尚未部署，跨设备账号同步也需部署后验证。</p><p>网页用例失败时 Playwright 自动保存截图和操作轨迹于 <code>网页-artifacts</code>；详情见 <a href="网页-html/index.html">网页详细报告</a>。后端和本地服务无可截图界面，失败时在本报告中保留测试名称、断言和错误堆栈，按用例名称即可复现。</p></section></body></html>`;
writeFileSync(resolve(dir, '核心业务测试报告.html'), html);
console.log(`HTML 报告已生成：${total - failed}/${total} 通过，${failed} 失败`);
