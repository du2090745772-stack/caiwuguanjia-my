(() => {
  'use strict';
  const page = location.pathname.split('/').pop();
  const defaultAvatar = 'https://lh3.googleusercontent.com/aida-public/AB6AXuCcCMDym5h5s3T7DPlobeX9Kzrs4glr5pYR01lWn3tslEYUpYPu-WcgP8eNQgsQV0WiD0gO8z90srQmt1wGcJ1gK_7QJZzOYuuspTJYJLvwhQympsioBqLAOaYm4aoVh3Im2pfAAg64la4aeiNY-acg9JxIj2VCNYseRvGV0Uza_lX2-aHKRmAcJCizmaJ7wf_zjJe-uefVc95jzWtku5A2lyu8v8HjWHcDGimGQ8Q';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(`pj.${key}`)) ?? fallback; } catch { return fallback; } };
  const write = (key, value) => localStorage.setItem(`pj.${key}`, JSON.stringify(value));
  const route = (file) => { location.href = file; };
  async function exitToGuest() {
    try { await window.AuthApi?.logout(); } catch { /* 过期会话也允许退出本机 */ }
    window.AuthApi?.enterGuest();
    localStorage.removeItem('pj.profile');
    route('bills.html');
  }
  window.PeachExitToGuest = exitToGuest;
  const money = (n) => `¥${Number(n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const today = () => new Date().toLocaleDateString('sv-SE');
  const period = () => read('period', today().slice(0,7));
  const budgetForMonth = () => read('budgetsByMonth', {})[period()] || (period()==='2026-11' ? read('budgets', { total:4500, categories:{} }) : { total:4500, categories:{} });
  const params = new URLSearchParams(location.search);
  const safeReturn = (fallback) => {
    const target = params.get('return');
    return /^(bills|bills-empty|budget|budget-empty|budget-exceeded|profile|stats|stats-empty)\.html$/.test(target || '') ? target : fallback;
  };
  const notify = (message, root = document.body) => {
    let node = $('#app-message');
    if (!node) { node = document.createElement('p'); node.id = 'app-message'; node.setAttribute('role', 'status'); node.style.cssText = 'margin:12px 0;color:#79243f;font:14px/1.5 system-ui'; root.append(node); }
    node.textContent = message;
  };
  function dialog(title, fields, onSubmit) {
    const overlay = document.createElement('div'); overlay.className = 'app-dialog';
    const form = document.createElement('form'); form.className = 'app-dialog__card';
    const h2 = document.createElement('h2'); h2.textContent = title; form.append(h2);
    for (const field of fields) {
      const label = document.createElement('label'); label.textContent = field.label; label.htmlFor = `app-${field.name}`;
      const control = document.createElement(field.kind === 'textarea' ? 'textarea' : 'input');
      control.id = `app-${field.name}`; control.name = field.name;
      if (control.tagName === 'INPUT') control.type = field.type || 'text';
      if (field.value != null) control.value = field.value;
      if (field.required !== false) control.required = true;
      if (field.maxLength) control.maxLength = field.maxLength;
      form.append(label, control);
    }
    const error = document.createElement('p'); error.className = 'app-form-error'; error.setAttribute('role', 'alert'); form.append(error);
    const actions = document.createElement('div'); actions.className = 'app-dialog__actions';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = '取消'; cancel.onclick = () => overlay.remove();
    const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = '保存';
    actions.append(cancel, submit); form.append(actions); overlay.append(form); document.body.append(overlay);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      try { await onSubmit(values); overlay.remove(); } catch (problem) { error.textContent = problem.message || String(problem); }
    });
    overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });
    form.querySelector('input,textarea')?.focus();
  }
  const usernameValid = (name) => /^[\p{L}\p{N}_]{3,20}$/u.test(name) && /[\p{L}\p{N}]/u.test(name);

  function initAuth() {
    const form = page === 'auth.html' ? $('#auth-form') : $('form');
    if (!form || !window.AuthApi) return;
    const action = page === 'auth.html' ? 'login' : 'register';
    const button = page === 'auth.html' ? $('#btn-login-only') : $('button[type="submit"]', form);
    const error = document.createElement('p'); error.className = 'app-form-error'; error.setAttribute('role', 'alert');
    if (page === 'auth.html') button?.parentElement?.after(error); else button?.after(error);
    /* 两个页面的按钮里图标 span 位置不一致，按「非 material-symbols 的文字 span」找文案节点 */
    const label = [...button.children].find((node) => node.tagName === 'SPAN' && !node.classList.contains('material-symbols-outlined') && node.textContent.trim()) || button;
    const idleText = label.textContent;
    const restore = () => { button.disabled = false; label.textContent = idleText; };

    /* 锁定与频控都在服务端（ACC-02 规则5），前端只做文案兜底：
       把 retry_after_seconds 走成倒计时，时间没到就不让人反复提交去撞墙。 */
    function countdown(seconds) {
      const until = Date.now() + seconds * 1000;
      const tick = () => {
        const left = Math.ceil((until - Date.now()) / 1000);
        if (left <= 0) { clearInterval(timer); restore(); error.textContent = '尝试次数太多，请稍后再试'; return; }
        button.disabled = true;
        label.textContent = `请 ${left} 秒后再试`;
      };
      const timer = setInterval(tick, 1000);
      tick();
    }

    const submit = async (event) => {
      event.preventDefault(); event.stopImmediatePropagation();
      const name = ($('#username')?.value || '').trim().toLowerCase();
      const password = $('#password')?.value || '';
      const consent = page === 'auth.html' ? $('#privacy-check') : $('#agreementCheck');
      if (!usernameValid(name)) { error.textContent = '用户名要 3–20 位，可用中文、字母、数字或下划线，不能有空格。'; return; }
      if (password.length < 6 || password.length > 64) { error.textContent = '密码长度应为 6–64 位。'; return; }
      if (!consent?.checked) { error.textContent = '请先勾选并同意隐私条款。'; return; }
      if (action === 'register' && password !== ($('#confirmPassword')?.value || '')) { error.textContent = '两次输入的密码不一致。'; return; }
      button.disabled = true; error.textContent = ''; label.textContent = '提交中…';
      try {
        /* 一个浏览器只保留一个登录态（ACC-02 规则7）：本机还留着上一次的 Token 就先吊销，
           否则每次登录都在服务端积一个没人认领的会话，要等 30 天才自然过期。 */
        if (window.AuthApi.isSignedIn()) await window.AuthApi.logout().catch(() => {});
        const result = action === 'register'
          ? await window.AuthApi.register(name, password)
          : await window.AuthApi.login(name, password);
        write('session', result.user.username);
        write('profile', { username: result.user.username, nickname: result.user.username, ...read('profiles', {})[result.user.username] });
        route('profile.html');
      } catch (problem) {
        if (problem.code === 'account_locked' || problem.code === 'rate_limited') countdown(problem.retryAfterSeconds || 15);
        else { error.textContent = problem.message; restore(); }
        if (problem.status === 401) $('#password').value = '';
      }
    };
    button?.addEventListener('click', submit, true);
    form.addEventListener('submit', submit, true);
    if (page === 'auth.html') {
      $('#btn-export-csv')?.addEventListener('click', (event) => {
        event.preventDefault(); event.stopImmediatePropagation();
        const rows = read('records', []);
        if (!rows.length) { notify('本机还没有账单可导出。', form); return; }
        const quote = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
        const csv = '\ufeff日期,类型,分类,金额,账户,备注\n' + rows.map((row) => [row.date,row.type==='expense'?'支出':'收入',row.category,row.amount,row.wallet,row.note].map(quote).join(',')).join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' }));
        const link = document.createElement('a');link.href=url;link.download='每日记账本-本机账单.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }, true);
    }
  }

  function initCommon() {
    // Remove generated notification controls; their demo message is not a real inbox.
    $$('button').filter((button) => $('.material-symbols-outlined', button)?.textContent.trim() === 'notifications').forEach((button) => button.remove());
    const navGroup = page.startsWith('budget') ? 'budget' : page.startsWith('stats') ? 'stats' : page.startsWith('profile') || page === 'logout.html' ? 'profile' : page.startsWith('bills') || page === 'record.html' ? 'bills' : '';
    $$('a[data-path]').forEach((link) => { if (link.dataset.path === navGroup) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
    const profile = window.AuthApi?.isSignedIn() ? read('profile', {}) : read('guestProfile', {}); const session = read('session', '');
    const nickname = window.AuthApi?.isSignedIn() ? (profile.nickname || session || '翔翔') : '请登录';
    $$('aside').forEach((aside) => {
      const card = $('div.cursor-pointer:last-child', aside) || $$('div.cursor-pointer', aside).at(-1);
      if (card) { card.style.cursor = 'pointer'; card.onclick = () => route('profile.html'); card.setAttribute('role', 'link'); card.setAttribute('tabindex', '0'); card.onkeydown = (e) => { if (e.key === 'Enter') route('profile.html'); }; }
      const label = card?.querySelector('.truncate'); if (label) label.textContent = nickname;
      const avatar = card?.querySelector('.w-9.h-9'); if (avatar) renderAvatar(avatar, profile.avatar || defaultAvatar);
      const brand = $('img', aside); if (brand) { brand.style.cursor = 'pointer'; brand.onclick = () => route('landing.html'); brand.alt = '返回着陆页'; }
    });
    $$('header').forEach((header) => {
      const avatar = header.querySelector('div.rounded-full:has(.material-symbols-outlined)');
      if (avatar && avatar.textContent.includes('person')) avatar.remove();
      const brand = header.querySelector('img'); if (brand) { brand.style.cursor = 'pointer'; brand.onclick = () => route('landing.html'); brand.alt = '返回着陆页'; }
    });
    if (page === 'bills.html') {
      const brand = $('aside .p-space-lg');
      if (brand) { brand.style.cursor = 'pointer'; brand.onclick = () => route('landing.html'); }
    }
  }
  function renderAvatar(container, data) {
    if (!data) return;
    container.classList.add('app-avatar-frame');
    container.textContent = '';
    const img = document.createElement('img'); img.src = data; img.alt = '个人头像'; img.className = 'app-avatar'; container.append(img);
  }

  function initRecord() {
    const grid = $('#category-grid'); if (!grid) return;
    const amount = $('#amount-input'); amount.value = '';
    const note = $('#note-input'); note.value = '';
    const counter = $('#note-char-counter');
    if (counter) { counter.textContent = '0/100'; note.addEventListener('input', () => { counter.textContent = `${note.value.length}/100`; }); }
    const continuous = $('#continuous-toggle'); if (continuous) { continuous.checked = false; continuous.closest('label')?.remove(); }
    const selected = { type: 'expense', category: '餐饮', icon: '🍜' };
    const defaults = { expense: [['餐饮','🍜'],['交通','🚌'],['购物','🛍️'],['住房','🏠'],['娱乐','🎮'],['医疗','💊'],['人情','🎁'],['学习','📚'],['其他','📌']], income: [['工资收入','💰'],['兼职收入','💼'],['理财收益','📈'],['红包','🧧'],['退款','↩️'],['其他收入','✨']] };
    const custom = () => {
      const saved = read('categories', { expense: [], income: [] });
      if (!Array.isArray(saved)) return saved;
      return Object.fromEntries(['expense', 'income'].map((type) => [type, saved.filter((item) => item.type === type && !defaults[type].some(([name]) => name === item.name)).map((item) => [item.name, item.icon])]));
    };
    function renderCategories() {
      grid.innerHTML = '';
      for (const [name, icon] of [...defaults[selected.type], ...custom()[selected.type]]) {
        const pill = document.createElement('button'); pill.type = 'button'; pill.className = 'cat-pill flex flex-col items-center justify-center p-2 rounded-xl bg-surface-container-low/40 transition-all';
        pill.dataset.name = name; pill.dataset.icon = icon; pill.innerHTML = `<span class="text-2xl mb-0.5"></span><span class="font-label-md text-[11px]"></span>`;
        pill.children[0].textContent = icon; pill.children[1].textContent = name;
        if (name === selected.category) pill.classList.add('app-category-selected');
        pill.onclick = () => { selected.category = name; selected.icon = icon; $('#current-category-label').textContent = name; renderCategories(); };
        grid.append(pill);
      }
      const manage = document.createElement('button'); manage.type = 'button'; manage.className = 'cat-pill flex flex-col items-center justify-center p-2 rounded-xl bg-surface-container-low'; manage.innerHTML = '<span class="text-2xl">⚙️</span><span class="text-[11px]">管理分类</span>';
      manage.onclick = () => dialog('添加自定义分类', [{ name:'name',label:'分类名称',maxLength:12 },{ name:'icon',label:'图标（可输入一个 Emoji）',value:'🌸',maxLength:4 }], ({name,icon}) => {
        name = name.trim(); icon = icon.trim() || '🌸';
        if (!name) throw Error('请输入分类名称。');
        if ([...defaults[selected.type],...custom()[selected.type]].some(([existing]) => existing === name)) throw Error('分类名称已存在。');
        const data = read('categories', null);
        if (Array.isArray(data)) { data.push({ id: crypto.randomUUID(), type: selected.type, name, icon }); write('categories', data); }
        else { const categories = custom(); categories[selected.type].push([name, icon]); write('categories', categories); }
        selected.category = name; selected.icon = icon; $('#current-category-label').textContent = name; renderCategories();
      });
      grid.append(manage);
    }
    const switchType = (type) => {
      selected.type = type; [selected.category,selected.icon] = defaults[type][0]; $('#current-category-label').textContent = selected.category;
      $('#quick-entry-modal').dataset.entryMode = type;
      $('#tab-expense').classList.toggle('bg-primary-container',type==='expense'); $('#tab-income').classList.toggle('bg-secondary',type==='income');
      $('#tab-expense').classList.toggle('text-on-secondary',type==='income'); $('#tab-income').classList.toggle('text-on-secondary',type==='income');
      const heading = $('#category-grid')?.parentElement?.querySelector('.font-semibold span:last-child'); if (heading) heading.textContent = type==='expense'?'消费分类':'收入分类';
      renderCategories();
    };
    $('#tab-expense').onclick = () => switchType('expense'); $('#tab-income').onclick = () => switchType('income');
    // The generated date and wallet tiles are upgraded to native, accessible controls.
    const tiles = grid.parentElement.nextElementSibling.querySelector('.grid.grid-cols-2');
    if (tiles) {
      tiles.className = 'app-date-wallet';
      tiles.innerHTML = '<label>日期<input id="record-date" type="date"></label><label>支付账户<select id="record-wallet"></select></label>';
      $('#record-date').value = today();
      const wallets = read('wallets', ['微信钱包','支付宝','银行卡']);
      const select = $('#record-wallet');
      for (const wallet of wallets) { const option = document.createElement('option'); option.textContent = wallet; select.append(option); }
      const add = document.createElement('option'); add.value = '__add'; add.textContent = '＋ 添加账户'; select.append(add);
      select.onchange = () => { if (select.value !== '__add') return; dialog('添加支付账户',[{name:'name',label:'账户名称',maxLength:20}],({name})=>{ name=name.trim(); if (!name) throw Error('请输入账户名称。'); if (!wallets.includes(name)) wallets.push(name); write('wallets',wallets); const option=document.createElement('option');option.textContent=name;select.add(option,select.options.length-1);select.value=name; }); select.value=wallets[0]; };
    }
    renderCategories();
    if (params.get('manage') === '1') grid.lastElementChild?.click();
    const back = () => route(safeReturn('bills.html'));
    $('#btn-close-modal').onclick = back; $('#btn-cancel').onclick = back;
    $('#btn-clear-amount').onclick = () => { amount.value='';amount.focus(); };
    $$('.quick-add-btn').forEach((button) => button.onclick = () => { amount.value = ((Number(amount.value)||0)+Number(button.dataset.val)).toFixed(2); });
    $('#btn-save-record').onclick = () => {
      const value = Number(amount.value);
      if (!Number.isFinite(value) || value <= 0 || !/^\d+(\.\d{1,2})?$/.test(amount.value.trim())) { notify('请输入大于 0 且最多两位小数的金额。', $('#quick-entry-modal')); amount.focus(); return; }
      const record = { id: crypto.randomUUID(), amount:value, type:selected.type, category:selected.category, icon:selected.icon, date:$('#record-date')?.value || today(), wallet:$('#record-wallet')?.value || '微信钱包', note:note.value.trim().slice(0,100), updatedAt:new Date().toISOString() };
      write('records', [record,...read('records',[])]); write('period',record.date.slice(0,7));
      const destination=safeReturn('bills.html');route(destination==='bills-empty.html'?'bills.html':destination==='stats-empty.html'?'stats.html':destination);
    };
    document.addEventListener('keydown',(event)=>{ if(event.key==='Escape') back(); else if(event.key==='Enter' && !event.target.closest('.app-dialog') && event.target.tagName!=='TEXTAREA'){event.preventDefault();$('#btn-save-record').click();} });
  }

  function initBudgetAdjust() {
    const category = params.get('category'); const amount = $('#budget-input'); if (!amount) return;
    const byMonth = read('budgetsByMonth', {});
    const budgets = budgetForMonth();
    const current = category ? (budgets.categories[category] ?? Number(params.get('current')) ?? 0) : budgets.total;
    amount.value = Number(params.get('suggest') || current).toLocaleString('zh-CN');
    const pageHeading = $('h1'); if (pageHeading) pageHeading.textContent = `${period().slice(0,4)}年${Number(period().slice(5,7))}月预算明细`;
    const heading = $('#budget-modal-card h2'); if (heading && category) heading.textContent = `调整「${category}」预算`;
    const monthLabel=$$('#budget-modal-card *').find((node)=>node.children.length===0&&node.textContent.trim()==='2024年4月');
    if(monthLabel)monthLabel.textContent=`${period().slice(0,4)}年${Number(period().slice(5,7))}月`;
    const dateRange=$$('*').find((node)=>node.children.length===0&&node.textContent.trim()==='4月1日 - 4月30日');
    if(dateRange)dateRange.textContent=`${Number(period().slice(5,7))}月1日 - ${Number(period().slice(5,7))}月${new Date(Number(period().slice(0,4)),Number(period().slice(5,7)),0).getDate()}日`;
    if (category) {
      const amountLabel = $$('span').find((node) => node.textContent.trim() === '本月总支出上限 (元)');
      if (amountLabel) amountLabel.textContent = `${category}月度预算 (元)`;
      const categorySpent=Number(params.get('spent'))||0;
      $$('#budget-modal-card *').filter((node)=>node.children.length===0).forEach((node)=>{
        if(node.textContent.includes('¥3,482.50'))node.textContent=node.textContent.replaceAll('¥3,482.50',money(categorySpent));
        if(node.textContent.includes('原定总预算'))node.textContent=node.textContent.replace('原定总预算','原定分类预算').replace('¥4,500.00',money(current));
        if(node.textContent.includes('预计月终结余结存'))node.textContent='分类预算可用额度';
      });
      const presets = $$('.preset-pill');
      presets.slice(0,5).forEach((button,index)=>{
        const value=Math.max(100,Math.round((Number(current)*(0.8+index*0.1))/100)*100);
        button.textContent=money(value);
      });
      presets[5]?.remove();
    }
    const back = () => route(safeReturn('budget.html'));
    const recalculate=()=>{
      const value=Number(amount.value.replace(/,/g,''))||0;
      const spent=category?(Number(params.get('spent'))||0):(period()==='2026-11'?3482.50:0)+read('records',[]).filter((record)=>record.type==='expense'&&record.date?.startsWith(period())).reduce((sum,record)=>sum+record.amount,0);
      const remaining=Math.max(0,value-spent);
      const days=Math.max(1,new Date(Number(period().slice(0,4)),Number(period().slice(5,7)),0).getDate()-(period()===today().slice(0,7)?Number(today().slice(8,10))-1:0));
      const daily=$('#preview-daily');if(daily)daily.textContent=money(remaining/days);
      const balance=$('#preview-balance');if(balance)balance.textContent=money(remaining);
    };
    amount.addEventListener('input',recalculate);
    $$('.preset-pill,#step-up-btn,#step-down-btn,#clear-budget-btn').forEach((button)=>button.addEventListener('click',recalculate));
    recalculate();
    $$('.preset-pill').forEach((button) => { button.onclick = () => { const value = Number(button.textContent.match(/[\d,]+/)?.[0]?.replace(/,/g,'')); if (value) amount.value = value.toLocaleString('zh-CN'); }; });
    $('#clear-budget-btn')?.addEventListener('click', () => { amount.value = ''; amount.focus(); });
    $('#step-up-btn')?.addEventListener('click', () => { amount.value = (Math.floor((Number(amount.value.replace(/,/g,'')) || 0) / 100) * 100 + 100).toLocaleString('zh-CN'); });
    $('#step-down-btn')?.addEventListener('click', () => { amount.value = Math.max(0, Math.ceil((Number(amount.value.replace(/,/g,'')) || 0) / 100) * 100 - 100).toLocaleString('zh-CN'); });
    $('#close-modal-btn').onclick = back; $('#cancel-btn').onclick = back;
    $('#confirm-btn').onclick = () => {
      const value = Number(amount.value.replace(/,/g,''));
      if (!Number.isFinite(value) || value <= 0) { notify('请输入大于 0 的预算金额。',$('#budget-modal-card'));amount.focus();return; }
      if (category) budgets.categories[category] = value; else budgets.total = value;
      byMonth[period()] = budgets; write('budgetsByMonth',byMonth);
      const destination=safeReturn('budget.html');route(destination==='budget-empty.html'||destination==='budget-exceeded.html'?'budget.html':destination);
    };
    document.addEventListener('keydown',(event)=>{if(event.key==='Escape')back();if(event.key==='Enter'&&event.target.tagName==='INPUT'){$('#confirm-btn').click();}});
  }

  function initBills() {
    if (!page.startsWith('bills')) return;
    const budgets=budgetForMonth();
    if(page==='bills.html'){
      $$('*').filter((node)=>node.children.length===0&&node.textContent.trim()==='¥4,500.00').forEach((node)=>node.textContent=money(budgets.total));
    }
    const records = read('records', []).filter((record)=>record.date?.startsWith(period())); if (!records.length) return;
    const section = document.createElement('section'); section.className = 'app-record-list';
    const title = document.createElement('h2'); title.textContent = `本机新记账单 · ${records.length} 笔`; section.append(title);
    records.slice(0,20).forEach((record) => {
      const row = document.createElement('div'); row.className='app-record-row';
      const detail=document.createElement('span');detail.textContent=`${record.icon} ${record.category} · ${record.date} · ${record.wallet}${record.note?` · ${record.note}`:''}`;
      const value=document.createElement('strong');value.textContent=`${record.type==='expense'?'-':'+'}${money(record.amount)}`;value.style.color=record.type==='expense'?'#9b3f5a':'#186b4d';row.append(detail,value);section.append(row);
    });
    const main=$('main');main?.prepend(section);
  }

  function initBudget() {
    if (page !== 'budget.html') return;
    const budgets = budgetForMonth();
    const localExpenses = read('records', []).filter((record)=>record.type==='expense'&&record.date?.startsWith(period()));
    const sampleMonth = period()==='2026-11';
    const totalSpent = (sampleMonth?3482.50:0) + localExpenses.reduce((sum,record)=>sum+record.amount,0);
    const title=$$('span').find((x)=>x.textContent.trim()==='11月月度总预算');
    if(title){
      title.textContent=`${Number(period().slice(5,7))}月月度总预算`;
      const card=title.closest('.rounded-2xl');
      if(card){
        const leaves=$$('*',card).filter((node)=>node.children.length===0);
        const set=(prefix,value)=>{const node=leaves.find((item)=>item.textContent.trim().startsWith(prefix));if(node)node.textContent=value;};
        const percent=budgets.total>0?totalSpent/budgets.total*100:0;
        set('已用 ',`已用 ${money(totalSpent)}`);set('总额 ',`总额 ${money(budgets.total)}`);
        set('健康 ',`${percent>=100?'已超支':percent>=80?'接近上限':'健康'} ${percent.toFixed(1)}%`);
        const remaining=leaves.find((node)=>node.textContent.trim()==='¥1,017.50');if(remaining)remaining.textContent=money(Math.max(0,budgets.total-totalSpent));
        const progress=card.querySelector('[style*="width:"]');if(progress)progress.style.width=`${Math.min(percent,100)}%`;
        const status=leaves.find((node)=>node.textContent.trim()==='未超标');if(status)status.textContent=percent>=100?'已超支':'未超标';
      }
    }
    $$('button[title="趋势统计"]').forEach((button)=>button.remove());
    $$('button[title="修改预算"]').forEach((button)=>{
      const card=button.closest('.rounded-2xl');
      const name=card?.querySelector('.font-headline-sm')?.textContent.trim()||'分类';
      const numbers=card?.textContent.match(/\/\s*¥([\d,]+\.\d\d)/);
      const current=Number(numbers?.[1]?.replace(/,/g,''))||0;
      const limitValue=budgets.categories[name]??current;
      const local=localExpenses.filter((record)=>name.includes(record.category)||record.category.includes(name.slice(0,2))).reduce((sum,record)=>sum+record.amount,0);
      const sampleSpent=Number(card?.textContent.match(/¥([\d,]+\.\d\d)\s*\/\s*¥/)?.[1]?.replace(/,/g,''))||0;
      const spent=(sampleMonth?sampleSpent:0)+local;
      button.onclick=()=>route(`budget-adjust.html?category=${encodeURIComponent(name)}&current=${current}&spent=${spent}&return=budget.html`);
      const limit=$$('span',card).find((x)=>x.textContent.trim().startsWith('/ ¥'));if(limit)limit.textContent=`/ ${money(limitValue)}`;
      const spentLabel=$$('span',card).find((x)=>x.textContent.trim()===money(sampleSpent));if(spentLabel)spentLabel.textContent=money(spent);
      const percent=limitValue>0?spent/limitValue*100:0;
      const percentLabel=$$('span',card).find((x)=>/^\d+(\.\d+)?%$/.test(x.textContent.trim()));if(percentLabel)percentLabel.textContent=`${percent.toFixed(1)}%`;
      const progress=card.querySelector('[style*="width:"]');if(progress)progress.style.width=`${Math.min(percent,100)}%`;
      const remaining=$$('span',card).at(-1);if(remaining&&/^¥[\d,]+\.\d\d$/.test(remaining.textContent.trim()))remaining.textContent=money(Math.max(0,limitValue-spent));
      const badge=card.querySelector('.mt-space-sm');if(badge){badge.textContent=percent>=100?'已超出预算':percent>=80?'已达 80% 警戒线':'额度正常';badge.style.background=percent>=100?'#ffdad6':percent>=80?'#ffdcc1':'#a4f3cd';}
    });
  }

  function initBudgetVariants() {
    if (page === 'budget-empty.html') {
      $$('button').filter((button)=>button.textContent.includes('沿用上月配置')).forEach((button)=>button.onclick=()=>{
        const [year,month]=period().split('-').map(Number);
        const previous=new Date(year,month-2,1);
        const key=`${previous.getFullYear()}-${String(previous.getMonth()+1).padStart(2,'0')}`;
        const saved=read('budgetsByMonth',{})[key]||read('budgets',{total:4500,categories:{}});
        const all=read('budgetsByMonth',{});all[period()]=structuredClone(saved);write('budgetsByMonth',all);route('budget.html');
      });
      $$('button').filter((button)=>button.textContent.includes('一键智能推荐')).forEach((button)=>button.onclick=()=>route('budget-adjust.html?suggest=4500&return=budget-empty.html'));
      $$('button').filter((button)=>button.textContent.includes('分类管理')).forEach((button)=>button.onclick=()=>route('record.html?manage=1&return=budget-empty.html'));
      $$('button').filter((button)=>button.textContent.includes('历史预算')).forEach((button)=>button.onclick=()=>route('budget.html'));
    }
    if (page === 'budget-exceeded.html') {
      $$('button').filter((button)=>button.textContent.includes('调整额度')).forEach((button)=>{
        const card=button.closest('.budget-category-card');
        const name=card?.querySelector('h3')?.textContent.trim()||card?.querySelector('.font-headline-sm')?.textContent.trim()||'分类';
        const current=Number(card?.textContent.match(/\/\s*¥([\d,]+(?:\.\d+)?)/)?.[1]?.replace(/,/g,''))||0;
        button.onclick=()=>route(`budget-adjust.html?category=${encodeURIComponent(name)}&current=${current}&return=budget-exceeded.html`);
      });
      $$('button').filter((button)=>button.textContent.includes('明细流水')).forEach((button)=>button.onclick=()=>route('bills.html'));
      $$('button').filter((button)=>button.textContent.includes('预算结转说明')).forEach((button)=>button.onclick=()=>window.alert('当前是前端原型：本月未用预算不会自动转到下月。你可以在下月预算页手动调整金额。'));
      $$('button').filter((button)=>button.textContent.includes('添加自律节流心愿')).forEach((button)=>button.onclick=()=>dialog('添加自律节流心愿',[{name:'wish',label:'本月小目标',maxLength:80}],({wish})=>{
        const value=wish.trim();if(!value)throw Error('请输入小目标。');write('budgetWish',value);notify(`本月小目标：${value}`);
      }));
      const wish=read('budgetWish','');if(wish)notify(`本月小目标：${wish}`);
    }
  }

  function initProfile() {
    if (!page.startsWith('profile') && page!=='logout.html') return;
    $$('li').filter((item)=>item.textContent.includes('退出当前账号')).forEach((item)=>{
      item.removeAttribute('onclick');
      item.setAttribute('role','button');item.setAttribute('tabindex','0');
      item.addEventListener('click', (event)=>{ event.preventDefault(); event.stopImmediatePropagation(); exitToGuest(); }, true);
      item.onkeydown=(event)=>{if(event.key==='Enter' || event.key===' '){event.preventDefault();exitToGuest();}};
    });
    const signedIn=Boolean(window.AuthApi?.isSignedIn());
    const profile=read(signedIn?'profile':'guestProfile',{});const session=read('session','');
    const identity=$$('h2').find((x)=>x.textContent.trim()==='桃桃酱');
    if(!identity)return;
    if (!signedIn) {
      identity.textContent = profile.nickname || '请登录';
      const account = identity.parentElement?.querySelector('.font-mono'); if (account) account.textContent = '本机体验';
      const bio = identity.parentElement?.parentElement?.querySelector('p'); if (bio) bio.textContent = profile.bio || '免登录体验，记录仅保存在本机浏览器';
      const avatar=identity.closest('.flex.items-start')?.querySelector('img')||identity.parentElement?.parentElement?.parentElement?.querySelector('img');
      if (avatar && profile.avatar) avatar.src=profile.avatar;
      const login = document.createElement('button'); login.type = 'button'; login.className = 'app-profile-login'; login.textContent = '立即登录'; login.onclick = () => route('auth.html');
      identity.parentElement?.parentElement?.append(login);
      const verified = $$('*').find((node) => !node.children.length && node.textContent.trim() === '已认证手友');
      if (verified) verified.textContent = '本机体验';
      const passwordEntry = $$('li').find((item) => item.textContent.includes('修改登录密码'));
      if (passwordEntry) { passwordEntry.onclick = (event) => { event.preventDefault(); event.stopImmediatePropagation(); route('auth.html'); }; passwordEntry.setAttribute('aria-label', '登录后修改密码'); }
    }
    if (signedIn) identity.textContent=profile.nickname||session||'桃桃酱';
    const account=identity.parentElement?.querySelector('.font-mono');if(account && signedIn)account.textContent=`@${profile.username||session||'访客'}`;
    const bio=identity.parentElement?.parentElement?.querySelector('p');if(bio && signedIn)bio.textContent=profile.bio||'认真记录每一笔生活，把普通的日子过成温柔浪漫的诗篇。';
    const avatar=identity.closest('.flex.items-start')?.querySelector('img')||identity.parentElement?.parentElement?.parentElement?.querySelector('img');
    if(avatar)avatar.src=profile.avatar||defaultAvatar;
    const logoutAvatar=$('#modal-logout-box img');if(logoutAvatar)logoutAvatar.src=profile.avatar||defaultAvatar;
    const logoutName=$$('#modal-logout-box *').find((node)=>node.children.length===0&&node.textContent.includes('桃桃酱 (taoxi_2026)'));
    if(logoutName)logoutName.textContent=`${profile.nickname||session||'桃桃酱'} (${profile.username||session||'访客'})`;
    const button=document.createElement('button');button.type='button';button.className='app-profile-edit';button.textContent='编辑个人资料';
    identity.parentElement?.parentElement?.append(button);
    button.onclick=()=>dialog('编辑个人资料',[{name:'nickname',label:'网名',value:profile.nickname||session||'桃桃酱',maxLength:20},{name:'bio',label:'简介',kind:'textarea',value:profile.bio||bio?.textContent||'',maxLength:100},{name:'avatar',label:'上传头像',type:'file',required:false}],async(values)=>{
      const nickname=values.nickname.trim(), bioText=values.bio.trim();
      if(!nickname)throw Error('请输入网名。');
      /* 用户名归账号服务管，本机改名等于换成另一个账号（ACC-04 规则6），所以这里不开放编辑 */
      const updated={...profile,nickname,bio:bioText};
      const file=$('#app-avatar')?.files[0];
      if(file){if(!file.type.startsWith('image/'))throw Error('请选择图片文件。');updated.avatar=await new Promise((resolve,reject)=>{const image=new Image();const url=URL.createObjectURL(file);image.onload=()=>{URL.revokeObjectURL(url);const canvas=document.createElement('canvas');canvas.width=160;canvas.height=160;const ctx=canvas.getContext('2d');const size=Math.min(image.width,image.height);ctx.drawImage(image,(image.width-size)/2,(image.height-size)/2,size,size,0,0,160,160);resolve(canvas.toDataURL('image/jpeg',.75));};image.onerror=()=>{URL.revokeObjectURL(url);reject(Error('头像图片无法读取。'));};image.src=url;});}
      write(signedIn?'profile':'guestProfile',updated);
      if(signedIn){const profiles=read('profiles',{});if(updated.username)profiles[updated.username]=updated;write('profiles',profiles);}
      location.reload();
    });
  }

  function initStats() {
    const container=$('#daily-trend');if(!container)return;
    const sample=[128,68,186,95,82,288,142,110,56,198,165,130,175,120,360,92,78];
    const records=read('records',[]); const month=period();
    const monthRecords=records.filter((record)=>record.date?.startsWith(month));
    const expense=(month==='2026-11'?3482.50:0)+monthRecords.filter((record)=>record.type==='expense').reduce((sum,record)=>sum+record.amount,0);
    const income=(month==='2026-11'?12500:0)+monthRecords.filter((record)=>record.type==='income').reduce((sum,record)=>sum+record.amount,0);
    const updateMetric=(label,value)=>{const heading=$$('span').find((node)=>node.textContent.trim()===label);const amount=heading?.closest('.rounded-2xl')?.querySelector('.font-numeric-hero');if(amount)amount.textContent=money(value);};
    updateMetric('本月总支出',expense);updateMetric('本月总收入',income);updateMetric('本月实际结余',income-expense);
    if(month!=='2026-11'){
      const heading=$$('h2').find((node)=>node.textContent.includes('支出分类占比'));
      const panel=heading?.closest('[class*="lg:col-span-6"]');
      if(panel){
        panel.innerHTML='<h2 class="font-headline-md text-headline-md text-on-surface mb-4">支出分类占比</h2><div class="app-category-summary"></div>';
        const summary=panel.querySelector('.app-category-summary');
        const totals=new Map();monthRecords.filter((record)=>record.type==='expense').forEach((record)=>totals.set(record.category,(totals.get(record.category)||0)+record.amount));
        if(!totals.size){summary.textContent='这个月还没有支出账单，记一笔后即可查看分类占比。';}
        else for(const [name,value] of [...totals].sort((a,b)=>b[1]-a[1])){
          const row=document.createElement('div');row.className='app-record-row';
          const label=document.createElement('span');label.textContent=`${name} · ${(value/expense*100).toFixed(1)}%`;
          const amount=document.createElement('strong');amount.textContent=money(value);row.append(label,amount);summary.append(row);
        }
      }
    }
    const count=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate();
    const daily=Array.from({length:count},(_,index)=>(month==='2026-11'?sample[index]||0:0)+records.filter((r)=>r.type==='expense'&&r.date===`${month}-${String(index+1).padStart(2,'0')}`).reduce((sum,r)=>sum+r.amount,0));
    const scroller=document.createElement('div');scroller.className='app-trend-scroll';
    const chart=document.createElement('div');chart.className='app-trend-chart';
    const alert=document.createElement('div');alert.className='app-trend-alert';alert.innerHTML='<span>警戒线 ¥250</span>';chart.append(alert);
    daily.forEach((value,index)=>{const day=document.createElement('div');day.className='app-trend-day';day.dataset.over=String(value>=250);day.dataset.selected=String(read('selectedDate',null)===`${month}-${String(index+1).padStart(2,'0')}`);day.style.setProperty('--bar-height',`${Math.min(value/400,1)*170}px`);day.innerHTML=`<strong>${money(value)}</strong><i></i><small>${index+1}日</small>`;day.title=`${month}-${String(index+1).padStart(2,'0')} 支出 ${money(value)}`;chart.append(day);});
    scroller.append(chart);const list=document.createElement('div');list.className='app-trend-list';
    daily.forEach((value,index)=>{const item=document.createElement('span');item.textContent=`${index+1}日 · ${money(value)}`;list.append(item);});
    container.append(scroller,list);
    const exportButton=$$('button').find((button)=>button.textContent.includes('导出为手账卡片'));
    if(exportButton){exportButton.textContent='导出每日统计 CSV';exportButton.onclick=()=>{
      const csv='\ufeff日期,支出金额\n'+daily.map((value,index)=>`${month}-${String(index+1).padStart(2,'0')},${value.toFixed(2)}`).join('\n');
      const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=`每日统计-${month}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };}
  }

  function initPeriodControls() {
    const capsules = $$('div').filter((node) => node.children.length === 3 && node.children[0].tagName === 'BUTTON' && node.children[2].tagName === 'BUTTON' &&
      node.children[0].textContent.includes('chevron_left') && node.children[2].textContent.includes('chevron_right') &&
      /\d{4}\s*年\s*\d{1,2}\s*月/.test(node.children[1].textContent));
    for (const capsule of capsules) {
      capsule.classList.add('app-period-capsule');
      const [previous, middle, next] = [...capsule.children];
      const label = $$('span', middle).find((node) => /^\d{4}\s*年\s*\d{1,2}\s*月/.test(node.textContent.trim()));
      if (!label) continue;
      const selectedDate = read('selectedDate', null);
      const display = selectedDate?.startsWith(period()) ? `${period().slice(0,4)}年${Number(period().slice(5,7))}月${Number(selectedDate.slice(8,10))}日` : `${period().slice(0,4)}年${Number(period().slice(5,7))}月`;
      label.textContent = display;
      const extra = $$('span', middle).find((node) => node !== label && node.textContent.includes('距离月底'));
      if (extra) extra.textContent = period()===today().slice(0,7) ? `距离月底 ${Math.max(0,new Date(Number(period().slice(0,4)),Number(period().slice(5,7)),0).getDate()-Number(today().slice(8,10)))} 天` : '已选月份';
      const trigger = document.createElement('button');trigger.type='button';trigger.className=`${middle.className} app-period-trigger`;
      trigger.setAttribute('aria-label',`选择日期，当前${display}`);trigger.setAttribute('aria-expanded','false');
      while (middle.firstChild) trigger.append(middle.firstChild);
      middle.replaceWith(trigger);
      previous.disabled=false;next.disabled=false;
      previous.removeAttribute('title');next.removeAttribute('title');
      previous.setAttribute('aria-label','上个月');next.setAttribute('aria-label','下个月');
      const move = (offset) => {
        const [year,month]=period().split('-').map(Number);const target=new Date(year,month-1+offset,1);
        const monthKey=`${target.getFullYear()}-${String(target.getMonth()+1).padStart(2,'0')}`;
        if(selectedDate?.startsWith(period())){const day=Math.min(Number(selectedDate.slice(8,10)),new Date(target.getFullYear(),target.getMonth()+1,0).getDate());write('selectedDate',`${monthKey}-${String(day).padStart(2,'0')}`);}
        write('period',monthKey);location.reload();
      };
      previous.onclick=()=>move(-1);next.onclick=()=>move(1);
      const popup=document.createElement('div');popup.className='app-period-popover';popup.hidden=true;
      popup.innerHTML='<h3>选择日期</h3><div class="app-period-fields"><label>年<select data-part="year"></select></label><label>月<select data-part="month"></select></label><label>日<select data-part="day"></select></label></div><div class="app-period-actions"><button type="button" data-action="today">今天</button><button type="button" data-action="cancel">取消</button><button type="button" data-action="apply">确定</button></div>';
      capsule.append(popup);
      const year=$('[data-part="year"]',popup),month=$('[data-part="month"]',popup),day=$('[data-part="day"]',popup);
      const initial=selectedDate?.startsWith(period())?selectedDate:(period()===today().slice(0,7)?today():`${period()}-01`);
      const addOptions=(select,values)=>{select.innerHTML='';for(const value of values){const option=document.createElement('option');option.value=String(value);option.textContent=String(value);select.append(option);}};
      addOptions(year,Array.from({length:22},(_,index)=>2015+index));addOptions(month,Array.from({length:12},(_,index)=>index+1));
      year.value=initial.slice(0,4);month.value=String(Number(initial.slice(5,7)));
      const fillDays=()=>{const chosen=day.value;const count=new Date(Number(year.value),Number(month.value),0).getDate();addOptions(day,Array.from({length:count},(_,index)=>index+1));day.value=String(Math.min(Number(chosen)||Number(initial.slice(8,10)),count));};
      year.onchange=fillDays;month.onchange=fillDays;fillDays();
      trigger.onclick=()=>{popup.hidden=!popup.hidden;trigger.setAttribute('aria-expanded',String(!popup.hidden));if(!popup.hidden)year.focus();};
      popup.querySelector('[data-action="cancel"]').onclick=()=>{popup.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.focus();};
      popup.querySelector('[data-action="today"]').onclick=()=>{year.value=today().slice(0,4);month.value=String(Number(today().slice(5,7)));fillDays();day.value=String(Number(today().slice(8,10)));};
      popup.querySelector('[data-action="apply"]').onclick=()=>{const date=`${year.value}-${String(month.value).padStart(2,'0')}-${String(day.value).padStart(2,'0')}`;write('selectedDate',date);write('period',date.slice(0,7));location.reload();};
    }
    if (page === 'stats.html') {
      const heading = $$('h2').find((node) => node.textContent.includes('每日支出明细走势'));
      if (heading) heading.textContent = `${Number(period().slice(5,7))}月每日支出明细走势`;
    }
  }

  initCommon();
  initPeriodControls();
  if(page==='auth.html'||page==='register.html')initAuth();
  if(page==='record.html')initRecord();
  if(page==='budget-adjust.html')initBudgetAdjust();
  // 流水、预算、统计统一由 cloud-native.js 渲染；游客与登录态使用同一套页面行为。
  initBudgetVariants();initProfile();
  if(page==='logout.html' && !window.AuthApi?.isSignedIn()){
    $$('button').filter((button)=>button.textContent.includes('确认退出')).forEach((button)=>button.addEventListener('click',async (event)=>{
      event.preventDefault();event.stopImmediatePropagation();button.disabled=true;
      /* 退出必须让服务端一并吊销会话：只清本机 Storage 的话 Refresh Token 还能用 30 天 */
      try { await window.AuthApi?.logout(); } catch { /* 吊销失败也放行，本机退出优先 */ }
      localStorage.removeItem('pj.session');localStorage.removeItem('pj.profile');route('bills.html');
    },true));
  }
})();
