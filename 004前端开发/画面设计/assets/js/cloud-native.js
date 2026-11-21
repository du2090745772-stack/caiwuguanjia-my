(() => {
  'use strict';
  const api = window.AuthApi;
  if (!api?.isSignedIn()) return;
  const page = location.pathname.split('/').pop();
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const req = (path, method = 'GET', body) => api.data(path, { method, body });
  const money = (n) => `¥${Number(n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const today = () => new Date().toLocaleDateString('sv-SE');
  const month = (() => { try { return JSON.parse(localStorage.getItem('pj.period')) || today().slice(0, 7); } catch { return today().slice(0, 7); } })();
  const leaf = (text, root = document) => $$('*', root).find((n) => !n.children.length && n.textContent.trim() === text);
  const showError = (err) => {
    let node = $('#cloud-error');
    if (!node) { node = document.createElement('p'); node.id = 'cloud-error'; node.setAttribute('role', 'alert'); $('main')?.prepend(node); }
    node.textContent = err.message || String(err);
  };
  const safe = (action) => Promise.resolve().then(action).catch(showError);
  const status = (message) => { let node = $('#cloud-status'); if (!node) { node = document.createElement('p'); node.id = 'cloud-status'; $('main')?.prepend(node); } node.textContent = message; };
  const closeTo = (name) => { location.href = name; };
  const cardMetric = (label, value) => {
    const labelNode = leaf(label);
    const card = labelNode?.closest('.rounded-2xl');
    const target = card?.querySelector('.font-numeric-hero, .font-display-lg, .font-headline-lg');
    if (target) target.textContent = value;
  };
  const row = (entry) => {
    const el = document.createElement('div');
    el.className = 'cloud-native-row';
    const left = document.createElement('span');
    left.textContent = `${entry.icon || '📌'} ${entry.category || '未分类'} · ${entry.date}${entry.note ? ` · ${entry.note}` : ''}`;
    const right = document.createElement('strong');
    right.textContent = `${entry.type === 'expense' ? '-' : '+'}${money(entry.amount)}`;
    el.append(left, right);
    return el;
  };
  const section = (title, entries, near) => {
    const anchor = near || $('main');
    const panel = document.createElement('section');
    panel.className = 'cloud-native-section';
    const heading = document.createElement('h2'); heading.textContent = title; panel.append(heading);
    if (!entries.length) { const empty = document.createElement('p'); empty.textContent = '当前月份暂无账单'; panel.append(empty); }
    entries.forEach((entry) => panel.append(row(entry)));
    anchor?.prepend(panel);
    return panel;
  };
  async function syncProfile() {
    const { profile } = await req('/profile');
    const name = profile.nickname || '翔翔';
    const accountNote = $('.prototype-account-links span');
    if (accountNote) accountNote.textContent = `已登录 @${profile.username} · 数据已保存至数据库`;
    const head = page.startsWith('profile') || page === 'logout.html' ? $('main h2') : null;
    if (head) head.textContent = name;
    const username = head?.parentElement?.querySelector('.font-mono');
    if (username) username.textContent = `@${profile.username}`;
    const bio = head?.parentElement?.parentElement?.querySelector('p');
    if (bio) bio.textContent = profile.bio || '认真记录每一笔生活。';
    if ($('#sidebar-user-name')) $('#sidebar-user-name').textContent = name;
    const sharedText = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let sharedNode;
    while ((sharedNode = sharedText.nextNode())) sharedNode.textContent = sharedNode.textContent
      .replace('连续记录 42 天', `累计记账 ${profile.activeDays} 天`)
      .replace('暖心记账第 42 天', `累计记账 ${profile.activeDays} 天`)
      .replace('连续记账128天', `累计记账${profile.activeDays}天`)
      .replace('数据存本机 · 安全无忧', '数据已同步到数据库')
      .replace('未登录 · 点此上云备份', `已登录 @${profile.username}`);
    $$('aside .w-9.h-9, header .w-8.h-8').forEach((avatar) => {
      avatar.textContent = '';
      if (profile.avatar) { const img = document.createElement('img'); img.src = profile.avatar; img.alt = '个人头像'; img.className = 'app-avatar'; avatar.append(img); }
      else avatar.textContent = '翔';
    });
    const profileImage = head?.closest('.flex.items-start')?.querySelector('img');
    if (profileImage && profile.avatar) profileImage.src = profile.avatar;
    else if (profileImage) { const fallback = document.createElement('div'); fallback.className = 'cloud-native-avatar'; fallback.textContent = '翔'; profileImage.replaceWith(fallback); }
    if (head) {
      const all = (await req('/export')).records;
      const dates = new Set(all.map((r) => r.date));
      const cursor = new Date(); let streak = 0;
      if (!dates.has(today())) cursor.setDate(cursor.getDate() - 1);
      while (dates.has(cursor.toLocaleDateString('sv-SE'))) { streak++; cursor.setDate(cursor.getDate() - 1); }
      const savings = all.reduce((sum, r) => sum + (r.type === 'income' ? r.amount : -r.amount), 0);
      const streakCard = leaf('累计打卡坚持')?.closest('.rounded-3xl');
      const detailCard = leaf('手账明细条目')?.closest('.rounded-3xl');
      const streakNumber = streakCard?.querySelector('.font-numeric-hero');
      const detailNumber = detailCard?.querySelector('.font-numeric-hero');
      if (streakNumber) streakNumber.textContent = String(streak);
      if (detailNumber) detailNumber.textContent = String(all.length);
      const target = document.createTreeWalker($('main'), NodeFilter.SHOW_TEXT);
      let node;
      while ((node = target.nextNode())) {
        node.textContent = node.textContent
          .replace(/连续打卡\s*42\s*天/g, `连续打卡 ${streak} 天`)
          .replace(/42\s*天/g, `${streak} 天`)
          .replace(/156\s*笔/g, `${all.length} 笔`)
          .replace(/42\s*枚/g, `${streak} 枚`)
          .replace('9,017.50', money(savings).slice(1))
          .replace('超越 92% 手友', '数据已同步')
          .replace('已达成 112%', '累计净结余')
          .replace('支出 138 笔 · 收入 18 笔', `支出 ${all.filter((r) => r.type === 'expense').length} 笔 · 收入 ${all.filter((r) => r.type === 'income').length} 笔`);
      }
    }
    const edit = $('.app-profile-edit');
    if (edit) edit.addEventListener('click', (event) => {
      event.preventDefault(); event.stopImmediatePropagation();
      document.querySelector('.peach-profile-cover')?.remove();
      const cover = document.createElement('div'); cover.className = 'peach-profile-cover';
      const dialog = document.createElement('form'); dialog.className = 'peach-profile-dialog'; dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-label', '编辑个人资料');
      const title = document.createElement('h2'); title.textContent = '编辑个人资料'; dialog.append(title);
      const field = (label, value, multiline = false) => {
        const wrap = document.createElement('label'); wrap.textContent = label;
        const input = document.createElement(multiline ? 'textarea' : 'input'); input.value = value || ''; wrap.append(input); dialog.append(wrap); return input;
      };
      const nickname = field('名字', profile.nickname || '翔翔'); nickname.maxLength = 20;
      const username = field('账号', profile.username); username.required = true;
      const bio = field('简介', profile.bio || '', true); bio.maxLength = 100;
      const avatarField = document.createElement('label'); avatarField.textContent = '头像';
      const avatar = document.createElement('input'); avatar.type = 'file'; avatar.accept = 'image/png,image/jpeg,image/webp'; avatarField.append(avatar); dialog.append(avatarField);
      const error = document.createElement('p'); error.className = 'peach-profile-error'; dialog.append(error);
      const actions = document.createElement('div'); actions.className = 'peach-profile-actions';
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = '取消'; cancel.onclick = () => cover.remove();
      const save = document.createElement('button'); save.type = 'submit'; save.textContent = '保存'; actions.append(cancel, save); dialog.append(actions);
      cover.onclick = (click) => { if (click.target === cover) cover.remove(); };
      dialog.onsubmit = (submit) => { submit.preventDefault(); safe(async () => {
        error.textContent = ''; save.disabled = true;
        try {
          let imageData = profile.avatar || null;
          if (avatar.files[0]) {
            const image = new Image(); const url = URL.createObjectURL(avatar.files[0]);
            try {
              await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
              const canvas = document.createElement('canvas'); canvas.width = canvas.height = 160;
              const size = Math.min(image.width, image.height);
              canvas.getContext('2d').drawImage(image, (image.width - size) / 2, (image.height - size) / 2, size, size, 0, 0, 160, 160);
              imageData = canvas.toDataURL('image/jpeg', .7);
            } finally { URL.revokeObjectURL(url); }
          }
          await req('/profile', 'PUT', { username: username.value.trim(), nickname: nickname.value.trim(), bio: bio.value.trim(), avatar: imageData });
          location.reload();
        } catch (cause) { error.textContent = cause.message; save.disabled = false; }
      }); };
      cover.append(dialog); document.body.append(cover); nickname.focus();
    }, true);
    const securityHeading = $$('h3').find((node) => node.textContent.includes('账号与安全设置'));
    const securityList = securityHeading?.closest('.rounded-3xl')?.querySelector('ul');
    const template = securityList?.querySelector('li');
    if (template && !securityList.querySelector('[data-cloud-delete]')) {
      const item = template.cloneNode(true);
      item.removeAttribute('onclick'); item.dataset.cloudDelete = 'true';
      item.querySelector('.material-symbols-outlined').textContent = 'person_remove';
      const labels = $$('.font-label-md, .font-body-sm', item);
      if (labels[0]) labels[0].textContent = '注销账号';
      if (labels[1]) labels[1].textContent = '先导出账单，7 天内可撤销';
      item.setAttribute('role', 'button'); item.tabIndex = 0;
      const removeAccount = () => safe(async () => {
        const records = (await req('/export')).records;
        const csv = '\ufeff日期,类型,分类,金额,备注\n' + records.map((r) => [r.date, r.type, r.category, r.amount, r.note].map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = '注销前账单备份.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        if (!confirm('账单备份已开始下载。确认申请注销账号？7 天内重新登录可撤销。')) return;
        const username = prompt('请输入完整用户名确认注销'); if (username !== profile.username) return;
        await req('/account-deletion', 'POST', { username, exportPrompted: true });
        await api.logout().catch(() => {}); closeTo('landing.html');
      });
      item.onclick = removeAccount;
      item.onkeydown = (event) => { if (event.key === 'Enter') removeAccount(); };
      securityList.append(item);
    }
    if (head) {
      let local = []; try { local = JSON.parse(localStorage.getItem('pj.records') || '[]'); } catch { local = []; }
      if (!Array.isArray(local)) local = [];
      const mergeKey = `pj.cloud.merged.${profile.username}`;
      let merged = []; try { merged = JSON.parse(localStorage.getItem(mergeKey) || '[]'); } catch { merged = []; }
      local = local.filter((r) => !merged.includes(r.id));
      if (local.length) {
        const panel = document.createElement('div'); panel.className = 'cloud-native-section';
        panel.textContent = `本机还有 ${local.length} 笔旧账单，保留在浏览器中。请核对后手动合并。`;
        const merge = document.createElement('button'); merge.textContent = '确认合并到数据库'; panel.append(merge);
        merge.onclick = () => safe(async () => {
          if (!confirm(`确认合并本机 ${local.length} 笔账单？本机原始记录会保留。`)) return;
          const categories = (await req('/categories')).categories; let count = 0;
          for (const r of local) {
            const cat = categories.find((c) => c.type === r.type && c.name === r.category);
            if (!cat) continue;
            await req('/records', 'POST', { id: r.id, type: r.type, amount: Number(r.amount), date: r.date, categoryId: cat.id, note: r.note || '' });
            merged.push(r.id); count++;
            localStorage.setItem(mergeKey, JSON.stringify(merged));
          }
          status(`已合并 ${count} 笔，其余未匹配分类的账单仍保留在浏览器。`);
        });
        head.closest('.rounded-3xl')?.after(panel);
      }
    }
    return profile;
  }
  async function record() {
    const grid = $('#category-grid'); if (!grid) return;
    $('#record-wallet')?.closest('label')?.remove();
    const [categoryData, summary, history] = await Promise.all([req('/categories'), req(`/summary?month=${month}`), req(`/records?month=${month}`)]);
    const categories = categoryData.categories;
    const remaining = summary.budget == null ? null : summary.budget - summary.expense;
    const nodes = document.createTreeWalker($('main'), NodeFilter.SHOW_TEXT); let node;
    while ((node = nodes.nextNode())) node.textContent = node.textContent
      .replace('3,420.50', remaining == null ? '未设置' : Number(remaining).toFixed(2))
      .replace('剩余 68%', summary.budget ? `剩余 ${Math.max(0, remaining / summary.budget * 100).toFixed(0)}%` : '尚未设置预算')
      .replace('本月累计笔数 42', `本月累计笔数 ${history.records.length}`)
      .replace('今天 · 11月17日', `最近 · ${month}`)
      .replace('18.00', history.records[0] ? Number(history.records[0].amount).toFixed(2) : '0.00')
      .replace('1,200.00', history.records[1] ? Number(history.records[1].amount).toFixed(2) : '0.00');
    const sampleNames = ['下午茶生椰拿铁', '稿费到账结项'];
    sampleNames.forEach((sample, index) => {
      const label = $$('*').find((el) => !el.children.length && el.textContent.includes(sample));
      const record = history.records[index];
      if (label) label.textContent = record ? `${record.icon} ${record.category} · ${record.date}` : '暂无记录';
    });
    const pillClass = grid.querySelector('button')?.className || 'cat-pill';
    let type = 'expense'; let selected = categories.find((c) => c.type === type);
    const paint = () => {
      grid.replaceChildren();
      const label = $('#current-category-label'); if (label) label.textContent = selected?.name || '请选择';
      for (const cat of categories.filter((c) => c.type === type)) {
        const button = document.createElement('button'); button.type = 'button'; button.className = `${pillClass} ${selected?.id === cat.id ? 'app-category-selected' : ''}`;
        const icon = document.createElement('span'); icon.className = 'text-2xl mb-0.5'; icon.textContent = cat.icon;
        const name = document.createElement('span'); name.className = 'font-label-md text-[11px]'; name.textContent = cat.name;
        button.append(icon, name);
        button.onclick = () => { selected = cat; paint(); };
        grid.append(button);
      }
      const manage = document.createElement('button'); manage.type = 'button'; manage.className = pillClass; manage.textContent = '⚙️ 管理分类';
      manage.onclick = () => safe(async () => {
        const name = prompt('新分类名称'); if (!name) return;
        const icon = prompt('分类图标 Emoji', '📌') || '📌';
        const cat = await req('/categories', 'POST', { name: name.trim(), icon, type });
        categories.push(cat); selected = cat; paint();
      });
      grid.append(manage);
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = pillClass; remove.textContent = '删除所选分类';
      remove.onclick = () => safe(async () => {
        if (!selected || !confirm(`移除“${selected.name}”？历史账单会保留。`)) return;
        await req(`/categories/${selected.id}`, 'DELETE');
        categories.splice(categories.findIndex((c) => c.id === selected.id), 1);
        selected = categories.find((c) => c.type === type); paint();
      });
      grid.append(remove);
    };
    paint();
    for (const choice of ['expense', 'income']) $('#tab-' + choice)?.addEventListener('click', (event) => {
      event.preventDefault(); event.stopImmediatePropagation();
      type = choice; selected = categories.find((c) => c.type === type); paint();
      $('#quick-entry-modal').dataset.entryMode = type;
      $('#tab-expense').classList.toggle('bg-primary-container', type === 'expense');
      $('#tab-income').classList.toggle('bg-secondary', type === 'income');
      const heading = $('#category-grid')?.parentElement?.querySelector('.font-semibold span:last-child');
      if (heading) heading.textContent = type === 'expense' ? '消费分类' : '收入分类';
    }, true);
    $('#btn-save-record')?.addEventListener('click', (event) => {
      event.preventDefault(); event.stopImmediatePropagation();
      safe(async () => {
        if (!selected) throw Error('请选择分类');
        const date = $('#record-date')?.value || today();
        await req('/records', 'POST', { type, categoryId: selected.id, amount: Number($('#amount-input').value), date, note: $('#note-input')?.value.trim() || '' });
        localStorage.setItem('pj.period', JSON.stringify(date.slice(0, 7)));
        closeTo('bills.html');
      });
    }, true);
  }
  async function bills() {
    const [summary, records] = await Promise.all([req(`/summary?month=${month}`), req(`/records?month=${month}`)]);
    cardMetric('本月总支出', money(summary.expense)); cardMetric('本月总收入', money(summary.income)); cardMetric('本月结余', money(summary.balance));
    const remaining = summary.budget == null ? null : summary.budget - summary.expense;
    const percent = summary.budget ? summary.expense / summary.budget * 100 : 0;
    const content = document.createTreeWalker($('main'), NodeFilter.SHOW_TEXT); let node;
    while ((node = content.nextNode())) node.textContent = node.textContent
      .replaceAll('¥12,000 + 二手转让 ¥500', `数据库收入 ${money(summary.income)}`)
      .replaceAll('¥3,482.50', money(summary.expense))
      .replaceAll('¥1,017.50', remaining == null ? '未设置' : money(remaining))
      .replaceAll('¥4,500.00', summary.budget == null ? '未设置' : money(summary.budget))
      .replaceAll('77.4%', `${percent.toFixed(1)}%`)
      .replaceAll('72.1%', summary.income ? `${Math.max(0, summary.balance / summary.income * 100).toFixed(1)}%` : '0.0%')
      .replaceAll('112%', '按账单统计')
      .replaceAll('¥78.20', remaining == null ? '未设置' : money(Math.max(0, remaining) / Math.max(1, new Date(Number(month.slice(0,4)), Number(month.slice(5)), 0).getDate())))
      .replace('较上月同期减少 ¥492.00', '按本月账单实时统计')
      .replace('主要为薪酬', '按本月账单统计');
    $$('*').filter((n) => !n.children.length && n.textContent.trim() === '¥4,500.00').forEach((n) => n.textContent = summary.budget == null ? '未设置' : money(summary.budget));
    const sampleDate = $$('*').find((n) => !n.children.length && n.textContent.includes('今天 · 11月17日'));
    const sampleGroup = sampleDate?.closest('.flex.flex-col.gap-2');
    const list = sampleGroup?.parentElement;
    if (list) list.replaceChildren();
    const anchor = list || $('main section:last-of-type') || $('main');
    section(`${month} 流水 · ${records.records.length} 笔`, records.records, anchor);
  }
  async function budget() {
    const [budget, summary, categories] = await Promise.all([req(`/budgets?month=${month}`), req(`/summary?month=${month}`), req('/categories')]);
    const spent = summary.expense; const remaining = budget.total == null ? null : budget.total - spent;
    const title = $$('span').find((n) => n.textContent.includes('月月度总预算'));
    if (title) title.textContent = `${Number(month.slice(5))}月月度总预算`;
    const topCard = title?.closest('.rounded-2xl');
    if (topCard) {
      const percent = budget.total ? spent / budget.total * 100 : 0;
      const walker = document.createTreeWalker(topCard, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) node.textContent = node.textContent
        .replace('¥3,482.50', money(spent))
        .replace('¥4,500.00', budget.total == null ? '未设置' : money(budget.total))
        .replace('¥1,017.50', remaining == null ? '未设置' : money(remaining))
        .replace('77.4%', `${percent.toFixed(1)}%`)
        .replace('健康', percent >= 100 ? '已超支' : percent >= 80 ? '接近上限' : '正常');
    }
    const dailyCard = leaf('建议日均可支配')?.closest('.rounded-2xl');
    if (dailyCard) {
      const daysLeft = month === today().slice(0, 7) ? Math.max(1, new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate() - Number(today().slice(8)) + 1) : new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
      const dailyAmount = remaining == null ? '未设置' : money(Math.max(0, remaining) / daysLeft);
      const walker = document.createTreeWalker(dailyCard, NodeFilter.SHOW_TEXT);
      let node; while ((node = walker.nextNode())) node.textContent = node.textContent.replace('¥78.20', dailyAmount).replace('余 13 天', `余 ${daysLeft} 天`).replace('昨日支出 ¥52.00', `本月已支出 ${money(spent)}`).replace('比建议少 ¥26.20，存钱节奏超棒👍', '按数据库账单实时计算');
    }
    const sectionNode = $$('section').find((n) => n.querySelector('h2')?.textContent.includes('分类月度预算明细'));
    if (!sectionNode) return;
    const heading = sectionNode.querySelector('h2');
    if (heading && !sectionNode.querySelector('#budget-manage-categories')) {
      const manage = document.createElement('button'); manage.id = 'budget-manage-categories'; manage.type = 'button'; manage.textContent = '管理分类';
      manage.className = 'peach-manage-categories';
      manage.onclick = () => window.PeachModal?.manageCategories({ onClose: () => location.reload() });
      heading.parentElement.append(manage);
    }
    const countLabel = $$('*', sectionNode).find((n) => !n.children.length && n.textContent.includes('个活跃分类'));
    if (countLabel) countLabel.textContent = `共 ${categories.categories.filter((c) => c.type === 'expense').length} 个活跃分类`;
    const grid = sectionNode.querySelector('.grid.grid-cols-1.md\\:grid-cols-2');
    const template = grid?.querySelector('.rounded-2xl')?.cloneNode(true);
    if (grid) grid.replaceChildren();
    const summaryPanel = document.createElement('div'); summaryPanel.className = 'cloud-native-section';
    summaryPanel.textContent = `已支出 ${money(spent)} · 剩余可支配 ${remaining == null ? '未设置' : money(remaining)} · 日可支配 ${remaining == null ? '未设置' : money(Math.max(0, remaining) / Math.max(1, new Date(Number(month.slice(0,4)), Number(month.slice(5)), 0).getDate()))}`;
    sectionNode.prepend(summaryPanel);
    for (const cat of categories.categories.filter((c) => c.type === 'expense')) {
      const allocation = budget.categories.find((x) => x.id === cat.id)?.amount;
      const spentByCategory = summary.categories?.find((x) => x.id === cat.id)?.amount || 0;
      const tile = template?.cloneNode(true) || document.createElement('div');
      if (!template) tile.className = 'cloud-native-budget';
      const label = tile.querySelector('.font-headline-sm'); if (label) label.textContent = cat.name;
      else { const name = document.createElement('strong'); name.textContent = `${cat.icon} ${cat.name}`; tile.prepend(name); }
      const emoji = $$('*', tile).find((n) => !n.children.length && /^[\p{Extended_Pictographic}\uFE0F\u200D]+$/u.test(n.textContent.trim()));
      if (emoji) emoji.textContent = cat.icon;
      const moneyLeaves = $$('*', tile).filter((n) => !n.children.length && /¥[\d,]+(?:\.\d{2})?/.test(n.textContent));
      moneyLeaves.forEach((n, i) => { n.textContent = n.textContent.replace(/¥[\d,]+(?:\.\d{2})?/, i === 0 ? money(spentByCategory) : allocation == null ? '未设置' : money(allocation)); });
      const percent = allocation ? spentByCategory / allocation * 100 : 0;
      const description = $$('*', tile).find((n) => !n.children.length && n.textContent.includes('日用正餐'));
      if (description) description.textContent = '账单与预算实时同步';
      $$('*', tile).filter((n) => !n.children.length).forEach((n) => {
        if (n.textContent.trim() === '81.3%') n.textContent = `${percent.toFixed(1)}%`;
        if (n.textContent.includes('已达 80% 警戒线')) n.textContent = allocation == null ? '尚未设置预算' : percent >= 100 ? '已超出预算' : percent >= 80 ? '已达 80% 警戒线' : '额度正常';
      });
      const edit = tile.querySelector('button[title="修改预算"]') || document.createElement('button');
      if (!edit.parentElement) { edit.type = 'button'; edit.textContent = '✎ 修改预算'; tile.append(edit); }
      edit.onclick = () => window.PeachModal ? window.PeachModal.openBudget({ categoryId: cat.id }) : closeTo(`budget-adjust.html?categoryId=${encodeURIComponent(cat.id)}`);
      tile.querySelector('button[title="趋势统计"]')?.remove();
      (grid || sectionNode).append(tile);
    }
  }
  async function adjust() {
    const categoryId = new URLSearchParams(location.search).get('categoryId');
    const [budget, summary, categories] = await Promise.all([req(`/budgets?month=${month}`), req(`/summary?month=${month}`), req('/categories')]);
    const category = categories.categories.find((x) => x.id === categoryId);
    const current = category ? budget.categories.find((x) => x.id === categoryId)?.amount : budget.total;
    const input = $('#budget-input'); if (!input) return; input.value = current == null ? '' : String(current);
    const heading = $('#budget-modal-card h2'); if (heading) heading.textContent = category ? `调整「${category.name}」预算` : '调整月度总预算';
    const preview = document.createElement('p'); preview.className = 'cloud-native-section'; input.closest('form, #budget-modal-card')?.append(preview);
    const calculate = () => {
      const amount = Number(input.value.replaceAll(',', '')) || 0;
      const remaining = amount - summary.expense;
      const days = Math.max(1, new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate());
      if ($('#preview-balance')) $('#preview-balance').textContent = money(remaining);
      if ($('#preview-daily')) $('#preview-daily').textContent = money(Math.max(0, remaining) / days);
      preview.textContent = `数据库本月支出 ${money(summary.expense)} · 按新预算预计结存 ${money(summary.income - amount)}`;
    };
    input.addEventListener('input', calculate); calculate();
    $('#confirm-btn')?.addEventListener('click', (event) => {
      event.preventDefault(); event.stopImmediatePropagation();
      safe(async () => { await req('/budgets', 'PUT', { month, amount: Number(input.value.replaceAll(',', '')), categoryId: category?.id }); closeTo('budget.html'); });
    }, true);
  }
  async function stats() {
    const [summary, analytics, records] = await Promise.all([req(`/summary?month=${month}`), req(`/analytics?month=${month}`), req(`/records?month=${month}`)]);
    cardMetric('本月总支出', money(summary.expense)); cardMetric('本月总收入', money(summary.income));
    cardMetric('本月实际结余', money(summary.balance));
    const elapsed = month === today().slice(0, 7) ? Number(today().slice(8)) : new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
    const savingsRate = summary.income ? Math.max(0, summary.balance / summary.income * 100).toFixed(1) : '0.0';
    $$('*').filter((node) => !node.children.length && node.textContent.trim() === '72.1%').forEach((node) => node.textContent = `${savingsRate}%`);
    const textNodes = document.createTreeWalker($('main'), NodeFilter.SHOW_TEXT); let textNode;
    while ((textNode = textNodes.nextNode())) textNode.textContent = textNode.textContent
      .replace('¥204.85', money(summary.expense / Math.max(1, elapsed)))
      .replace('储蓄率 72.1%', `储蓄率 ${savingsRate}%`)
      .replace('12.4% 比上月减少，很自律', '按数据库账单统计')
      .replace('今日已自动核销结余', '数据已同步');
    const panel = $$('div.lg\\:col-span-6').find((n) => n.querySelector('h2')?.textContent.includes('支出分类占比'));
    if (panel) {
      const chart = panel.querySelector('.relative.w-44.h-44');
      const ring = chart?.querySelector('svg');
      ring?.classList.add('peach-chart-enter');
      const center = chart?.querySelector('.pointer-events-none');
      const capsules = chart?.nextElementSibling;
      if (capsules) capsules.style.flexDirection = 'column';
      const detailList = panel.querySelector('.max-h-56.overflow-y-auto');
      const detailTitle = detailList?.parentElement?.querySelector('.font-label-md.font-bold');
      const order = $$('span', panel).find((node) => node.textContent.trim() === '按金额排序');
      const insight = $$('span', panel).find((node) => node.textContent.trim() === '桃桃洞察：')?.parentElement;
      const groups = summary.categories.filter((item) => item.amount > 0);
      let selected = ''; let sortAmount = false;
      const colors = ['#ff8fab', '#ffb1c2', '#eba15c', '#a4f3cd', '#dac0c4', '#9bb7db', '#c7a9d9'];
      const render = () => {
        const total = summary.expense || 0;
        if (ring) {
          ring.querySelectorAll('circle:not(:first-child)').forEach((node) => node.remove());
          let offset = 0;
          groups.forEach((item, index) => {
            const length = total ? item.amount / total * 389.55 : 0;
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            for (const [key, value] of Object.entries({ cx: 80, cy: 80, r: 62, fill: 'none', stroke: colors[index % colors.length], 'stroke-width': selected === item.id ? 23 : 20, 'stroke-dasharray': `${length} 389.55`, 'stroke-dashoffset': -offset })) circle.setAttribute(key, value);
            circle.classList.add('cursor-pointer'); circle.style.opacity = selected && selected !== item.id ? '.35' : '1';
            circle.onclick = () => { selected = selected === item.id ? '' : item.id; render(); };
            ring.append(circle); offset += length;
          });
        }
        const focused = groups.find((item) => item.id === selected) || groups[0];
        if (center) {
          const bits = [...center.children];
          if (bits[0]) bits[0].textContent = focused ? `${focused.icon} ${focused.name}` : '暂无支出';
          if (bits[1]) bits[1].textContent = money(focused?.amount || 0);
          if (bits[2]) bits[2].textContent = `占比 ${total ? ((focused?.amount || 0) / total * 100).toFixed(1) : '0'}%`;
        }
        if (insight) insight.textContent = focused ? `桃桃洞察：${focused.name}占本月支出 ${((focused.amount / total) * 100).toFixed(1)}%` : '桃桃洞察：本月暂无支出记录';
        if (capsules) {
          capsules.replaceChildren();
          groups.forEach((item, index) => {
            const button = document.createElement('button'); button.type = 'button'; button.className = 'peach-stats-category';
            button.classList.toggle('selected', item.id === (selected || focused?.id));
            button.innerHTML = `<span class="peach-stats-dot"></span><span class="peach-stats-name"></span><strong class="peach-stats-value"></strong>`;
            button.querySelector('.peach-stats-dot').style.background = colors[index % colors.length];
            button.querySelector('.peach-stats-name').textContent = `${item.icon} ${item.name}`;
            button.querySelector('.peach-stats-value').textContent = `${money(item.amount)} (${total ? (item.amount / total * 100).toFixed(1) : '0'}%)`;
            button.onclick = () => { selected = selected === item.id ? '' : item.id; render(); };
            capsules.append(button);
          });
          if (!groups.length) capsules.textContent = '本月暂无分类支出';
        }
        const details = records.records.filter((r) => r.type === 'expense' && (!selected || r.categoryId === selected)).sort((a, b) => sortAmount ? b.amount - a.amount : b.date.localeCompare(a.date));
        if (detailTitle) detailTitle.textContent = `${selected ? focused?.name || '分类' : '全部支出'} · 账单明细（共 ${details.length} 笔）`;
        if (detailList) {
          detailList.replaceChildren();
          if (!details.length) detailList.textContent = '当前分类暂无账单';
          details.forEach((entry) => {
            const item = document.createElement('div'); item.className = 'peach-stats-entry';
            const info = document.createElement('span'); info.textContent = `${entry.icon || '📌'} ${entry.category || '未分类'} · ${entry.date}${entry.note ? ` · ${entry.note}` : ''}`;
            const value = document.createElement('strong'); value.textContent = `-${money(entry.amount)}`;
            item.append(info, value); detailList.append(item);
          });
        }
      }; render();
      if (order) { order.setAttribute('role', 'button'); order.tabIndex = 0; order.onclick = () => { sortAmount = !sortAmount; order.textContent = sortAmount ? '按默认排序' : '按金额排序'; render(); }; order.onkeydown = (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); order.click(); } }; }
    }
    const trend = $('#daily-trend');
    if (trend) {
      trend.replaceChildren(); const chart = document.createElement('div'); chart.className = 'cloud-native-trend';
      const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
      const daily = new Map(summary.daily.map((day) => [day.date, day.amount]));
      const max = Math.max(1, ...summary.daily.map((day) => day.amount));
      for (let day = 1; day <= daysInMonth; day++) {
        const key = `${month}-${String(day).padStart(2, '0')}`;
        const item = document.createElement('div'); item.title = `${key} 支出 ${money(daily.get(key) || 0)}`;
        const bar = document.createElement('i'); bar.style.height = `${Math.max(2, (daily.get(key) || 0) / max * 130)}px`;
        const value = document.createElement('strong'); value.className = 'peach-trend-value'; value.textContent = daily.get(key) ? `¥${Number(daily.get(key)).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}` : '·';
        const label = document.createElement('small'); label.textContent = `${day}日`;
        item.append(value, bar, label); chart.append(item);
      }
      trend.append(chart);
    }
    const exportButton = $$('button').find((button) => button.textContent.includes('导出每日统计 CSV'));
    if (exportButton) {
      exportButton.textContent = '导出统计 Excel';
      exportButton.addEventListener('click', (event) => {
        event.preventDefault(); event.stopImmediatePropagation();
        safe(async () => {
          await api.data(`/summary?month=${month}`);
          const response = await fetch(`${api.API_BASE}/data/export-excel?month=${encodeURIComponent(month)}`, { headers: { authorization: `Bearer ${api.session().access_token}` } });
          if (!response.ok) throw new Error('Excel 导出失败');
          const url = URL.createObjectURL(await response.blob());
          const link = document.createElement('a'); link.href = url; link.download = `统计-${month}.xlsx`; link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
      }, true);
    }
  }
  async function account() {
    const old = $('#input-old-pwd'); const next = $('#input-new-pwd');
    const confirm = $$('button', $('#modal-change-pwd-box') || document).find((button) => button.textContent.includes('确认更新'));
    if (confirm) confirm.addEventListener('click', (event) => { event.preventDefault(); event.stopImmediatePropagation(); safe(async () => { await req('/password', 'PUT', { oldPassword: old.value, newPassword: next.value }); status('密码已更新'); $('#modal-change-pwd')?.classList.add('hidden'); }); }, true);
  }
  async function logout() {
    $$('button').filter((b) => b.textContent.includes('确认退出')).forEach((button) => button.addEventListener('click', (event) => { event.preventDefault(); event.stopImmediatePropagation(); safe(async () => { await api.logout(); localStorage.removeItem('pj.session'); localStorage.removeItem('pj.profile'); closeTo('landing.html'); }); }, true));
  }
  safe(async () => {
    await syncProfile();
    if (page === 'record.html') await record();
    if (page.startsWith('bills')) await bills();
    if (page === 'budget.html') await budget();
    if (page === 'budget-adjust.html') await adjust();
    if (page.startsWith('stats')) await stats();
    if (page.startsWith('profile')) await account();
    if (page === 'logout.html') await logout();
  });
})();
