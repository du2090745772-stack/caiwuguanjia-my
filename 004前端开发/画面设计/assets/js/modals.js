(() => {
  'use strict';
  const api = window.AuthApi;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const today = () => new Date().toLocaleDateString('sv-SE');
  const month = () => { try { return JSON.parse(localStorage.getItem('pj.period')) || today().slice(0, 7); } catch { return today().slice(0, 7); } };
  const money = (value) => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(`pj.${key}`)) ?? fallback; } catch { return fallback; } };
  const write = (key, value) => localStorage.setItem(`pj.${key}`, JSON.stringify(value));
  const defaultCategories = () => Object.entries({ expense: [['餐饮','🍜'], ['交通','🚌'], ['购物','🛍️'], ['住房','🏠'], ['娱乐','🎮'], ['医疗','💊'], ['人情','🎁'], ['学习','📚'], ['其他','📌']], income: [['工资','💰'], ['理财','📈'], ['兼职','💼'], ['红包','🧧'], ['其他','📌']] }).flatMap(([type, list]) => list.map(([name, icon]) => ({ id: `${type}-${name}`, type, name, icon })));
  let active = null;

  async function template(file, selector) {
    const response = await fetch(file);
    if (!response.ok) throw Error('弹窗模板加载失败');
    return $(selector, new DOMParser().parseFromString(await response.text(), 'text/html'))?.cloneNode(true);
  }
  function notify(message, root = active) {
    let item = $('#peach-modal-message', root);
    if (!item) { item = document.createElement('p'); item.id = 'peach-modal-message'; item.setAttribute('role', 'alert'); root?.append(item); }
    item.textContent = message;
  }
  function close() {
    if (!active) return;
    active.remove(); active = null;
    document.body.classList.remove('peach-dialog-open');
  }
  function fit() {
    if (!active) return;
    const card = $('[data-peach-card]', active);
    if (!card) return;
    card.style.zoom = '1';
    card.style.width = `${Math.min(card.id === 'budget-modal-card' ? 470 : 450, window.innerWidth - 20)}px`;
    const availableHeight = window.innerHeight - 20;
    const availableWidth = window.innerWidth - 20;
    const scale = Math.min(1, availableHeight / card.offsetHeight, availableWidth / card.offsetWidth);
    card.style.zoom = String(Math.max(.65, scale));
  }
  function mount(card, label) {
    close();
    const backdrop = document.createElement('div');
    backdrop.className = 'peach-modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-label', label);
    card.dataset.peachCard = 'true';
    backdrop.append(card); document.body.append(backdrop);
    document.body.classList.add('peach-dialog-open');
    active = backdrop;
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(); });
    fit();
    return card;
  }
  function smallDialog(title, onDismiss) {
    const cover = document.createElement('div'); cover.className = 'peach-small-cover';
    const box = document.createElement('div'); box.className = 'peach-small-dialog';
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', title);
    const head = document.createElement('div'); head.className = 'peach-small-head';
    const label = document.createElement('strong'); label.textContent = title;
    const x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', '关闭');
    const dismiss = () => { cover.remove(); onDismiss?.(); }; x.onclick = dismiss;
    cover.dataset.dismissable = 'true';
    cover._dismiss = dismiss;
    cover.onclick = (event) => { if (event.target === cover) dismiss(); };
    head.append(label, x); box.append(head); cover.append(box); document.body.append(cover);
    return { box, dismiss };
  }
  function datePicker(input, onSelect) {
    const { box, dismiss } = smallDialog('选择记账日期');
    const wheels = document.createElement('div'); wheels.className = 'peach-date-wheels';
    const chosen = (input.value || today()).split('-').map(Number);
    const names = ['年', '月', '日']; const selects = [];
    names.forEach((name, index) => {
      const col = document.createElement('label'); col.textContent = name;
      const select = document.createElement('select'); select.size = 5; select.setAttribute('aria-label', `选择${name}`);
      select.onchange = () => { if (index !== 2) fillDays(); };
      col.append(select); wheels.append(col); selects.push(select);
    });
    const [year, monthSelect, day] = selects;
    for (let n = new Date().getFullYear() - 30; n <= new Date().getFullYear() + 10; n++) year.add(new Option(`${n}年`, String(n)));
    for (let n = 1; n <= 12; n++) monthSelect.add(new Option(`${n}月`, String(n)));
    year.value = String(chosen[0]); monthSelect.value = String(chosen[1]);
    function fillDays() {
      const old = Number(day.value) || chosen[2]; day.replaceChildren();
      const count = new Date(Number(year.value), Number(monthSelect.value), 0).getDate();
      for (let n = 1; n <= count; n++) day.add(new Option(`${n}日`, String(n)));
      day.value = String(Math.min(old, count));
    }
    fillDays();
    const actions = document.createElement('div'); actions.className = 'peach-small-actions';
    const cancel = document.createElement('button'); cancel.textContent = '取消'; cancel.onclick = dismiss;
    const save = document.createElement('button'); save.textContent = '确定'; save.className = 'primary';
    save.onclick = () => { input.value = `${year.value}-${monthSelect.value.padStart(2, '0')}-${day.value.padStart(2, '0')}`; onSelect?.(input.value); dismiss(); };
    actions.append(cancel, save); box.append(wheels, actions);
  }
  async function manageCategories({ initialType = 'expense', onChange, onClose } = {}) {
    const signedIn = api?.isSignedIn();
    const categories = signedIn ? (await api.data('/categories')).categories : read('categories', defaultCategories());
    let changed = false;
    const { box, dismiss } = smallDialog('管理分类', () => { if (changed) onClose?.(); });
    let type = initialType;
    const tabs = document.createElement('div'); tabs.className = 'peach-category-tabs';
    const list = document.createElement('div'); list.className = 'peach-category-list';
    const form = document.createElement('form'); form.className = 'peach-category-form';
    const name = document.createElement('input'); name.placeholder = '分类名称'; name.maxLength = 10; name.required = true;
    const icon = document.createElement('input'); icon.placeholder = '图标 Emoji'; icon.value = '📌'; icon.maxLength = 8;
    const save = document.createElement('button'); save.type = 'submit'; save.textContent = '添加分类';
    const error = document.createElement('p'); error.className = 'peach-category-error';
    form.append(name, icon, save); box.append(tabs, list, form, error);
    const draw = () => {
      tabs.replaceChildren(); list.replaceChildren();
      for (const [key, label] of [['expense', '支出'], ['income', '收入']]) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
        button.className = key === type ? 'selected' : ''; button.onclick = () => { type = key; draw(); }; tabs.append(button);
      }
      for (const category of categories.filter((item) => item.type === type)) {
        const item = document.createElement('div'); item.className = 'peach-category-item';
        const text = document.createElement('span'); text.textContent = `${category.icon} ${category.name}`;
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '删除';
        remove.setAttribute('aria-label', `删除${category.name}`);
        remove.onclick = async () => {
          try {
            if (signedIn) await api.data(`/categories/${category.id}`, { method: 'DELETE' });
            categories.splice(categories.findIndex((item) => item.id === category.id), 1);
            if (!signedIn) write('categories', categories);
            changed = true; draw(); onChange?.(categories);
          } catch (cause) { error.textContent = cause.message; }
        };
        item.append(text, remove); list.append(item);
      }
    };
    form.onsubmit = async (event) => {
      event.preventDefault(); error.textContent = '';
      const label = name.value.trim(); if (!label) return;
      try {
        const category = signedIn ? await api.data('/categories', { method: 'POST', body: { name: label, icon: icon.value.trim() || '📌', type } }) : { id: crypto.randomUUID(), name: label, icon: icon.value.trim() || '📌', type };
        categories.push(category); if (!signedIn) write('categories', categories);
        changed = true; name.value = ''; draw(); onChange?.(categories);
      } catch (cause) { error.textContent = cause.message; }
    };
    draw(); name.focus();
    return dismiss;
  }
  document.addEventListener('keydown', (event) => { if (event.key !== 'Escape') return; const small = $('.peach-small-cover'); if (small) { event.preventDefault(); small._dismiss(); } else if (active) { event.preventDefault(); close(); } });
  window.addEventListener('resize', fit);

  async function openRecord() {
    try {
      const card = await template('record.html', '#quick-entry-modal');
      if (!card) throw Error('记账弹窗不存在');
      mount(card, '记一笔');
      const amount = $('#amount-input', card); amount.value = '';
      $('#note-input', card).value = '';
      $('#continuous-toggle', card)?.closest('label')?.remove();
      const grid = $('#category-grid', card);
      const tiles = grid.parentElement.nextElementSibling.querySelector('.grid.grid-cols-2');
      if (tiles) { tiles.className = 'app-date-wallet'; tiles.innerHTML = '<label>日期<button type="button" id="record-date-button"></button><input id="record-date" type="hidden"></label>'; $('#record-date', tiles).value = today(); $('#record-date-button', tiles).textContent = today(); $('#record-date-button', tiles).onclick = () => datePicker($('#record-date', tiles), (value) => { $('#record-date-button', tiles).textContent = value; }); }
      const signedIn = api?.isSignedIn();
      const categories = signedIn ? (await api.data('/categories')).categories : read('categories', defaultCategories());
      let type = 'expense', selected = categories.find((item) => item.type === type);
      const pillClass = 'cat-pill flex flex-col items-center justify-center rounded-xl bg-surface-container-low/40 text-on-surface-variant transition-all duration-150';
      const paint = () => {
        grid.replaceChildren();
        $('#current-category-label', card).textContent = selected?.name || '请选择';
        for (const category of categories.filter((item) => item.type === type)) {
          const button = document.createElement('button'); button.type = 'button'; button.className = `${pillClass} ${selected?.id === category.id ? 'app-category-selected' : ''}`;
          const icon = document.createElement('span'); icon.className = 'text-2xl mb-0.5'; icon.textContent = category.icon;
          const name = document.createElement('span'); name.className = 'font-label-md text-[11px]'; name.textContent = category.name;
          button.append(icon, name); button.onclick = () => { selected = category; $$('.cat-pill', grid).forEach((pill) => pill.classList.remove('app-category-selected')); button.classList.add('app-category-selected'); $('#current-category-label', card).textContent = category.name; };
          button.ondblclick = (event) => {
            event.preventDefault();
            button.replaceChildren(); button.classList.add('peach-category-editing');
            const iconInput = document.createElement('input'); iconInput.value = category.icon; iconInput.maxLength = 8; iconInput.setAttribute('aria-label', '分类图标');
            const nameInput = document.createElement('input'); nameInput.value = category.name; nameInput.maxLength = 10; nameInput.setAttribute('aria-label', '分类名称');
            button.append(iconInput, nameInput); nameInput.focus(); nameInput.select();
            let saving = false;
            const save = async () => {
              if (saving) return; saving = true;
              const nextName = nameInput.value.trim(), nextIcon = iconInput.value.trim();
              if (!nextName || !nextIcon) { notify('分类名称和图标不能为空'); saving = false; return; }
              try {
                const updated = signedIn ? await api.data(`/categories/${category.id}`, { method: 'PUT', body: { name: nextName, icon: nextIcon } }) : { ...category, name: nextName, icon: nextIcon };
                Object.assign(category, updated); if (!signedIn) write('categories', categories);
                paint();
              } catch (cause) { notify(cause.message); saving = false; }
            };
            button.addEventListener('focusout', (blur) => { if (!button.contains(blur.relatedTarget)) save(); });
            for (const input of [iconInput, nameInput]) input.onkeydown = (key) => { if (key.key === 'Enter') { key.preventDefault(); save(); } };
          };
          grid.append(button);
        }
        const add = document.createElement('button'); add.type = 'button'; add.className = pillClass; add.textContent = '＋ 添加分类';
        add.onclick = () => manageCategories({ initialType: type, onChange: (items) => { categories.splice(0, categories.length, ...items); selected = categories.find((item) => item.id === selected?.id) || categories.find((item) => item.type === type); paint(); fit(); } });
        grid.append(add);
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = pillClass; remove.textContent = '− 删除分类';
        remove.onclick = async () => {
          if (!selected) return;
          try {
            if (signedIn) await api.data(`/categories/${selected.id}`, { method: 'DELETE' });
            categories.splice(categories.findIndex((item) => item.id === selected.id), 1);
            if (!signedIn) write('categories', categories);
            selected = categories.find((item) => item.type === type); paint(); fit();
          } catch (cause) { notify(cause.message); }
        };
        grid.append(remove);
      };
      paint();
      for (const choice of ['expense', 'income']) $('#tab-' + choice, card).onclick = () => {
        type = choice; selected = categories.find((item) => item.type === type);
        card.dataset.entryMode = type;
        $('#tab-expense', card).classList.toggle('bg-primary-container', type === 'expense');
        $('#tab-income', card).classList.toggle('bg-secondary', type === 'income');
        paint();
      };
      $$('.quick-add-btn', card).forEach((button) => button.onclick = () => { amount.value = ((Number(amount.value) || 0) + Number(button.dataset.val)).toFixed(2); });
      $('#btn-clear-amount', card).onclick = () => { amount.value = ''; amount.focus(); };
      $('#btn-close-modal', card).onclick = close;
      $('#btn-cancel', card).onclick = close;
      $('#btn-save-record', card).onclick = async () => {
        const value = Number(amount.value);
        if (!selected || !Number.isFinite(value) || value <= 0 || !/^\d+(?:\.\d{1,2})?$/.test(amount.value.trim())) { notify('请选择分类并输入大于 0、最多两位小数的金额。'); return; }
        const date = $('#record-date', card)?.value || today();
        const note = $('#note-input', card).value.trim();
        try {
          if (signedIn) await api.data('/records', { method: 'POST', body: { type, amount: value, date, categoryId: selected.id, note } });
          else write('records', [{ id: crypto.randomUUID(), type, amount: value, date, category: selected.name, icon: selected.icon, note }, ...read('records', [])]);
          write('period', date.slice(0, 7)); close(); location.reload();
        } catch (error) { notify(error.message); }
      };
      fit(); requestAnimationFrame(fit); amount.focus();
    } catch (error) { notify(error.message, document.body); }
  }

  async function openBudget({ categoryId = null, source = 'budget.html' } = {}) {
    try {
      const card = await template('budget-adjust.html', '#budget-modal-card');
      if (!card) throw Error('预算弹窗不存在');
      mount(card, '调整预算');
      const signedIn = api?.isSignedIn();
      const period = month();
      const [budget, summary, categories] = signedIn ? await Promise.all([
        api.data(`/budgets?month=${period}`), api.data(`/summary?month=${period}`), api.data('/categories'),
      ]) : (() => {
        const guestCategories = read('categories', defaultCategories());
        const guestRecords = read('records', []).filter((r) => r.date?.startsWith(period));
        const guestBudget = read('budgetsByMonth', {})[period] || { total: 4500, categories: {} };
        return [
          { total: guestBudget.total, categories: guestCategories.map((item) => ({ id: item.id, amount: guestBudget.categories?.[item.name] })).filter((item) => item.amount != null) },
          { expense: guestRecords.filter((r) => r.type === 'expense').reduce((sum, r) => sum + Number(r.amount), 0), income: guestRecords.filter((r) => r.type === 'income').reduce((sum, r) => sum + Number(r.amount), 0), categories: guestCategories.map((item) => ({ id: item.id, amount: guestRecords.filter((r) => r.type === 'expense' && r.category === item.name).reduce((sum, r) => sum + Number(r.amount), 0) })) },
          { categories: guestCategories },
        ];
      })();
      const category = categories.categories.find((item) => item.id === categoryId);
      const current = category ? budget.categories.find((item) => item.id === category.id)?.amount ?? null : budget.total;
      const spent = category ? summary.categories.find((item) => item.id === category.id)?.amount || 0 : summary.expense;
      const heading = $('h2', card);
      const choice = document.createElement('select'); choice.id = 'budget-category-choice'; choice.setAttribute('aria-label', '选择预算分类');
      choice.add(new Option('调整总预算', ''));
      categories.categories.filter((item) => item.type === 'expense').forEach((item) => choice.add(new Option(`${item.icon} ${item.name}`, item.id)));
      choice.value = category?.id || '';
      choice.onchange = () => openBudget({ categoryId: choice.value || null });
      heading.replaceChildren(choice);
      const monthTag = $$('.font-label-md', card).find((node) => node.textContent.includes('2024年4月'));
      if (monthTag) monthTag.textContent = `${period.slice(0, 4)}年${Number(period.slice(5))}月`;
      const currentStatus = card.children[2];
      const currentValues = $$('.font-numeric-table', currentStatus);
      if (currentValues[0]) currentValues[0].textContent = money(spent);
      if (currentValues[1]) currentValues[1].textContent = current == null ? '未设置' : money(current);
      const allocated = budget.categories.filter((item) => item.id !== category?.id).reduce((sum, item) => sum + item.amount, 0);
      const remainingAllocation = budget.total == null ? null : budget.total - allocated;
      const allocationNote = document.createElement('p'); allocationNote.className = 'peach-budget-allocation';
      allocationNote.textContent = category ? `总预算 ${budget.total == null ? '未设置' : money(budget.total)} · 其他分类已分配 ${money(allocated)} · 可分配 ${remainingAllocation == null ? '未设置' : money(remainingAllocation)}` : `分类已分配 ${money(budget.categories.reduce((sum, item) => sum + item.amount, 0))} · 尚未分配 ${remainingAllocation == null ? '未设置' : money(remainingAllocation)}`;
      currentStatus.after(allocationNote);
      const noteAmount = $('strong', currentStatus); if (noteAmount) noteAmount.textContent = money(spent);
      const percent = current ? spent / current * 100 : 0;
      const percentLabel = $$('.text-primary.font-bold', currentStatus).find((node) => node.textContent.includes('%'));
      if (percentLabel) percentLabel.textContent = `${percent.toFixed(1)}%`;
      const bar = $('[style*="width:"]', currentStatus); if (bar) bar.style.width = `${Math.min(100, percent)}%`;
      const input = $('#budget-input', card); input.value = current == null ? '' : String(current);
      const daysInMonth = new Date(Number(period.slice(0, 4)), Number(period.slice(5)), 0).getDate();
      const daysLeft = period === today().slice(0, 7) ? Math.max(1, daysInMonth - Number(today().slice(8)) + 1) : daysInMonth;
      const preview = $$('.grid.grid-cols-2', card).at(-1);
      const labels = $$('span', preview).filter((node) => !node.children.length);
      const dailyLabel = labels.find((node) => node.textContent.includes('剩余13天')); if (dailyLabel) dailyLabel.textContent = `剩余 ${daysLeft} 天日均可支配`;
      const balanceLabel = labels.find((node) => node.textContent.includes('预计月终结余')); if (balanceLabel) balanceLabel.textContent = '按新预算预计结存';
      labels.filter((node) => node.textContent.includes('比原先') || node.textContent.includes('健康盈余')).forEach((node) => node.textContent = signedIn ? '根据数据库账单计算' : '根据本机账单计算');
      const recalc = () => {
        const proposed = Number(input.value.replaceAll(',', '')) || 0;
        const remaining = proposed - spent;
        $('#preview-daily', card).textContent = money(Math.max(0, remaining) / daysLeft);
        const projected = category ? summary.income - (summary.expense - spent + proposed) : summary.income - proposed;
        $('#preview-balance', card).textContent = money(projected);
      };
      const presets = $$('.preset-pill', card);
      const previous = new Date(Number(period.slice(0, 4)), Number(period.slice(5)) - 2, 1);
      const previousKey = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
      const previousSpent = signedIn ? (await api.data(`/summary?month=${previousKey}`)).expense : 0;
      const amounts = [4000, 4500, 4800, 5000, 5500].map((value) => category && current ? Math.max(1, Math.round(value * current / 4500)) : value);
      amounts.push(Math.max(1, Math.round(previousSpent * 1.1)));
      presets.forEach((button, index) => {
        button.dataset.val = String(amounts[index]);
        button.textContent = index === 5 ? `上月支出 +10% · ${money(amounts[index])}` : money(amounts[index]);
        button.onclick = () => { input.value = String(amounts[index]); selectPreset(button); recalc(); };
      });
      const selectPreset = (chosen) => presets.forEach((button) => {
        const selected = button === chosen;
        button.classList.toggle('peach-preset-selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      const match = presets.find((button) => Number(button.dataset.val) === Number(input.value)); selectPreset(match);
      input.addEventListener('input', () => { selectPreset(presets.find((button) => Number(button.dataset.val) === Number(input.value.replaceAll(',', '')))); recalc(); });
      $('#clear-budget-btn', card).onclick = () => { input.value = ''; selectPreset(null); recalc(); input.focus(); };
      $('#step-up-btn', card).onclick = () => { input.value = String((Number(input.value.replaceAll(',', '')) || 0) + 100); selectPreset(null); recalc(); };
      $('#step-down-btn', card).onclick = () => { input.value = String(Math.max(0, (Number(input.value.replaceAll(',', '')) || 0) - 100)); selectPreset(null); recalc(); };
      $('#close-modal-btn', card).onclick = close;
      $('#cancel-btn', card).onclick = close;
      $('#confirm-btn', card).onclick = async () => {
        const amount = Number(input.value.replaceAll(',', ''));
        if (!Number.isFinite(amount) || amount <= 0) { notify('请输入大于 0 的预算金额'); return; }
        try {
          if (signedIn) await api.data('/budgets', { method: 'PUT', body: { month: period, amount, categoryId: category?.id } });
          else { const data = read('budgetsByMonth', {}); const currentBudget = data[period] || { total: 4500, categories: {} }; if (category) currentBudget.categories[category.name] = amount; else currentBudget.total = amount; data[period] = currentBudget; write('budgetsByMonth', data); }
          close(); location.reload();
        } catch (error) { notify(error.message); }
      };
      recalc(); fit(); requestAnimationFrame(fit); input.focus();
    } catch (error) { notify(error.message, document.body); }
  }

  window.PeachModal = { openRecord, openBudget, manageCategories, close };
  const page = location.pathname.split('/').pop();
  if (page.startsWith('budget') && page !== 'budget-adjust.html') {
    const heading = $$('section h2').find((node) => node.textContent.includes('分类月度预算明细'));
    if (heading && !$('#budget-manage-categories')) {
      const manage = document.createElement('button'); manage.id = 'budget-manage-categories'; manage.type = 'button'; manage.className = 'peach-manage-categories'; manage.textContent = '管理分类';
      manage.onclick = () => manageCategories({ onClose: () => location.reload() });
      heading.parentElement.append(manage);
    }
  }
  const query = new URLSearchParams(location.search);
  if (page === 'record.html' || page === 'budget-adjust.html') {
    const fallback = page === 'record.html' ? 'bills.html' : 'budget.html';
    const requested = query.get('return');
    const parent = /^(bills|bills-empty|stats|stats-empty|budget|budget-empty|budget-exceeded|profile|profile-account)\.html$/.test(requested || '') ? requested : fallback;
    const target = new URL(parent, location.href);
    target.searchParams.set('modal', page === 'record.html' ? 'record' : 'budget');
    if (query.get('categoryId')) target.searchParams.set('categoryId', query.get('categoryId'));
    location.replace(target.href);
  } else if (query.get('modal') === 'record' || query.get('modal') === 'budget') {
    const kind = query.get('modal');
    const categoryId = query.get('categoryId');
    history.replaceState(null, '', location.pathname);
    if (kind === 'record') openRecord(); else openBudget({ categoryId });
  }
})();
