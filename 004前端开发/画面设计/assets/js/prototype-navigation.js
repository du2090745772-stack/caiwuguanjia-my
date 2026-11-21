(() => {
  'use strict';

  const pages = [
    ['主流程', [['着陆页', 'landing.html'], ['首页流水', 'bills.html'], ['记一笔', 'record.html'], ['统计报表', 'stats.html'], ['预算管理', 'budget.html'], ['我的', 'profile.html'], ['登录', 'auth.html'], ['注册', 'register.html']]],
    ['页面状态', [['流水空态', 'bills-empty.html'], ['统计空态', 'stats-empty.html'], ['预算空态', 'budget-empty.html'], ['预算超支', 'budget-exceeded.html'], ['调整预算', 'budget-adjust.html'], ['我的 · 账号设置', 'profile-account.html'], ['退出登录确认', 'logout.html']]]
  ];
  const routes = { bills: 'bills.html', stats: 'stats.html', budget: 'budget.html', profile: 'profile.html', landing: 'landing.html' };
  const current = location.pathname.split('/').pop();
  const prefix = location.pathname.includes('/pages/') ? '' : 'pages/';
  const url = (file) => `${prefix}${file}`;

  document.querySelectorAll('a[data-path]').forEach((link) => {
    const target = routes[link.dataset.path];
    if (target) {
      link.href = url(target);
      link.removeAttribute('onclick');
      if (current !== target) link.removeAttribute('aria-current');
    }
  });

  // Convert primary actions on the generated screens into real page navigation.
  document.addEventListener('click', (event) => {
    const target = event.target.closest('a,button');
    if (!target || target.closest('.prototype-switcher')) return;
    if (target.matches('a[data-path]') && routes[target.dataset.path]) {
      event.preventDefault();
      event.stopImmediatePropagation();
      location.href = target.href;
      return;
    }
    const label = (target.textContent || '').replace(/\s+/g, '');
    const href = target.getAttribute('href');
    if (target.tagName === 'A' && href && window.PeachModal && !target.closest('.prototype-switcher')) {
      const linked = new URL(href, location.href);
      if (linked.origin === location.origin && linked.pathname.endsWith('/record.html') && current !== 'record.html') {
        event.preventDefault(); event.stopImmediatePropagation(); window.PeachModal.openRecord(); return;
      }
      if (linked.origin === location.origin && linked.pathname.endsWith('/budget-adjust.html') && current !== 'budget-adjust.html') {
        event.preventDefault(); event.stopImmediatePropagation(); window.PeachModal.openBudget(); return;
      }
    }
    let destination;
    if (target.matches('a[href="#login"]')) destination = 'auth.html?mode=login';
    else if (target.matches('a[href="#demo"]')) destination = 'bills.html';
    else if (target.matches('a[href="#"]') && /返回首页|返回主页/.test(label)) destination = 'bills.html';
    else if (target.matches('a[href="#"]') && /去登录/.test(label)) destination = 'auth.html?mode=login';
    else if (target.tagName === 'BUTTON' && /记一笔|记下本月第一笔|去首页记一笔/.test(label) && !/保存/.test(label)) destination = `record.html?return=${encodeURIComponent(current)}`;
    else if (target.tagName === 'BUTTON' && /调整总预算|设定本月总预算|调高本月预算/.test(label) && current !== 'budget-adjust.html') destination = `budget-adjust.html?return=${encodeURIComponent(current)}`;
    if (!destination) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (window.PeachModal && destination.startsWith('record.html') && current !== 'record.html') { window.PeachModal.openRecord(); return; }
    if (window.PeachModal && destination.startsWith('budget-adjust.html') && current !== 'budget-adjust.html') { window.PeachModal.openBudget(); return; }
    location.href = url(destination);
  }, true);

  const switcher = document.createElement('nav');
  switcher.className = 'prototype-switcher';
  switcher.setAttribute('aria-label', '原型页面导航');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'prototype-switcher__toggle';
  toggle.textContent = '页面导航';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'prototype-pages');
  const panel = document.createElement('div');
  panel.id = 'prototype-pages';
  panel.className = 'prototype-switcher__panel';
  panel.hidden = true;
  const heading = document.createElement('p');
  heading.className = 'prototype-switcher__heading';
  heading.textContent = '原型页面';
  panel.append(heading);
  for (const [groupName, groupPages] of pages) {
    const group = document.createElement('p');
    group.className = 'prototype-switcher__group';
    group.textContent = groupName;
    panel.append(group);
    const links = document.createElement('div');
    links.className = 'prototype-switcher__links';
    for (const [name, file] of groupPages) {
      const link = document.createElement('a');
      link.href = file === 'record.html' ? url(`record.html?return=${encodeURIComponent(current)}`) : url(file);
      link.textContent = name;
      if (file === current) link.setAttribute('aria-current', 'page');
      links.append(link);
    }
    panel.append(links);
  }
  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      toggle.focus();
    }
  });
  switcher.append(panel, toggle);
  document.body.append(switcher);

  if (!['landing.html', 'auth.html', 'register.html'].includes(current)) {
    const mobileNav = document.createElement('nav');
    mobileNav.className = 'prototype-mobile-nav';
    mobileNav.setAttribute('aria-label', '主导航');
    for (const [label, file, icon] of [
      ['流水', 'bills.html', '☷'], ['记一笔', 'record.html', '＋'],
      ['统计', 'stats.html', '◴'], ['预算', 'budget.html', '◫'], ['我的', 'profile.html', '♙']
    ]) {
      const link = document.createElement('a');
      link.href = file === 'record.html' ? url(`record.html?return=${encodeURIComponent(current)}`) : url(file);
      link.innerHTML = `<span aria-hidden="true">${icon}</span><span>${label}</span>`;
      if (file === current) link.setAttribute('aria-current', 'page');
      mobileNav.append(link);
    }
    document.body.append(mobileNav);
  }

  if (['profile.html', 'profile-account.html', 'logout.html'].includes(current)) {
    const main = document.querySelector('main');
    if (main) {
      const accountLinks = document.createElement('div');
      accountLinks.className = 'prototype-account-links';
      accountLinks.innerHTML = `<strong>账号与数据</strong><span>账号和资料保存在本机浏览器</span><a href="${url('register.html')}">立即注册</a><a href="${url('auth.html')}">登录</a><a href="${url('logout.html')}">退出登录确认</a>`;
      main.prepend(accountLinks);
    }
  }

})();
