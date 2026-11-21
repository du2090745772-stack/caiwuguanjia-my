(() => {
  'use strict';
  const input = document.querySelector('header input[placeholder*="搜索"]');
  if (!input) return;
  const pages = [
    ['首页流水', 'bills.html', '账单、流水、支出、收入、记一笔'],
    ['统计报表', 'stats.html', '统计、报表、支出分类占比、账单明细、趋势、导出'],
    ['预算管理', 'budget.html', '预算、分类预算明细、调整总预算、日可支配'],
    ['个人主页', 'profile.html', '个人、资料、头像、简介、账户、安全'],
  ];
  const box = document.createElement('div'); box.className = 'peach-search-results'; box.hidden = true;
  input.parentElement.append(box);
  let records = [];
  if (window.AuthApi?.isSignedIn()) window.AuthApi.data('/export').then((data) => { records = data.records || []; }).catch(() => {});
  const open = (title, url, hint, period) => {
    const button = document.createElement('button'); button.type = 'button';
    const strong = document.createElement('strong'); strong.textContent = title;
    const small = document.createElement('small'); small.textContent = hint;
    button.append(strong, small);
    button.onclick = () => {
      if (period) localStorage.setItem('pj.period', JSON.stringify(period));
      location.href = `${url}?search=${encodeURIComponent(input.value.trim())}`;
    };
    box.append(button);
  };
  const draw = () => {
    const term = input.value.trim().toLocaleLowerCase(); box.replaceChildren();
    if (!term) { box.hidden = true; return; }
    for (const [title, url, words] of pages) if (`${title} ${words}`.toLocaleLowerCase().includes(term)) open(title, url, `前往${title}`);
    for (const record of records.filter((item) => `${item.category} ${item.note} ${item.amount} ${item.date}`.toLocaleLowerCase().includes(term)).slice(0, 6)) {
      open(`${record.icon} ${record.category} · ¥${record.amount}`, 'bills.html', `${record.date} · ${record.note || '账单'}`, record.date.slice(0, 7));
    }
    if (!box.children.length) { const empty = document.createElement('p'); empty.textContent = '没有找到相关页面或账单'; box.append(empty); }
    box.hidden = false;
  };
  input.addEventListener('input', draw);
  input.addEventListener('focus', draw);
  document.addEventListener('click', (event) => { if (!input.parentElement.contains(event.target)) box.hidden = true; });
  const term = new URLSearchParams(location.search).get('search');
  if (term) {
    const walker = document.createTreeWalker(document.querySelector('main') || document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) if (node.textContent.toLocaleLowerCase().includes(term.toLocaleLowerCase()) && node.parentElement?.offsetParent !== null) {
      requestAnimationFrame(() => node.parentElement.scrollIntoView({ block: 'center', behavior: 'smooth' })); break;
    }
  }
})();
