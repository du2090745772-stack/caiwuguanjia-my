/* UI 基座：DOM 构造、图标、弹层/抽屉、Toast、确认框、关怀模式文案分层（PRD CARE-02） */
(function (global) {
  'use strict';

  const PATHS = {
    flow: 'M4 6h16M4 12h16M4 18h11',
    plus: 'M12 5v14M5 12h14',
    stats: 'M4 19V5M4 19h16M8.5 19v-6M13 19v-9M17.5 19v-4',
    user: 'M12 11a3.4 3.4 0 1 0 0-6.8A3.4 3.4 0 0 0 12 11zM5.4 20c1.4-3.4 3.8-5 6.6-5s5.2 1.6 6.6 5',
    close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
    left: 'M14.5 5.5L8 12l6.5 6.5',
    right: 'M9.5 5.5L16 12l-6.5 6.5',
    up: 'M5.5 14.5L12 8l6.5 6.5',
    down: 'M5.5 9.5L12 16l6.5-6.5',
    search: 'M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM15.6 15.6L20 20',
    calendar: 'M4.5 7.5h15v12a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19.5v-12zM4.5 11.5h15M8.5 4.5v4M15.5 4.5v4',
    pencil: 'M5 19h4l9.5-9.5-4-4L5 15v4zM13.5 6.5l4 4',
    trash: 'M5 7h14M9.5 7V5.2h5V7M7 7l.9 12.1h8.2L17 7',
    download: 'M12 4.5v9.5M8 11l4 4 4-4M5 19.5h14',
    check: 'M5.5 12.8l4.2 4.2L19 8',
    target: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 16.2a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4zM12 13.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z',
    wallet: 'M4.5 8.5h15v10.5a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5v-10.5zM4.5 8.5l1.8-3.2h11.4l1.8 3.2M16 13.8h1.6',
    heart: 'M12 19.6s-6.6-4.3-6.6-9A3.7 3.7 0 0 1 12 8.6a3.7 3.7 0 0 1 6.6 2c0 4.7-6.6 9-6.6 9z',
    sliders: 'M5 8h9M17.5 8H19M5 16h3M11.5 16H19M14.5 8a2.2 2.2 0 1 1 0-.1M8.5 16a2.2 2.2 0 1 1 0-.1',
    moon: 'M19 14.4A7.4 7.4 0 1 1 9.6 5a6 6 0 0 0 9.4 9.4z',
    sun: 'M12 16.6a4.6 4.6 0 1 0 0-9.2 4.6 4.6 0 0 0 0 9.2zM12 3.2v2M12 18.8v2M3.2 12h2M18.8 12h2M5.9 5.9l1.4 1.4M16.7 16.7l1.4 1.4M18.1 5.9l-1.4 1.4M7.3 16.7l-1.4 1.4',
    arrowUp: 'M12 18V7M7 11.5L12 6.5l5 5',
    arrowDown: 'M12 6v11M7 12.5l5 5 5-5',
    minus: 'M6 12h12',
    eye: 'M2.6 12S6 5.8 12 5.8 21.4 12 21.4 12 18 18.2 12 18.2 2.6 12 2.6 12zM12 14.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z',
    eyeOff: 'M4.4 4.4l15.2 15.2M9.9 9.9a2.6 2.6 0 1 0 4.2 4.2M6.4 6.6C3.9 8.4 2.6 12 2.6 12s3.4 6.2 9.4 6.2c1.6 0 3-.4 4.2-1.1M9.9 5.9A8.9 8.9 0 0 1 12 5.8c6 0 9.4 6.2 9.4 6.2-.7 1.3-1.7 2.7-2.9 3.7'
  };

  function icon(name, cls) {
    const d = PATHS[name] || PATHS.flow;
    return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
  }

  function h(tagName, attrs, children) {
    const node = document.createElement(tagName);
    Object.keys(attrs || {}).forEach((k) => {
      const v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else node.setAttribute(k, v === true ? '' : String(v));
    });
    (Array.isArray(children) ? children : children == null ? [] : [children]).forEach((child) => {
      if (child == null || child === false) return;
      node.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
    });
    return node;
  }

  const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); return node; };

  /* ---------------- Toast ---------------- */
  function toastLayer() {
    let layer = document.querySelector('.toast-layer');
    if (!layer) {
      layer = h('div', { class: 'toast-layer', role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(layer);
    }
    return layer;
  }

  function toast(msg, ms) {
    const node = h('div', { class: 'toast' }, [h('span', { html: icon('check') }, null), h('span', { text: msg })]);
    node.querySelector('svg').style.width = '18px';
    toastLayer().appendChild(node);
    setTimeout(() => {
      node.classList.add('is-bye');
      setTimeout(() => node.remove(), 240);
    }, ms || 1500);
    return node;
  }

  /* ---------------- 弹层 / 抽屉 ---------------- */
  const overlays = [];

  function openOverlay(content, opts) {
    const o = opts || {};
    const prevFocus = document.activeElement;
    let resolveResult = null;
    const result = new Promise((res) => { resolveResult = res; });

    const scrim = h('div', {
      class: 'scrim scrim--' + (o.variant || 'center'),
      role: 'dialog', 'aria-modal': 'true', 'aria-label': o.label || ''
    }, content);

    const controller = { scrim, node: content, close, result };

    function close(reason) {
      const i = overlays.indexOf(scrim);
      if (i < 0) return;
      overlays.splice(i, 1);
      document.removeEventListener('keydown', onKey, true);
      scrim.remove();
      if (!overlays.length) document.body.style.overflow = '';
      if (resolveResult) resolveResult(reason || 'closed');
      if (prevFocus && prevFocus.focus) prevFocus.focus();
    }

    function onKey(e) {
      if (overlays[overlays.length - 1] !== scrim) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (o.onEscape) o.onEscape(close);
        else close('escape');
        return;
      }
      if (e.key === 'Tab') {
        const f = Array.from(scrim.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])'))
          .filter((n) => !n.disabled && n.offsetParent !== null);
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    if (o.dismissible !== false) {
      scrim.addEventListener('pointerdown', (e) => {
        if (e.target === scrim) close('backdrop');
      });
    }
    document.addEventListener('keydown', onKey, true);
    document.body.style.overflow = 'hidden';
    document.body.appendChild(scrim);
    overlays.push(scrim);

    raf(() => {
      const target = content.querySelector('[data-autofocus]') || content.querySelector('input:not([type=hidden]), button');
      if (target && o.autofocus !== false) target.focus();
    });
    return controller;
  }

  function confirmDialog(opts) {
    return new Promise((resolve) => {
      const cancel = h('button', { class: 'btn btn--ghost', text: opts.cancelText || '取消' });
      const ok = h('button', {
        class: 'btn' + (opts.danger ? ' btn--danger' : ''),
        text: opts.okText || '确定',
        dataset: { autofocus: '' }
      });
      const box = h('div', { class: 'confirm', role: 'alertdialog', 'aria-label': opts.title }, [
        h('h3', { text: opts.title }),
        opts.text ? h('p', { text: opts.text }) : null,
        h('div', { class: 'confirm__acts' }, [cancel, ok])
      ]);
      const controller = openOverlay(box, { variant: 'center', label: opts.title });
      cancel.addEventListener('click', () => { resolve(false); controller.close('cancel'); });
      ok.addEventListener('click', () => { resolve(true); controller.close('ok'); });
      controller.result.then(() => resolve(false));
    });
  }

  function alertDialog(opts) {
    return new Promise((resolve) => {
      const ok = h('button', { class: 'btn', text: opts.okText || '知道了', dataset: { autofocus: '' } });
      const box = h('div', { class: 'confirm', role: 'alertdialog', 'aria-label': opts.title }, [
        h('h3', { text: opts.title }),
        opts.text ? h('p', { text: opts.text }) : null,
        h('div', { class: 'confirm__acts' }, [ok])
      ]);
      const controller = openOverlay(box, { variant: 'center', label: opts.title });
      ok.addEventListener('click', () => { resolve(true); controller.close('ok'); });
      controller.result.then(() => resolve(false));
    });
  }

  /* ---------------- 文案分层（PRD CARE-02） ---------------- */
  const COPY = {
    expense: { std: '支出', care: '花出去' },
    income: { std: '收入', care: '收进来' },
    balance: { std: '结余', care: '还剩' },
    monthExpense: { std: '本月支出', care: '这个月花出去' },
    monthIncome: { std: '本月收入', care: '这个月收进来' },
    monthBalance: { std: '本月结余', care: '这个月还剩' },
    vsPrev: { std: '环比上期', care: '比上一期' },
    budget: { std: '预算', care: '计划花多少' },
    budgetUsed: { std: '已用', care: '已经花了' },
    budgetLeft: { std: '剩余', care: '还能花' },
    flow: { std: '流水', care: '账目' },
    record: { std: '记一笔', care: '记一笔' },
    stats: { std: '统计', care: '看图' },
    mine: { std: '我的', care: '设置' },
    search: { std: '搜索', care: '找一找' },
    budgetOver: { std: '本月支出已超过预算', care: '这个月已经超出计划啦' },
    budgetWarn: { std: '本月支出已达到预算的 80%', care: '这个月计划快用完啦' },
    drillTitle: { std: '分类明细', care: '这笔钱花在哪' },
    empty: { std: '还没有账单，记下第一笔吧', care: '还没有记账，点下面「记一笔」开始' }
  };

  function careOn() {
    return document.documentElement.getAttribute('data-care') === 'on';
  }

  function t(key) {
    const entry = COPY[key];
    if (!entry) return key;
    return careOn() ? entry.care : entry.std;
  }

  function typeLabel(type) {
    return type === 'income' ? t('income') : t('expense');
  }

  /** PRD 无障碍：收支不单纯依赖颜色，用 +/- 辅助区分 */
  function signedAmount(type, cents) {
    return (type === 'income' ? '+' : '-') + global.Logic.fmtCents(cents);
  }

  function isDesktop() {
    return global.matchMedia('(min-width: 1024px)').matches;
  }

  // 后台标签页里 rAF 可能不执行，动画终态必须在兜底定时器里同样落地
  function raf(fn) {
    let done = false;
    const run = () => { if (done) return; done = true; fn(); };
    global.requestAnimationFrame(run);
    setTimeout(run, 80);
  }

  function isTablet() {
    return global.matchMedia('(min-width: 768px)').matches;
  }

  global.UI = {
    icon, h, clear, toast, openOverlay, confirmDialog, alertDialog, t, typeLabel, signedAmount, careOn, isDesktop, isTablet, overlays, raf
  };
})(typeof window !== 'undefined' ? window : globalThis);
