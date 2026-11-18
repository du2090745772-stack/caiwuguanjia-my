/* 视图层：流水 / 记账面板 / 账单详情 / 统计 / 我的 / 预算 / 分类管理 / 搜索 / 导出 */
(function (global) {
  'use strict';

  const Views = {};
  const h = UI.h;
  const icon = UI.icon;
  const L = () => global.Logic;

  const num = (cents) => ({ class: 'num', text: L().fmtCents(cents) });
  const catOf = (id) => Store.categoryById(id) || { name: '未分类', icon: '📌' };

  function recTime(rec) {
    const d = new Date(rec.created_at);
    if (Number.isNaN(d.getTime())) return '';
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  /* ---------------- 通用行组件 ---------------- */
  function recordRow(rec, onClick) {
    const cat = catOf(rec.category_id);
    const isExpense = rec.type === 'expense';
    const amount = h('span', { class: 'rec__amount is-' + (isExpense ? 'expense' : 'income') });
    amount.textContent = UI.signedAmount(rec.type, rec.amount);
    return h('button', {
      class: 'rec', type: 'button',
      'aria-label': L().cnDate(rec.date) + ' ' + cat.name + ' ' + (isExpense ? '支出' : '收入') + ' ' + L().fmtCents(rec.amount) + ' 元',
      onClick: () => onClick(rec)
    }, [
      h('span', { class: 'rec__icon', text: cat.icon }),
      h('span', { class: 'rec__main' }, [
        h('span', { class: 'rec__name', text: cat.name }),
        h('span', { class: 'rec__meta', text: [rec.note, recTime(rec)].filter(Boolean).join(' · ') })
      ]),
      amount
    ]);
  }

  function dayBlock(group, onClick) {
    const sumText = h('span', { class: 'day__sum' });
    const parts = [];
    if (group.expense) parts.push('出 ' + L().fmtCents(group.expense));
    if (group.income) parts.push('收 ' + L().fmtCents(group.income));
    sumText.textContent = parts.join('　');
    return h('section', { class: 'day' }, [
      h('div', { class: 'day__head' }, [
        h('span', { text: L().dayLabel(group.date) }),
        sumText
      ]),
      h('div', {}, group.items.map((rec) => recordRow(rec, onClick)))
    ]);
  }

  function emptyBlock(title, hint, actionLabel, onAction) {
    return h('div', { class: 'empty' }, [
      h('div', { class: 'empty__art', html: icon('heart') }),
      h('p', { class: 'empty__title', text: title }),
      hint ? h('p', { class: 'empty__hint', text: hint }) : null,
      actionLabel ? h('button', { class: 'btn', text: actionLabel, onClick: onAction }) : null
    ]);
  }

  function banner(opts) {
    const node = h('div', { class: 'banner' + (opts.tone ? ' banner--' + opts.tone : ''), role: 'status' }, [
      h('span', { html: icon(opts.icon || 'target'), style: 'color:var(--brand-press);display:flex' }),
      h('span', { text: opts.text })
    ]);
    (opts.actions || []).forEach((a) => {
      node.appendChild(h('button', {
        class: 'btn btn--ghost', style: 'min-height:34px;padding:0 14px;font-size:var(--fs-aux)',
        text: a.label,
        onClick: () => a.onClick(node)
      }));
    });
    if (opts.onClose) {
      node.appendChild(h('button', {
        class: 'icon-btn banner__close', style: 'width:32px;height:32px',
        'aria-label': '关闭提示', html: icon('close'), onClick: () => opts.onClose(node)
      }));
    }
    return node;
  }

  function budgetCard(ym, spent) {
    const budget = Store.budgetFor(ym);
    const st = L().budgetStatus(budget, spent);
    if (st.level === 'none') {
      if (UI.careOn()) return null;
      return h('div', { class: 'card budget' }, [
        h('div', { class: 'budget__head' }, [
          h('span', { text: '还没设预算' }),
          h('button', { class: 'btn btn--text', text: '设置本月预算', onClick: () => (location.hash = '#/budget') })
        ])
      ]);
    }
    const card = h('div', { class: 'card budget', dataset: { level: st.level } }, [
      h('div', { class: 'budget__head' }, [
        h('span', { text: UI.t('budget') + ' ¥' + L().fmtCents(budget) }),
        h('span', { class: 'num', text: Math.round(st.pct) + '%' })
      ]),
      h('div', { class: 'budget__bar', role: 'progressbar', 'aria-valuenow': Math.round(st.pct), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': UI.t('budgetUsed') },
        [h('div', { class: 'budget__fill' })]),
      h('div', { class: 'budget__foot' })
    ]);
    const foot = card.lastChild;
    if (st.remaining >= 0) foot.textContent = UI.t('budgetLeft') + ' ¥' + L().fmtCents(st.remaining);
    else foot.textContent = '超出 ¥' + L().fmtCents(-st.remaining);
    UI.raf(() => {
      card.querySelector('.budget__fill').style.width = Math.min(100, st.pct) + '%';
    });
    return card;
  }

  function deltaText(cur, prev, isCost) {
    const c = L().change(cur, prev);
    if (c.dir === 'none') return null;
    const cls = 'delta' + (c.dir === 'up' ? (isCost ? ' is-up' : ' is-down') : c.dir === 'down' ? (isCost ? ' is-down' : ' is-up') : '');
    const span = h('span', { class: cls });
    const cap = c.pct != null && Math.abs(c.pct) >= 1000;
    const pctText = c.pct == null ? '' : (cap ? '10倍以上' : c.pct.toFixed(1) + '%');
    if (c.dir === 'flat') span.textContent = '与上期基本持平';
    else if (UI.careOn()) span.textContent = (c.dir === 'up' ? '比上期多用 ' : '比上期少用 ') + pctText;
    else span.textContent = '较上期 ' + (c.dir === 'up' ? '+' : '-') + pctText;
    return span;
  }

  /* ---------------- PG-01 流水页 ---------------- */
  Views.flow = function flow(container) {
    const st = global.App.state;
    const all = Store.records();
    const ym = st.flowMonth || L().monthKey(L().todayStr());
    const range = L().periodRange('month', ym);
    const inMonth = all.filter((r) => L().inRange(r.date, range.from, range.to));
    const prevMonth = all.filter((r) => L().inRange(r.date, range.prevFrom, range.prevTo));
    const totals = L().totals(inMonth);

    container.appendChild(h('div', { class: 'sheet__bar' }, [
      h('span', { class: 'sheet__title', text: UI.careOn() ? '我的账目' : '每日记账本' }),
      h('span', { class: 'bar__spacer' }),
      h('button', {
        class: 'icon-btn', 'data-care-hide': '', 'aria-label': UI.t('search') + '账单', html: icon('search'),
        onClick: () => global.App.go('#/search')
      }),
      h('button', {
        class: 'icon-btn', 'aria-label': UI.t('mine'), html: icon('sliders'),
        onClick: () => global.App.go('#/mine')
      })
    ]));

    container.appendChild(h('div', { class: 'overview card' }, [
      h('div', { class: 'overview__row' }, [
        h('div', {}, [
          h('p', { class: 'overview__period', text: range.label + ' ' + UI.t('monthExpense') }),
          h('p', { class: 'overview__total num', text: '¥' + L().fmtCents(totals.expense) })
        ]),
        h('div', { class: 'overview__parts' }, [
          h('div', { class: 'i' }, [h('span', { text: UI.t('monthIncome') }), h('b', { class: 'num', text: '¥' + L().fmtCents(totals.income) })]),
          h('div', {}, [h('span', { text: UI.t('monthBalance') }), h('b', { class: 'num', text: (totals.balance < 0 ? '-' : '') + '¥' + L().fmtCents(Math.abs(totals.balance)) })])
        ])
      ]),
      (() => {
        const row = h('div', { style: 'display:flex;gap:12px;flex-wrap:wrap' });
        const d = deltaText(totals.expense, L().totals(prevMonth).expense, true);
        if (d) row.appendChild(d);
        const c = L().change(totals.income, L().totals(prevMonth).income, false);
        if (c.dir !== 'none') row.appendChild(deltaText(totals.income, L().totals(prevMonth).income, false));
        return row;
      })()
    ]));

    const notices = h('div', { id: 'flow-notices' });
    container.appendChild(notices);

    const budget = Store.budgetFor(ym);
    const bStatus = L().budgetStatus(budget, totals.expense);
    if (bStatus.level === 'over' && global.App.shouldRemind(ym, 'over')) {
      notices.appendChild(banner({
        tone: 'over', icon: 'target',
        text: UI.t('budgetOver') + '（' + Math.round(bStatus.pct) + '%）',
        onClose: (node) => { node.remove(); global.App.muteRemind(ym, 'over'); }
      }));
    } else if (bStatus.level === 'warn' && global.App.shouldRemind(ym, 'warn')) {
      notices.appendChild(banner({
        tone: 'warn', icon: 'target',
        text: UI.t('budgetWarn'),
        onClose: (node) => { node.remove(); global.App.muteRemind(ym, 'warn'); }
      }));
    }

    if (!Store.settings().local_notice_seen) {
      notices.appendChild(banner({
        icon: 'wallet',
        text: '账单只保存在这台设备的浏览器里，清理浏览器数据会一起删掉。',
        actions: [{
          label: '导出一份备份',
          onClick: () => { Views.exportCsv(ym); global.App.dismissLocalNotice(); }
        }, {
          label: '注册可备份',
          onClick: () => { global.App.dismissLocalNotice(); Views.openLogin({ mode: 'register' }); }
        }],
        onClose: () => global.App.dismissLocalNotice()
      }));
    } else if (L().shouldHintBackup(all.length, Store.settings().backup_hint_dismissed_at) && !Store.settings().cloud_backup_seen) {
      const signed = global.Auth.session().status !== 'none';
      const pending = global.Auth.pendingCount(all);
      const backupActions = [];
      if (!signed) {
        backupActions.push({ label: '注册可备份', onClick: (node) => { node.remove(); Views.openLogin({ mode: 'register' }); } });
      } else if (pending > 0) {
        backupActions.push({
          label: '立即备份 ' + pending + ' 笔',
          onClick: (node) => {
            const r = global.Auth.backup(Store.records());
            UI.toast(r.ok ? '已在本机生成备份快照 ' + r.count + ' 笔' : '备份没成功，本机数据没受影响');
            node.remove();
            global.App.markBackupSeen();
          }
        });
      }
      backupActions.push({ label: '现在导出', onClick: (node) => { Views.exportCsv(null); node.remove(); global.App.markBackupSeen(); } });
      notices.appendChild(banner({
        icon: 'download',
        text: '已经记了 ' + all.length + ' 笔，定期备份更安心。',
        actions: backupActions,
        onClose: (node) => { node.remove(); global.App.dismissBackupHint(); }
      }));
    }

    const budgetCardNode = budgetCard(ym, totals.expense);
    if (budgetCardNode) container.appendChild(budgetCardNode);

    const groups = L().groupByDay(inMonth);
    const listWrap = h('div', { class: 'workbench' });
    const main = h('div', {});
    const listEl = h('div', {});
    main.appendChild(listEl);
    listWrap.appendChild(main);

    let cursor = 0;
    let sentinel = null;
    const PAGE = 6;

    function append(n) {
      const next = groups.slice(cursor, cursor + n);
      next.forEach((g) => listEl.insertBefore(dayBlock(g, (rec) => Views.openDetail(rec.id)), sentinel));
      cursor += next.length;
      if (cursor >= groups.length && sentinel) { sentinel.remove(); sentinel = null; }
      return next.length;
    }

    if (!groups.length) {
      listEl.appendChild(all.length
        ? emptyBlock(range.label + '还没有记录', '换个月份看看，或直接记下今天的一笔', UI.t('record'), () => Views.openAdd())
        : emptyBlock(UI.t('empty'), '打开就能记，10 秒完成一笔', UI.t('record'), () => Views.openAdd()));
    } else {
      append(PAGE);
      if (cursor < groups.length) {
        sentinel = h('div', { class: 'loadmore', text: '继续下滑加载更早的记录' });
        listEl.appendChild(sentinel);
        const io = new IntersectionObserver((entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            append(8);
            if (!sentinel) io.disconnect();
          }
        }, { rootMargin: '160px' });
        io.observe(sentinel);
        global.App.registerCleanup(() => io.disconnect());
      }
    }

    const months = [...new Set(all.map((r) => L().monthKey(r.date)))].sort().reverse();
    if (!months.includes(ym)) months.unshift(ym);
    const rail = h('aside', { class: 'month-rail' }, [h('p', { class: 'month-rail__title', text: '跳至月份' })]);
    months.slice(0, 24).forEach((m) => {
      rail.appendChild(h('button', {
        type: 'button',
        'aria-current': m === ym ? 'true' : null,
        text: Number(m.slice(0, 4)) + '年' + Number(m.slice(5, 7)) + '月',
        onClick: () => { global.App.state.flowMonth = m; global.App.refresh(); }
      }));
    });
    listWrap.appendChild(rail);
    container.appendChild(listWrap);
  };

  /* ---------------- PG-02 记账面板 ---------------- */
  Views.openAdd = function openAdd(seed) {
    const settings = Store.settings();
    const s = Object.assign({
      type: 'expense',
      amount: '',
      date: L().todayStr(),
      note: '',
      categoryId: null
    }, seed || {});

    if (!s.categoryId) {
      const remembered = settings['last_category_' + s.type];
      const available = Store.categories(s.type).map((c) => c.id);
      const freq = L().topCategoryIds(Store.records(), { type: s.type, limit: 8 });
      s.categoryId = (remembered && available.includes(remembered) && remembered) || freq[0] || available[0] || null;
    }

    const isCenter = UI.isDesktop();
    const sheet = h('div', { class: isCenter ? 'sheet--dialog' : 'sheet', 'aria-label': UI.t('record') });

    const segExpense = h('button', { type: 'button', text: UI.t('expense') });
    const segIncome = h('button', { type: 'button', text: UI.t('income') });
    const segmented = h('div', { class: 'segmented', role: 'group', 'aria-label': '收支类型' }, [segExpense, segIncome]);
    const title = h('span', { class: 'sheet__title', text: UI.t('record') });
    const bar = h('div', { class: 'sheet__bar' }, [
      h('button', { class: 'icon-btn', 'aria-label': '关闭', html: icon('close'), onClick: () => controller.close('cancel') }),
      title, segmented
    ]);

    const amountValue = h('div', { class: 'amountbar__value' });
    const amountBar = h('div', { class: 'amountbar', dataset: { type: s.type } }, [
      h('span', { class: 'amountbar__cny', text: '¥' }), amountValue
    ]);

    const catGrid = h('div', { class: 'catgrid', role: 'group', 'aria-label': '选择分类' });
    const dateBtn = h('button', { type: 'button' });
    const noteBtn = h('button', { type: 'button' });
    const metaRow = h('div', { class: 'metarow' }, [dateBtn, noteBtn]);

    const keys = h('div', { class: 'keypad' });
    const saveKey = h('button', { class: 'key key--save', type: 'button', text: '保存' });
    const hint = h('p', { class: 'hint-desktop', text: '物理键盘可直接输入数字，Enter 保存，T 切换收支，Esc 关闭' });

    sheet.appendChild(bar);
    sheet.appendChild(amountBar);
    sheet.appendChild(catGrid);
    sheet.appendChild(metaRow);
    sheet.appendChild(keys);
    sheet.appendChild(hint);

    function press(ch) {
      if (ch === '.') {
        if (s.amount.includes('.')) return;
        s.amount = (s.amount || '0') + '.';
      } else if (ch === 'del') {
        s.amount = s.amount.slice(0, -1);
      } else {
        const [int] = s.amount.split('.');
        if (int.length >= 9 && !s.amount.includes('.')) return;
        s.amount = s.amount === '0' ? ch : s.amount + ch;
      }
      render();
    }

    function buildKeypad() {
      keys.innerHTML = '';
      const grid = { k1: '1', k2: '2', k3: '3', k4: '4', k5: '5', k6: '6', k7: '7', k8: '8', k9: '9', kdot: '.', k0: '0' };
      Object.keys(grid).forEach((area) => {
        keys.appendChild(h('button', {
          class: 'key', type: 'button', 'aria-label': grid[area], text: grid[area],
          style: 'grid-area:' + area, onClick: () => press(grid[area])
        }));
      });
      keys.appendChild(h('button', {
        class: 'key', type: 'button', 'aria-label': '退格', html: icon('left'), style: 'grid-area:kdel',
        onClick: () => press('del')
      }));
      saveKey.style.gridArea = 'save';
      keys.appendChild(saveKey);
    }

    function setType(type) {
      if (s.type === type) return;
      s.type = type;
      const ids = Store.categories(type).map((c) => c.id);
      if (!s.categoryId || ids.indexOf(s.categoryId) < 0) {
        const remembered = Store.settings()['last_category_' + type];
        s.categoryId = (remembered && ids.indexOf(remembered) >= 0 ? remembered : null) ||
          L().topCategoryIds(Store.records(), { type, limit: 1 })[0] || ids[0] || null;
      }
      render();
    }

    segExpense.addEventListener('click', () => setType('expense'));
    segIncome.addEventListener('click', () => setType('income'));

    function renderCategoryGrid() {
      catGrid.innerHTML = '';
      const cats = Store.categories(s.type);
      const freq = L().topCategoryIds(Store.records(), { type: s.type, limit: 8 });
      const ordered = cats.slice().sort((a, b) => {
        const ia = freq.indexOf(a.id), ib = freq.indexOf(b.id);
        if (ia < 0 && ib < 0) return a.sort - b.sort;
        if (ia < 0) return 1;
        if (ib < 0) return -1;
        return ia - ib;
      });
      const shown = ordered.length > 8 ? ordered.slice(0, 8) : ordered;
      if (s.categoryId && !shown.some((c) => c.id === s.categoryId)) {
        shown.pop();
        shown.push(cats.find((c) => c.id === s.categoryId));
      }
      shown.filter(Boolean).forEach((c) => {
        catGrid.appendChild(h('button', {
          type: 'button', 'aria-pressed': c.id === s.categoryId ? 'true' : 'false',
          onClick: () => { s.categoryId = c.id; render(); }
        }, [h('span', { class: 'emoji', text: c.icon }), h('span', { text: c.name })]));
      });
      catGrid.appendChild(h('button', {
        type: 'button', 'aria-pressed': 'false', 'aria-label': '管理分类',
        onClick: () => { controller.close('categories'); }
      }, [h('span', { class: 'emoji', html: icon('sliders') }), h('span', { text: '管理' })]));
    }

    function render() {
      const cents = L().parseAmount(s.amount);
      amountValue.textContent = s.amount || '0.00';
      amountBar.classList.toggle('is-zero', !s.amount);
      amountBar.dataset.type = s.type;
      segExpense.setAttribute('aria-pressed', String(s.type === 'expense'));
      segIncome.setAttribute('aria-pressed', String(s.type === 'income'));
      dateBtn.innerHTML = icon('calendar') + '<span>' + (s.date === L().todayStr() ? '今天' : L().cnDate(s.date)) + '</span>';
      noteBtn.innerHTML = icon('pencil') + '<span>' + (s.note ? s.note : '添加备注') + '</span>';
      saveKey.disabled = !(cents > 0 && s.categoryId);
      renderCategoryGrid();
    }

    dateBtn.addEventListener('click', () => {
      const input = h('input', { class: 'input input--num', type: 'date', value: s.date });
      const box = h('div', { class: 'sheet--dialog', style: 'padding:20px' }, [
        h('p', { class: 'chart-title', text: '选择日期' }), input,
        h('div', { class: 'confirm__acts', style: 'margin-top:16px' }, [
          h('button', { class: 'btn btn--ghost', text: '取消', onClick: () => sub.close() }),
          h('button', { class: 'btn', text: '确定', dataset: { autofocus: '' }, onClick: () => {
            if (input.value) { s.date = input.value; render(); }
            sub.close();
          } })
        ])
      ]);
      const sub = UI.openOverlay(box, { variant: 'center', label: '选择日期' });
    });

    noteBtn.addEventListener('click', () => {
      const area = h('textarea', { class: 'input', rows: 3, maxlength: 100, placeholder: '最多 100 字', value: s.note });
      const box = h('div', { class: 'sheet--dialog', style: 'padding:20px' }, [
        h('p', { class: 'chart-title', text: '备注' }), area,
        h('div', { class: 'confirm__acts', style: 'margin-top:16px' }, [
          h('button', { class: 'btn btn--ghost', text: '取消', onClick: () => sub.close() }),
          h('button', { class: 'btn', text: '保存', dataset: { autofocus: '' }, onClick: () => {
            s.note = area.value.slice(0, 100); render(); sub.close();
          } })
        ])
      ]);
      const sub = UI.openOverlay(box, { variant: 'center', label: '备注' });
    });

    function burst() {
      const layer = h('div', { class: 'burst' });
      for (let i = 0; i < 3; i++) layer.appendChild(h('span', { html: icon('heart') }));
      amountBar.appendChild(layer);
      setTimeout(() => layer.remove(), 700);
    }

    async function save(keepOpen) {
      const cents = L().parseAmount(s.amount);
      if (!(cents > 0)) { UI.toast('先填个金额'); return; }
      if (!s.categoryId) { UI.toast('选个分类'); return; }
      await Store.upsertRecord({
        type: s.type, amount: cents, category_id: s.categoryId, note: s.note, date: s.date
      });
      await Store.setSetting('last_category_' + s.type, s.categoryId);
      burst();
      UI.toast('记好啦～');
      global.App.refresh();
      if (keepOpen) {
        s.amount = '';
        s.note = '';
        render();
      } else {
        controller.close('saved');
      }
    }

    const keepOpenAfterSave = () => Store.settings().continue_mode === true;

    saveKey.addEventListener('click', () => save(keepOpenAfterSave()));

    buildKeypad();
    render();

    const controller = UI.openOverlay(sheet, {
      variant: isCenter ? 'center' : 'bottom',
      label: UI.t('record'),
      onEscape: (close) => close('cancel')
    });

    function onDocKey(e) {
      if (UI.overlays[UI.overlays.length - 1] !== controller.scrim) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'Enter') { if (tag === 'button') return; e.preventDefault(); save(keepOpenAfterSave()); return; }
      if (e.key === 't' || e.key === 'T') { e.preventDefault(); setType(s.type === 'expense' ? 'income' : 'expense'); return; }
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); press(e.key); return; }
      if (e.key === '.') { e.preventDefault(); press('.'); return; }
      if (e.key === 'Backspace') { e.preventDefault(); press('del'); return; }
    }
    document.addEventListener('keydown', onDocKey);
    controller.result.then(() => document.removeEventListener('keydown', onDocKey));

    controller.result.then((why) => {
      if (why === 'categories') global.App.go('#/categories');
    });
    return controller;
  };

  /* ---------------- PG-05 账单详情 / 编辑 ---------------- */
  Views.openDetail = function openDetail(id) {
    const rec = Store.recordById(id);
    if (!rec) return;
    const isCenter = UI.isDesktop();
    const form = {
      type: rec.type, amount: L().fmtCents(rec.amount), category_id: rec.category_id,
      date: rec.date, note: rec.note
    };

    const amountInput = h('input', { class: 'input input--num', type: 'text', inputmode: 'decimal', value: form.amount, 'aria-label': '金额' });
    const typeSeg = h('div', { class: 'segmented', role: 'group', 'aria-label': '收支类型' });
    const catSelect = h('select', { class: 'select', 'aria-label': '分类' });
    const dateInput = h('input', { class: 'input', type: 'date', value: form.date, 'aria-label': '日期' });
    const noteInput = h('textarea', { class: 'input', rows: 2, maxlength: 100, 'aria-label': '备注' });
    noteInput.value = form.note;

    function fillCats(type, keep) {
      catSelect.innerHTML = '';
      Store.categories(type).forEach((c) => {
        catSelect.appendChild(h('option', { value: c.id, text: c.icon + ' ' + c.name }));
      });
      if (keep && catSelect.querySelector('option[value="' + CSS.escape(keep) + '"]')) catSelect.value = keep;
      else catSelect.selectedIndex = 0;
    }
    fillCats(form.type, form.category_id);

    function paintType() {
      typeSeg.innerHTML = '';
      ['expense', 'income'].forEach((tp) => {
        const b = h('button', { type: 'button', text: tp === 'expense' ? UI.t('expense') : UI.t('income') });
        b.setAttribute('aria-pressed', String(form.type === tp));
        b.addEventListener('click', () => {
          if (form.type === tp) return;
          form.type = tp;
          fillCats(tp, null);
          paintType();
        });
        typeSeg.appendChild(b);
      });
    }
    paintType();

    const body = h('div', { class: isCenter ? 'drawer' : 'sheet' }, [
      h('div', { class: 'sheet__bar' }, [
        h('button', { class: 'icon-btn', 'aria-label': '关闭', html: icon('close'), onClick: () => controller.close() }),
        h('span', { class: 'sheet__title', text: '账单详情' }), typeSeg
      ]),
      h('div', { class: 'detail-form' }, [
        h('div', { class: 'field' }, [h('label', { class: 'field__label', text: '金额（元）' }), amountInput]),
        h('div', { class: 'field' }, [h('label', { class: 'field__label', text: '分类' }), catSelect]),
        h('div', { class: 'field' }, [h('label', { class: 'field__label', text: '日期' }), dateInput]),
        h('div', { class: 'field' }, [h('label', { class: 'field__label', text: '备注（选填，最多 100 字）' }), noteInput])
      ]),
      h('p', { class: 'row__sub', text: '创建于 ' + new Date(rec.created_at).toLocaleString('zh-CN') }),
      h('div', { class: 'confirm__acts', style: 'margin-top:16px' }, [
        h('button', { class: 'btn btn--ghost', text: '删除账单', onClick: onDel }),
        h('button', { class: 'btn', text: '保存修改', onClick: onSave })
      ])
    ]);

    async function onSave() {
      const cents = L().parseAmount(amountInput.value);
      if (!(cents > 0)) { UI.toast('金额要大于 0'); amountInput.focus(); return; }
      await Store.upsertRecord({
        id: rec.id, type: form.type, amount: cents, category_id: catSelect.value,
        date: dateInput.value || rec.date, note: noteInput.value.slice(0, 100)
      });
      UI.toast('已保存');
      controller.close('saved');
      global.App.refresh();
    }

    async function onDel() {
      const ok = await UI.confirmDialog({ title: '删除后不可恢复，确认删除？', okText: '删除', danger: true });
      if (!ok) return;
      await Store.deleteRecord(rec.id);
      UI.toast('已删除');
      controller.close('deleted');
      global.App.refresh();
    }

    const controller = UI.openOverlay(body, {
      variant: isCenter ? 'right' : 'bottom', label: '账单详情'
    });
    return controller;
  };

  /* ---------------- PG-03 统计页 ---------------- */
  const TREND_TITLE = { day: '本日支出', week: '本周每日支出', month: '每日支出', year: '逐月收支' };

  Views.stats = function stats(container) {
    const st = global.App.state;
    const gran = st.statsGran || 'month';
    const anchor = st.statsAnchor || L().todayStr();
    const range = L().periodRange(gran, anchor);
    const all = Store.records();
    const rows = all.filter((r) => L().inRange(r.date, range.from, range.to));
    const prevRows = all.filter((r) => L().inRange(r.date, range.prevFrom, range.prevTo));
    const totals = L().totals(rows);

    const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': '统计周期' });
    [['day', '日'], ['week', '周'], ['month', '月'], ['year', '年']].forEach(([key, label]) => {
      const b = h('button', { type: 'button', role: 'tab', text: label });
      b.setAttribute('aria-selected', String(gran === key));
      b.addEventListener('click', () => {
        st.statsGran = key;
        st.statsAnchor = key === 'year' ? L().todayStr().slice(0, 4) + '-01-01' : L().todayStr();
        global.App.refresh();
      });
      tabs.appendChild(b);
    });
    container.appendChild(tabs);

    container.appendChild(h('div', { class: 'period-nav' }, [
      h('button', { class: 'icon-btn', 'aria-label': '上一期', html: icon('left'), onClick: () => { st.statsAnchor = range.prev; global.App.refresh(); } }),
      h('span', { class: 'period-nav__label', text: range.label }),
      h('button', { class: 'icon-btn', 'aria-label': '下一期', html: icon('right'), onClick: () => { st.statsAnchor = range.next; global.App.refresh(); } })
    ]));

    const PW = { day: ['本日', '今天'], week: ['本周', '这周'], month: ['本月', '这个月'], year: ['本年', '今年'] };
    const pw = (PW[st.statsGran] || PW.month)[UI.careOn() ? 1 : 0];

    const summary = h('div', { class: 'card', style: 'margin-bottom:16px' }, [
      h('div', { class: 'overview__row' }, [
        h('div', {}, [
          h('p', { class: 'overview__period', text: pw + UI.t('expense') }),
          h('p', { class: 'overview__total num', text: '¥' + L().fmtCents(totals.expense) })
        ]),
        h('div', { class: 'overview__parts' }, [
          h('div', { class: 'i' }, [h('span', { text: pw + UI.t('income') }), h('b', { class: 'num', text: '¥' + L().fmtCents(totals.income) })]),
          h('div', {}, [h('span', { text: UI.careOn() ? pw + '还剩' : pw + UI.t('balance') }), h('b', { class: 'num', text: (totals.balance < 0 ? '-' : '') + '¥' + L().fmtCents(Math.abs(totals.balance)) })])
        ])
      ]),
      h('div', { style: 'display:flex;gap:12px;flex-wrap:wrap;margin-top:8px' }, [
        deltaText(totals.expense, L().totals(prevRows).expense, true),
        deltaText(totals.income, L().totals(prevRows).income, false)
      ].filter(Boolean))
    ]);
    container.appendChild(summary);

    const grid = h('div', { class: 'stat-grid' });
    container.appendChild(grid);

    const shareCard = h('div', { class: 'card' }, [h('h3', { class: 'chart-title', text: '分类占比（' + UI.t('expense') + '）' })]);
    const shareWrap = h('div', { class: 'chart-wrap' });
    shareCard.appendChild(shareWrap);
    grid.appendChild(shareCard);

    const share = L().categoryShare(rows, 'expense', Store.categories());
    Charts.donut(shareWrap, {
      items: share.items,
      centerLabel: UI.t('expense'),
      centerValue: L().fmtCents(share.total),
      onSelect: (item) => openDrill(item, rows)
    });

    const trendCard = h('div', { class: 'card' }, [
      h('h3', { class: 'chart-title', text: TREND_TITLE[gran] })
    ]);
    const trendWrap = h('div', { class: 'chart-wrap' });
    trendCard.appendChild(trendWrap);
    grid.appendChild(trendCard);

    if (gran === 'year') {
      const series = L().monthlySeries(all, anchor.slice(0, 4));
      Charts.lines(trendWrap, {
        xLabels: series.map((m) => m.month + '月'),
        series: [
          { name: UI.t('expense'), color: '#FF6B8A', values: series.map((m) => m.expense) },
          { name: UI.t('income'), color: '#7BC8A4', values: series.map((m) => m.income) }
        ],
        onSelect: (p) => {
          st.statsGran = 'month';
          st.statsAnchor = anchor.slice(0, 4) + '-' + String(p.index + 1).padStart(2, '0') + '-01';
          global.App.refresh();
        }
      });
    } else {
      const days = [];
      let cursor = range.from;
      while (cursor <= range.to) {
        const dayRows = rows.filter((r) => r.date === cursor);
        days.push({
          key: cursor,
          label: L().dayLabel(cursor),
          value: L().sumBy(dayRows, 'expense'),
          isToday: cursor === L().todayStr(),
          tickLabel: (Number(cursor.slice(8, 10)) % 5 === 1 || cursor === range.to) ? Number(cursor.slice(8, 10)) : null,
          date: cursor
        });
        cursor = L().addDays(cursor, 1);
      }
      Charts.bars(trendWrap, {
        data: days,
        onSelect: (d) => {
          st.statsGran = 'day';
          st.statsAnchor = d.date;
          global.App.refresh();
        }
      });
    }
  };

  function openDrill(item, rows) {
    const ids = item.ids || [item.id];
    const list = rows.filter((r) => ids.includes(r.category_id));
    const isCenter = UI.isDesktop();
    const body = h('div', { class: isCenter ? 'sheet--dialog' : 'sheet', style: isCenter ? 'padding:20px' : '' }, [
      h('div', { class: 'sheet__bar' }, [
        h('button', { class: 'icon-btn', 'aria-label': '关闭', html: icon('close'), onClick: () => controller.close() }),
        h('span', { class: 'sheet__title', text: item.name + ' · ¥' + L().fmtCents(item.cents) }),
        h('span', { class: 'legend__val', text: list.length + ' 笔' })
      ]),
      h('div', {}, list.length
        ? list.map((r) => recordRow(r, (rec) => { controller.close(); Views.openDetail(rec.id); }))
        : h('p', { class: 'empty__hint', text: '暂无明细' }))
    ]);
    const controller = UI.openOverlay(body, { variant: isCenter ? 'center' : 'bottom', label: UI.t('drillTitle') });
  }

  /* ---------------- PG-04 我的 ---------------- */
  Views.mine = function mine(container) {
    const all = Store.records();
    const settings = Store.settings();

    container.appendChild(Views.accountCard());

    container.appendChild(h('div', { class: 'card', style: 'margin-bottom:16px' }, [
      h('p', { class: 'overview__period', text: '本机账单 ' + all.length + ' 笔' }),
      h('p', { class: 'row__sub', text: '数据保存在' + (Store.storageMode() === 'idb' ? '浏览器 IndexedDB（本机）' : '浏览器本地存储（本机）') + '，换设备或清理浏览器数据前请先导出备份。' })
    ]));

    const list = h('div', { class: 'list' });
    container.appendChild(list);

    list.appendChild(h('button', { class: 'row', type: 'button', onClick: () => (location.hash = '#/budget') }, [
      h('span', { class: 'row__icon', html: icon('target') }),
      h('span', { class: 'row__main' }, [h('span', { text: UI.t('budget') })]),
      (() => {
        const sp = h('span', { class: 'row__end' });
        const b = Store.budgetFor(L().monthKey(L().todayStr()));
        sp.textContent = b ? '¥' + L().fmtCents(b) : '未设置';
        return sp;
      })(),
      h('span', { class: 'row__end', html: icon('right') })
    ]));

    list.appendChild(h('button', { class: 'row', type: 'button', onClick: () => (location.hash = '#/categories') }, [
      h('span', { class: 'row__icon', html: icon('sliders') }),
      h('span', { class: 'row__main', text: '分类管理' }),
      h('span', { class: 'row__end', html: icon('right') })
    ]));

    list.appendChild(h('button', {
      class: 'row', type: 'button', dataset: { careHide: '' }, onClick: () => (location.hash = '#/search')
    }, [
      h('span', { class: 'row__icon', html: icon('search') }),
      h('span', { class: 'row__main', text: UI.t('search') + '账单' }),
      h('span', { class: 'row__end', html: icon('right') })
    ]));

    list.appendChild(h('button', {
      class: 'row', type: 'button', dataset: { careHide: '' }, onClick: () => Views.exportPicker()
    }, [
      h('span', { class: 'row__icon', html: icon('download') }),
      h('span', { class: 'row__main', text: '导出账单（CSV）' }),
      h('span', { class: 'row__end', html: icon('right') })
    ]));

    container.appendChild(h('p', { class: 'section-title', text: '显示与易用' }));
    const prefs = h('div', { class: 'list' });
    container.appendChild(prefs);

    const careSwitch = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(!!settings.care_mode), 'aria-label': '关怀模式' });
    careSwitch.addEventListener('click', () => global.App.setCare(!settings.care_mode));
    prefs.appendChild(h('div', { class: 'row' }, [
      h('span', { class: 'row__main' }, [
        h('span', { text: '关怀模式（长辈友好）' }),
        h('p', { class: 'row__sub', text: '字号放大、按钮加大、简化页面' })
      ]), careSwitch
    ]));

    const themeSeg = h('div', { class: 'segmented', role: 'group', 'aria-label': '主题' });
    [['auto', '跟随系统'], ['light', '浅色'], ['dark', '深色']].forEach((opt) => {
      themeSeg.appendChild(h('button', {
        type: 'button', text: opt[1],
        'aria-pressed': String((settings.theme || 'auto') === opt[0]),
        onClick: () => global.App.setTheme(opt[0])
      }));
    });
    prefs.appendChild(h('div', { class: 'row row--wrap' }, [
      h('span', { class: 'row__main' }, [
        h('span', { text: '主题' }),
        h('p', { class: 'row__sub', text: '默认跟随系统的深浅色设置' })
      ]), themeSeg
    ]));

    const contSwitch = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(settings.continue_mode === true), 'aria-label': '连续记账' });
    contSwitch.addEventListener('click', async () => {
      const next = settings.continue_mode !== true;
      await Store.setSetting('continue_mode', next);
      contSwitch.setAttribute('aria-checked', String(next));
      UI.toast(next ? '保存后留在面板继续记' : '保存后自动关闭面板');
    });
    prefs.appendChild(h('div', { class: 'row' }, [
      h('span', { class: 'row__main' }, [
        h('span', { text: '连续记账' }),
        h('p', { class: 'row__sub', text: '补记多笔时不清空日期与分类' })
      ]), contSwitch
    ]));

    container.appendChild(h('p', { class: 'section-title', text: '数据' }));
    const data = h('div', { class: 'list' });
    container.appendChild(data);

    data.appendChild(h('div', { class: 'row' }, [
      h('span', { class: 'row__main' }, [
        h('span', { text: '隐私与数据说明' }),
        h('p', { class: 'row__sub', text: '记账内容不上传；注册与登录只用到用户名，演示环境的账号与备份同样只存在这台设备里。导出与删除随时可用。' })
      ])
    ]));

    data.appendChild(h('button', {
      class: 'row', type: 'button', onClick: async () => {
        const ok = await UI.confirmDialog({
          title: '清空本机全部账单？',
          text: '包含 ' + all.length + ' 笔账单、预算与自定义分类，删除后不可恢复。建议先导出 CSV。',
          okText: '我确定，清空', danger: true
        });
        if (!ok) return;
        await Store.wipe();
        global.Auth.wipeAll();
        UI.toast('已清空');
        global.App.go('#/flow');
      }
    }, [
      h('span', { class: 'row__icon', html: icon('trash') }),
      h('span', { class: 'row__main', text: '清空本机数据' }),
      h('span', { class: 'row__end', html: icon('right') })
    ]));

    container.appendChild(h('p', { class: 'section-title', text: '关于' }));
    container.appendChild(h('div', { class: 'row' }, [
      h('span', { class: 'row__main', text: '每日记账本 Web V1.0.1（登录演示）' }),
      h('span', { class: 'row__end', text: 'PRD V1.0.1' })
    ]));
  };

  /* ---------------- PG-06 预算设置 ---------------- */
  Views.budget = function budget(container) {
    const ym = global.App.state.budgetMonth || L().monthKey(L().todayStr());
    const range = L().periodRange('month', ym);
    const spent = L().sumBy(Store.records().filter((r) => L().inRange(r.date, range.from, range.to)), 'expense');
    const current = Store.budgetFor(ym);

    container.appendChild(h('div', { class: 'sheet__bar' }, [
      h('button', { class: 'icon-btn', 'aria-label': '返回', html: icon('left'), onClick: () => global.App.go('#/mine') }),
      h('span', { class: 'sheet__title', text: UI.t('budget') + '设置' })
    ]));

    const input = h('input', {
      class: 'input input--num', type: 'text', inputmode: 'decimal', dataset: { autofocus: '' },
      'aria-label': '每月预算金额（元）', value: current ? L().fmtCents(current) : ''
    });
    const card = h('div', { class: 'card' }, [
      h('div', { class: 'field' }, [h('label', { class: 'field__label', text: Number(ym.slice(0, 4)) + '年' + Number(ym.slice(5, 7)) + '月 ' + UI.t('budget') + '（元）' }), input]),
      h('p', { class: 'row__sub', style: 'margin-top:8px', text: '预算按自然月计算，只统计支出。' }),
      h('div', { class: 'confirm__acts', style: 'margin-top:16px' }, [
        current ? h('button', {
          class: 'btn btn--ghost', text: '取消预算', onClick: async () => {
            await Store.setBudget(ym, null);
            UI.toast('已取消');
            global.App.refresh();
          }
        }) : null,
        h('button', {
          class: 'btn', text: '保存', onClick: async () => {
            const cents = L().parseAmount(input.value);
            if (!(cents > 0)) { UI.toast('填一个大于 0 的金额'); input.focus(); return; }
            await Store.setBudget(ym, cents);
            UI.toast('预算设好啦～');
            global.App.refresh();
          }
        })
      ])
    ]);
    container.appendChild(card);
    container.appendChild(h('div', { style: 'height:16px' }));
    const preview = budgetCard(ym, spent);
    if (preview) container.appendChild(preview);
  };

  /* ---------------- PG-07 分类管理 ---------------- */
  Views.categories = function categories(container) {
    container.appendChild(h('div', { class: 'sheet__bar' }, [
      h('button', { class: 'icon-btn', 'aria-label': '返回', html: icon('left'), onClick: () => global.App.go('#/mine') }),
      h('span', { class: 'sheet__title', text: '分类管理' })
    ]));
    container.appendChild(h('p', { class: 'row__sub', text: '用上下按钮调整顺序。已被账单使用的分类不可删除，只能改名或隐藏。' }));

    const usage = new Map();
    Store.records().forEach((r) => usage.set(r.category_id, (usage.get(r.category_id) || 0) + 1));

    ['expense', 'income'].forEach((type) => {
      container.appendChild(h('p', { class: 'section-title', text: (type === 'expense' ? UI.t('expense') : UI.t('income')) + '分类' }));
      const list = h('div', { class: 'list' });
      const cats = Store.categories().filter((c) => c.type === type);

      cats.forEach((c, i) => {
        const count = usage.get(c.id) || 0;
        const row = h('div', { class: 'row' + (c.hidden ? ' is-hidden-cat' : '') }, [
          h('span', { class: 'row__icon', text: c.icon }),
          h('button', {
            class: 'row__main', type: 'button', style: 'border:0;background:none;text-align:left;font:inherit;color:inherit',
            onClick: () => openEditor(c, cats.length),
            title: '编辑分类'
          }, [h('span', { text: c.name + (c.hidden ? '（已隐藏）' : '') }), h('p', { class: 'row__sub', text: count + ' 笔账单使用' })]),
          h('span', { class: 'mini-actions' }, [
            h('button', {
              type: 'button', 'aria-label': '上移', disabled: i === 0, html: icon('up'),
              onClick: () => move(cats, i, -1)
            }),
            h('button', {
              type: 'button', 'aria-label': '下移', disabled: i === cats.length - 1, html: icon('down'),
              onClick: () => move(cats, i, 1)
            }),
            h('button', {
              type: 'button', 'aria-label': c.hidden ? '显示' : '隐藏', html: icon(c.hidden ? 'check' : 'minus'),
              onClick: async () => {
                await Store.upsertCategory(Object.assign({}, c, { hidden: !c.hidden }));
                global.App.refresh();
              }
            }),
            count === 0 ? h('button', {
              type: 'button', 'aria-label': '删除', html: icon('trash'),
              onClick: async () => {
                const ok = await UI.confirmDialog({ title: '删除分类', text: '删除后不可恢复，确认删除「' + c.name + '」？', okText: '删除', danger: true });
                if (!ok) return;
                await Store.deleteCategory(c.id);
                global.App.refresh();
              }
            }) : null
          ])
        ]);
        list.appendChild(row);
      });

      list.appendChild(h('button', {
        class: 'row', type: 'button', onClick: () => openEditor(null, cats.length, type)
      }, [
        h('span', { class: 'row__icon', html: icon('plus') }),
        h('span', { class: 'row__main', text: '新增分类' })
      ]));
      container.appendChild(list);
    });

    async function move(cats, index, delta) {
      const target = index + delta;
      if (target < 0 || target >= cats.length) return;
      const arr = cats.slice();
      const tmp = arr[index];
      arr[index] = arr[target];
      arr[target] = tmp;
      await Store.replaceCategories(
        Store.categories().map((c) => {
          const pos = arr.findIndex((x) => x.id === c.id);
          return pos < 0 ? c : Object.assign({}, c, { sort: pos });
        })
      );
      global.App.refresh();
    }

    function openEditor(cat, count, forcedType) {
      const type = cat ? cat.type : (forcedType || 'expense');
      const ICONS = ['🍜', '🚌', '🛍️', '🏠', '🎮', '💊', '🎁', '📚', '📌', '💰', '📈', '💼', '🧧', '✈️', '🐱', '☕', '🎬', '🏋️', '💄', '🔧'];
      let picked = cat ? cat.icon : ICONS[0];
      const nameInput = h('input', { class: 'input', maxlength: 10, value: cat ? cat.name : '', 'aria-label': '分类名称', dataset: { autofocus: '' } });
      const grid = h('div', { class: 'chip-row' });
      ICONS.forEach((em) => {
        const b = h('button', { class: 'chip', type: 'button', text: em, 'aria-pressed': String(em === picked) });
        b.addEventListener('click', () => {
          picked = em;
          grid.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', String(x.textContent === em)));
        });
        grid.appendChild(b);
      });

      const box = h('div', { class: 'sheet--dialog', style: 'padding:20px' }, [
        h('p', { class: 'chart-title', text: cat ? '编辑分类' : '新增分类' }),
        h('div', { class: 'field' }, [h('label', { class: 'field__label', text: '名称（最多 10 字）' }), nameInput]),
        h('div', { class: 'field', style: 'margin-top:12px' }, [h('label', { class: 'field__label', text: '图标' }), grid]),
        h('div', { class: 'confirm__acts', style: 'margin-top:20px' }, [
          cat ? h('button', {
            class: 'btn btn--ghost', text: '删除', onClick: async () => {
              const used = usage.get(cat.id) || 0;
              if (used) { UI.toast('该分类已用于 ' + used + ' 笔账单，只能改名或隐藏'); return; }
              const ok = await UI.confirmDialog({ title: '删除分类「' + cat.name + '」？', okText: '删除', danger: true });
              if (!ok) return;
              await Store.deleteCategory(cat.id);
              sub.close();
              global.App.refresh();
            }
          }) : null,
          h('button', { class: 'btn', text: '保存', onClick: async () => {
            const name = nameInput.value.trim();
            if (!name) { UI.toast('给分类起个名字'); nameInput.focus(); return; }
            await Store.upsertCategory({ id: cat ? cat.id : undefined, name, icon: picked, type, sort: cat ? cat.sort : count });
            sub.close();
            global.App.refresh();
          } })
        ])
      ]);
      const sub = UI.openOverlay(box, { variant: 'center', label: cat ? '编辑分类' : '新增分类' });
    }
  };

  /* ---------------- PG-08 搜索 ---------------- */
  Views.search = function search(container) {
    const st = global.App.state;
    const f = st.filters || (st.filters = {});

    container.appendChild(h('div', { class: 'sheet__bar' }, [
      h('button', { class: 'icon-btn', 'aria-label': '返回', html: icon('left'), onClick: () => global.App.go('#/flow') }),
      h('span', { class: 'sheet__title', text: UI.t('search') + '账单' })
    ]));

    const q = h('input', { class: 'input', type: 'search', placeholder: '备注或分类名', value: f.q || '', 'aria-label': '关键词', dataset: { autofocus: '' } });
    q.addEventListener('input', () => { f.q = q.value; run(); });

    const typeSel = h('select', { class: 'select', 'aria-label': '收支类型' });
    [['', '全部类型'], ['expense', UI.t('expense')], ['income', UI.t('income')]].forEach(([v, label]) => {
      const o = h('option', { value: v, text: label });
      if (f.type === v) o.selected = true;
      typeSel.appendChild(o);
    });

    const minI = h('input', { class: 'input input--num', type: 'text', inputmode: 'decimal', placeholder: '最低', value: f.min || '', 'aria-label': '金额下限（元）' });
    const maxI = h('input', { class: 'input input--num', type: 'text', inputmode: 'decimal', placeholder: '最高', value: f.max || '', 'aria-label': '金额上限（元）' });
    const fromI = h('input', { class: 'input', type: 'date', value: f.from || '', 'aria-label': '开始日期' });
    const toI = h('input', { class: 'input', type: 'date', value: f.to || '', 'aria-label': '结束日期' });

    const filters = h('div', { class: 'filters' }, [
      h('div', { class: 'field' }, [h('label', { class: 'field__label', text: '关键词' }), q]),
      h('div', { class: 'field' }, [h('label', { class: 'field__label', text: '类型' }), typeSel]),
      h('div', { class: 'field' }, [h('label', { class: 'field__label', text: '金额区间（元）' }),
        h('div', { class: 'range' }, [minI, h('span', { class: 'row__end', text: '—' }), maxI])]),
      h('div', { class: 'field' }, [h('label', { class: 'field__label', text: '日期区间' }),
        h('div', { class: 'range' }, [fromI, h('span', { class: 'row__end', text: '—' }), toI])])
    ]);
    container.appendChild(filters);

    [typeSel, fromI, toI].forEach((n) => n.addEventListener('change', () => {
      f.type = typeSel.value; f.from = fromI.value; f.to = toI.value; run();
    }));
    [minI, maxI].forEach((n) => ['input', 'change'].forEach((ev) => n.addEventListener(ev, () => {
      f.min = minI.value; f.max = maxI.value;
      run();
    })));

    const resultBox = h('div', {});
    container.appendChild(resultBox);

    function run() {
      const centsMin = L().parseAmount(minI.value);
      const centsMax = L().parseAmount(maxI.value);
      const hits = L().filterRecords(Store.records(), {
        q: f.q, type: f.type, from: f.from, to: f.to,
        min: centsMin, max: centsMax
      }, Store.categories());
      resultBox.innerHTML = '';
      const sum = h('p', { class: 'hitcount' });
      const spent = L().sumBy(hits, 'expense');
      const got = L().sumBy(hits, 'income');
      sum.textContent = '命中 ' + hits.length + ' 笔　' +
        (UI.careOn() ? '花出去 ' : '支出 ') + L().fmtCents(spent) + '　' +
        (UI.careOn() ? '收进来 ' : '收入 ') + L().fmtCents(got);
      resultBox.appendChild(sum);
      if (!hits.length) {
        resultBox.appendChild(emptyBlock('没找到符合条件的账单', '试试放宽金额或日期区间'));
        return;
      }
      hits.slice(0, 200).forEach((r) => resultBox.appendChild(recordRow(r, (rec) => Views.openDetail(rec.id))));
      if (hits.length > 200) resultBox.appendChild(h('p', { class: 'hitcount', text: '仅显示最近 200 笔，可缩小日期区间' }));
    }
    run();
  };

  /* ---------------- 导出 CSV（PRD SET-02） ---------------- */
  Views.exportPicker = function exportPicker() {
    const all = Store.records();
    if (!all.length) { UI.toast('还没有账单可导出'); return; }
    const months = [...new Set(all.map((r) => L().monthKey(r.date)))].sort().reverse();
    const sel = h('select', { class: 'select', 'aria-label': '导出范围' });
    sel.appendChild(h('option', { value: '', text: '全部账单（' + all.length + ' 笔）' }));
    months.slice(0, 24).forEach((m) => {
      const n = all.filter((r) => L().monthKey(r.date) === m).length;
      sel.appendChild(h('option', {
        value: m, text: Number(m.slice(0, 4)) + '年' + Number(m.slice(5, 7)) + '月（' + n + ' 笔）'
      }));
    });
    const box = h('div', { class: 'sheet--dialog', style: 'padding:20px' }, [
      h('div', { class: 'sheet__bar' }, [
        h('button', { class: 'icon-btn', 'aria-label': '关闭', html: icon('close'), onClick: () => controller.close('cancel') }),
        h('span', { class: 'sheet__title', text: '导出账单' })
      ]),
      h('div', { class: 'field' }, [h('label', { class: 'field__label', text: '选择范围' }), sel]),
      h('p', { class: 'row__sub', text: 'CSV 带 UTF-8 BOM，Excel 直接打开不会乱码。' }),
      h('div', { class: 'confirm__acts', style: 'margin-top:16px' }, [
        h('button', { class: 'btn btn--ghost', text: '取消', onClick: () => controller.close('cancel') }),
        h('button', { class: 'btn', text: '导出 CSV', dataset: { autofocus: '' }, onClick: () => { Views.exportCsv(sel.value || null); controller.close('done'); } })
      ])
    ]);
    const controller = UI.openOverlay(box, { variant: UI.isDesktop() ? 'center' : 'bottom', label: '导出账单' });
  };

  Views.exportCsv = function exportCsv(ym) {
    const all = Store.records();
    let rows = all;
    let name = '全部';
    if (ym) {
      const range = L().periodRange('month', ym);
      rows = all.filter((r) => L().inRange(r.date, range.from, range.to));
      name = ym;
      if (!rows.length) { UI.toast('这个月没有账单'); return; }
    }
    const csv = L().toCsv(L().exportRows(rows, Store.categories()));
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: '每日记账本-' + name + '.csv' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    UI.toast('已导出 ' + rows.length + ' 笔账单');
  };

  /* ---------------- PG-09 登录/注册（PRD V1.0.1；演示模式：账号与密码摘要只在本机） ---------------- */
  const AUTH_DEMO_NOTE = '演示环境：用户名和密码摘要只保存在这台设备的浏览器里，不会上传到任何服务器。正式版由服务端校验密码，前端拿不到密码本身。';

  function stampText(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    const pad = (n) => (n < 10 ? '0' + n : String(n));
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function authView(container, onClose, opts) {
    const A = global.Auth;
    const o = opts || {};
    const localCount = Store.records().length;
    const st = {
      busy: false, step: 'form', mode: o.mode === 'register' ? 'register' : 'login',
      errName: '', errPass: '', errForm: '', cloud: { count: 0, at: 0 }
    };
    let passTouched = false;

    const closeBtn = h('button', { class: 'icon-btn', 'aria-label': '关闭', html: icon('close'), onClick: () => finish('cancel') });
    const bar = h('div', { class: 'sheet__bar' }, [closeBtn, h('span', { class: 'sheet__title', text: '登录 / 注册' })]);

    const hero = h('div', { class: 'auth__hero' }, [
      h('p', { class: 'auth__title', text: '给账单上个保险' }),
      h('p', { class: 'auth__sub', text: '换设备不丢，清缓存也不怕' })
    ]);

    const nameInput = h('input', {
      class: 'input', type: 'text', maxlength: A.LIMITS.NAME_MAX, 'data-autofocus': '',
      autocomplete: 'username', placeholder: '自己想一个，比如 taozi_2026', 'aria-label': '用户名'
    });
    const nameErr = h('p', { class: 'auth__err', role: 'alert' });
    const nameHint = h('p', {
      class: 'auth__hint',
      text: A.LIMITS.NAME_MIN + '–' + A.LIMITS.NAME_MAX + ' 位，可用字母、数字、下划线或中文；别用真实姓名和手机号'
    });

    const passInput = h('input', {
      class: 'input', autocomplete: 'current-password', placeholder: '至少 6 位', 'aria-label': '密码'
    });
    const eyeBtn = h('button', { class: 'icon-btn auth__eye', type: 'button', 'aria-label': '显示密码', html: icon('eye') });
    const passErr = h('p', { class: 'auth__err', role: 'alert' });
    const passHint = h('p', { class: 'auth__hint', text: '至少 ' + A.LIMITS.PASS_MIN + ' 位；别用其他网站同款密码' });

    const privacyBox = h('input', { class: 'auth__check', type: 'checkbox', id: 'auth-privacy' });
    const privacyRow = h('label', { class: 'auth__privacy', for: 'auth-privacy' }, [
      privacyBox,
      h('span', { text: '我已阅读并同意' }),
      h('span', { class: 'auth__link', text: '《隐私政策》', onClick: (e) => { e.preventDefault(); UI.alertDialog({ title: '隐私政策（演示）', text: '只用到用户名作为账号标识，不收集邮箱和手机号；记账内容不上传。演示环境的账号、密码摘要与备份快照都写在本机浏览器里。' }); } })
    ]);
    const forgotBtn = h('button', { class: 'btn btn--text auth__forgot', type: 'button', text: '忘记密码？', onClick: () => openForgot() });
    const agreeRow = h('div', { class: 'auth__agree' }, [privacyRow, forgotBtn]);

    const regBtn = h('button', { class: 'btn btn--block btn--lg', type: 'button', text: '注册并备份' });
    const loginBtn = h('button', { class: 'btn btn--block btn--lg', type: 'button', text: '登 录' });
    const btnRow = h('div', { class: 'auth__btns' }, [regBtn, loginBtn]);
    const formErr = h('p', { class: 'auth__err', role: 'alert' });
    const note = h('p', { class: 'auth__note', text: localCount ? '本机已有 ' + localCount + ' 笔账单，注册或登录后可一键备份。' : '还没有账单，注册后备份会自动跟着记账走。' });
    const disclaimer = h('p', { class: 'auth__disclaimer', text: AUTH_DEMO_NOTE });

    const form = h('div', { class: 'auth__form' }, [
      hero,
      h('div', { class: 'field' }, [
        h('label', { class: 'field__label', text: '用户名' }), nameInput, nameErr, nameHint
      ]),
      h('div', { class: 'field' }, [
        h('label', { class: 'field__label', text: '密码' }),
        h('div', { class: 'auth__pass-row' }, [passInput, eyeBtn]),
        passErr, passHint
      ]),
      agreeRow, btnRow, formErr, note, disclaimer
    ]);

    const migrate = h('div', { class: 'auth__migrate', hidden: true });
    const panel = h('div', { class: 'auth' }, [bar, form, migrate]);
    container.appendChild(panel);

    function finish(why) { onClose(why || 'cancel'); }

    function shake(node) {
      node.classList.add('is-shake');
      setTimeout(() => node.classList.remove('is-shake'), 420);
    }

    const nameRule = () => '用户名要 ' + A.LIMITS.NAME_MIN + '–' + A.LIMITS.NAME_MAX + ' 位，不能有空格';
    const passRule = () => '密码至少 ' + A.LIMITS.PASS_MIN + ' 位';

    function setPassShown(shown) {
      passInput.type = shown ? 'text' : 'password';
      eyeBtn.setAttribute('aria-label', shown ? '隐藏密码' : '显示密码');
      eyeBtn.setAttribute('aria-pressed', shown ? 'true' : 'false');
      eyeBtn.innerHTML = icon(shown ? 'eyeOff' : 'eye');
    }

    function setMode(mode) {
      st.mode = mode;
      // 注册态密码默认明文：没有邮箱可找回，打错一次就是永久失号
      if (!passTouched) setPassShown(mode === 'register');
      paint();
    }

    function openForgot() {
      const who = A.normalizeName(nameInput.value);
      if (!A.hasAccount(who)) {
        UI.alertDialog({
          title: '这台设备上没有这个用户名',
          text: '演示环境没收集邮箱，正式版的找回要走服务端。这里只能把这台设备上的账号清掉，再重新注册一个。'
        });
        return;
      }
      UI.confirmDialog({
        title: '清除这台设备上的账号？',
        text: '账单数据不会被删除，只是把 ' + who + ' 的登录状态与密码清掉，之后可以用新密码重新注册。',
        okText: '清除账号'
      }).then((ok) => {
        if (!ok) return;
        A.forgetAccount(who);
        UI.toast('已清除，重新注册即可');
        paint();
      });
    }

    function onSignedIn(res, mode) {
      st.cloud = res.cloud || { count: 0, at: 0 };
      if (mode === 'register') UI.toast('账号建好了。用户名和密码是找回账单的唯一凭据，记牢一点', 3200);
      if (!localCount) {
        UI.toast('记的账会自动带上账号');
        finish('signed_in');
        return;
      }
      st.step = 'migrate';
      renderMigrate();
    }

    function doAction(mode) {
      if (st.busy) return;
      st.mode = mode;
      st.errName = '';
      st.errPass = '';
      st.errForm = '';
      if (!A.validName(nameInput.value)) { st.errName = nameRule(); paint(); nameInput.focus(); return; }
      if (!A.validPass(passInput.value)) { st.errPass = passRule(); paint(); passInput.focus(); return; }
      if (!privacyBox.checked) { st.errForm = '先勾选同意《隐私政策》'; paint(); return; }

      st.busy = true;
      paint();
      setTimeout(() => {
        const res = mode === 'register'
          ? A.register(nameInput.value, passInput.value)
          : A.login(nameInput.value, passInput.value);
        st.busy = false;
        if (res.ok) { onSignedIn(res, mode); return; }
        if (res.reason === 'bad_name') { st.errName = nameRule(); nameInput.focus(); }
        else if (res.reason === 'bad_pass') { st.errPass = passRule(); passInput.focus(); }
        else if (res.reason === 'name_taken') {
          // 注册如实告知重名，否则用户无法理解失败原因；已填内容全部保留
          st.errName = '这个用户名已经有了，换一个，或点下面「登 录」进去';
          if (A.hasAccount(nameInput.value)) setMode('login');
          nameInput.focus();
        } else if (res.reason === 'bad_credentials') {
          // 用户名不存在与密码错误共用一句文案，不给账号枚举留口
          st.errPass = '账号或密码不对，再检查一下';
          passInput.value = '';
          shake(passInput);
          passInput.focus();
        }
        paint();
      }, 260);
    }

    function renderMigrate() {
      form.hidden = true;
      UI.clear(migrate);
      const cell = (label, value, sub) => h('div', { class: 'auth__cell' }, [
        h('p', { class: 'auth__cell-label', text: label }),
        h('p', { class: 'auth__cell-value num', text: value }),
        h('p', { class: 'auth__cell-sub', text: sub })
      ]);
      migrate.appendChild(h('h3', { class: 'auth__title', text: '要把本机账单备份吗？' }));
      migrate.appendChild(h('p', { class: 'auth__sub', text: '备份后换台设备登录同一个账号，账单就能接着用。' }));
      migrate.appendChild(h('div', { class: 'auth__compare' }, [
        cell('本机', localCount + ' 笔', '正在使用'),
        cell('备份', st.cloud.count + ' 笔', st.cloud.at ? '上次 ' + stampText(st.cloud.at) : '还没有备份')
      ]));
      migrate.appendChild(h('p', {
        class: 'row__sub',
        text: st.cloud.count
          ? '已有一份备份，再接后端后会按账单 id 去重、同一条取更新时间更新的那份（合并规则已通过单测）。'
          : '演示环境的「备份」是本机浏览器里的另一份快照，不会真正上传；接上后端后这一步才生效。'
      }));
      migrate.appendChild(h('button', {
        class: 'btn btn--block btn--lg', dataset: { autofocus: '' },
        text: '立即备份 ' + localCount + ' 笔',
        onClick: () => {
          const res = A.backup(Store.records());
          UI.toast(res.ok ? '已在本机生成备份快照 ' + res.count + ' 笔' : '备份没成功，本机数据没受影响');
          finish('signed_in');
        }
      }));
      migrate.appendChild(h('button', {
        class: 'btn btn--text btn--block', text: '暂不处理',
        onClick: () => { UI.toast('已进入登录态，稍后可在「我的」里备份'); finish('signed_in'); }
      }));
      migrate.hidden = false;
      const auto = migrate.querySelector('[data-autofocus]');
      if (auto) auto.focus();
    }

    function paint() {
      if (st.step !== 'form') return;
      nameErr.textContent = st.errName;
      nameErr.hidden = !st.errName;
      passErr.textContent = st.errPass;
      passErr.hidden = !st.errPass;
      formErr.textContent = st.errForm;
      formErr.hidden = !st.errForm;
      const usable = A.validName(nameInput.value) && A.validPass(passInput.value);
      regBtn.disabled = loginBtn.disabled = st.busy || !usable;
      regBtn.className = 'btn btn--block btn--lg' + (st.mode === 'register' ? '' : ' btn--ghost');
      loginBtn.className = 'btn btn--block btn--lg' + (st.mode === 'register' ? ' btn--ghost' : '');
      if (st.busy) regBtn.textContent = loginBtn.textContent = st.mode === 'register' ? '正在建号…' : '正在登录…';
      else { regBtn.textContent = '注册并备份'; loginBtn.textContent = '登 录'; }
    }

    nameInput.addEventListener('input', () => { st.errName = ''; st.errForm = ''; paint(); });
    nameInput.addEventListener('blur', () => {
      if (nameInput.value.trim() && !A.validName(nameInput.value)) { st.errName = nameRule(); paint(); }
    });
    passInput.addEventListener('input', () => { st.errPass = ''; st.errForm = ''; paint(); });
    passInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); doAction(st.mode); }
    });
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); passInput.focus(); }
    });
    eyeBtn.addEventListener('click', () => {
      passTouched = true;
      setPassShown(passInput.type === 'password');
      passInput.focus();
    });
    privacyBox.addEventListener('change', () => { st.errForm = ''; paint(); });
    regBtn.addEventListener('click', () => doAction('register'));
    loginBtn.addEventListener('click', () => doAction('login'));

    setMode(st.mode);
    return { focus: () => nameInput.focus() };
  }

  Views.openLogin = function openLogin(opts) {
    if (global.Auth.session().status !== 'none') {
      global.App.go('#/mine');
      UI.toast('这台设备已经登录了');
      return;
    }
    const isCenter = UI.isDesktop();
    const sheet = h('div', { class: isCenter ? 'sheet--dialog sheet--auth' : 'sheet' });
    const controller = UI.openOverlay(sheet, {
      variant: isCenter ? 'center' : 'bottom',
      label: '登录 / 注册',
      onEscape: (close) => close('cancel')
    });
    const handle = authView(sheet, (why) => controller.close(why), opts);
    if (isCenter) handle.focus();
    controller.result.then((why) => {
      if (why === 'signed_in') global.App.refresh();
    });
  };

  Views.login = function login(container) {
    if (global.Auth.session().status !== 'none') {
      global.App.go('#/mine');
      return;
    }
    const mode = (global.location.hash || '').indexOf('register') >= 0 ? 'register' : 'login';
    authView(container, (why) => global.App.go(why === 'signed_in' ? '#/mine' : '#/flow'), { mode: mode });
    if (UI.isDesktop()) container.querySelector('input[autocomplete="username"]').focus();
  };

  /* ---------------- PG-11 账号与数据管理（ACC-04） ---------------- */
  Views.accountCard = function accountCard() {
    const A = global.Auth;
    const sess = A.session();
    const local = Store.records();
    const card = h('div', { class: 'card acct' });

    if (sess.status === 'none') {
      // 注销只清登录态，冷静期必须在这里看得见、可撤销（ACC-04）
      const doomed = A.cloudSummary();
      if (doomed.deactivated_until > Date.now()) {
        card.appendChild(h('div', { class: 'acct__head' }, [
          h('span', { class: 'acct__icon', html: icon('moon') }),
          h('span', { class: 'acct__main' }, [
            h('b', { class: 'acct__mail', text: doomed.name || '' }),
            h('p', {
              class: 'row__sub',
              text: '已提交注销，' + stampText(doomed.deactivated_until) + ' 前重新登录可撤销；到期后备份被彻底删除，本机账单不受影响。'
            })
          ]),
          h('button', { class: 'btn', type: 'button', text: '重新登录', onClick: () => Views.openLogin() })
        ]));
        return card;
      }
      card.appendChild(h('div', { class: 'acct__head' }, [
        h('span', { class: 'acct__icon', html: icon('heart') }),
        h('span', { class: 'acct__main' }, [
          h('b', { text: '给账单上个保险' }),
          h('p', { class: 'row__sub', text: local.length ? '本机 ' + local.length + ' 笔账单只存在这台设备，注册后可备份。' : '注册后记账会自动带上账号。' })
        ]),
        h('button', { class: 'btn', type: 'button', text: '登录 / 注册', onClick: () => Views.openLogin() })
      ]));
      return card;
    }

    const cloud = A.cloudSummary();
    const pending = A.pendingCount(local);
    card.appendChild(h('div', { class: 'acct__head' }, [
      h('span', { class: 'acct__icon', html: icon('check') }),
      h('span', { class: 'acct__main' }, [
        h('b', { class: 'acct__mail', text: A.name() }),
        h('p', {
          class: 'row__sub',
          text: pending
            ? pending + ' 笔待备份' + (cloud.at ? '，上次备份 ' + stampText(cloud.at) : '，还没有备份过')
            : (cloud.at
              ? '已备份 ' + cloud.count + ' 笔 · ' + stampText(cloud.at)
              : '还没备份过，记的账都先留在本机')
        })
      ])
    ]));

    const acts = h('div', { class: 'acct__acts' });
    acts.appendChild(h('button', {
      class: 'btn' + (pending ? '' : ' btn--ghost'), type: 'button',
      text: pending ? '立即备份 ' + pending + ' 笔' : '重新备份 ' + cloud.count + ' 笔',
      onClick: () => {
        const r = A.backup(Store.records());
        UI.toast(r.ok ? '已在本机生成备份快照 ' + r.count + ' 笔' : '备份没成功，本机数据没受影响');
        global.App.refresh();
      }
    }));
    acts.appendChild(h('button', {
      class: 'btn btn--text', type: 'button', text: '退出登录',
      onClick: async () => {
        const ok = await UI.confirmDialog({
          title: '退出登录？',
          text: '备份与账号里的数据都保留，本机账单也保留但不再同步。随时可以重新登录。',
          okText: '退出登录'
        });
        if (!ok) return;
        A.logout();
        UI.toast('已退出登录');
        global.App.refresh();
      }
    }));
    card.appendChild(acts);

    card.appendChild(h('button', {
      class: 'acct__deactivate', type: 'button', text: '注销账号并删除备份',
      onClick: () => Views.openDeactivate()
    }));
    return card;
  };

  Views.openDeactivate = function openDeactivate() {
    const A = global.Auth;
    const who = A.name() || '';
    const typed = h('input', { class: 'input', type: 'text', 'aria-label': '输入本人用户名确认注销', placeholder: who });
    const exported = h('input', { class: 'auth__check', type: 'checkbox', id: 'auth-exported' });
    const okBtn = h('button', { class: 'btn btn--danger', type: 'button', text: '确认注销', disabled: true });

    const box = h('div', { class: 'sheet--dialog sheet--auth' }, [
      h('div', { class: 'sheet__bar' }, [
        h('button', { class: 'icon-btn', 'aria-label': '关闭', html: icon('close'), onClick: () => controller.close('cancel') }),
        h('span', { class: 'sheet__title', text: '注销账号' })
      ]),
      h('p', { text: '注销只删备份那份数据，本机账单不受影响。7 天后备份会被彻底删除且不可恢复，期内重新登录可以撤销。' }),
      h('label', { class: 'auth__privacy', for: 'auth-exported' }, [
        exported, h('span', { text: '我已先导出 CSV，把数据留在自己手里' })
      ]),
      h('button', { class: 'btn btn--ghost btn--block', type: 'button', text: '导出全部账单（CSV）', onClick: () => Views.exportCsv(null) }),
      h('div', { class: 'field', style: 'margin-top:12px' }, [
        h('label', { class: 'field__label', text: '输入 ' + who + ' 确认' }), typed
      ]),
      h('div', { class: 'confirm__acts' }, [
        h('button', { class: 'btn btn--ghost', type: 'button', text: '再想想', onClick: () => controller.close('cancel') }),
        okBtn
      ])
    ]);

    function paintOk() {
      okBtn.disabled = !(A.normalizeName(typed.value) === who && exported.checked);
    }
    typed.addEventListener('input', paintOk);
    exported.addEventListener('change', paintOk);
    okBtn.addEventListener('click', async () => {
      const sure = await UI.confirmDialog({
        title: '确定要注销吗？',
        text: '7 天冷静期后备份将被彻底删除，这一步不可撤销。',
        okText: '确认注销', danger: true
      });
      if (!sure) return;
      const r = A.deactivate(typed.value);
      controller.close('done');
      if (r.ok) {
        UI.toast('已提交注销，' + stampText(r.grace_until) + ' 前重新登录可撤销', 3000);
        global.App.refresh();
      } else {
        UI.toast('用户名与登录账号不一致');
      }
    });

    const controller = UI.openOverlay(box, { variant: 'center', label: '注销账号' });
  };

  global.Views = Views;
})(window);
