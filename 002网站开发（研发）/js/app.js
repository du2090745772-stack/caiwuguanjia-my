/* 应用外壳：路由、导航、主题与关怀模式、下拉刷新、预算提醒频控 */
(function (global) {
  'use strict';

  const ROUTES = {
    '/flow': { title: '流水', view: 'flow', icon: 'flow' },
    '/stats': { title: '统计', view: 'stats', icon: 'stats' },
    '/mine': { title: '我的', view: 'mine', icon: 'user' },
    '/budget': { title: '预算设置', view: 'budget', icon: 'target', hidden: true },
    '/categories': { title: '分类管理', view: 'categories', icon: 'sliders', hidden: true },
    '/search': { title: '搜索账单', view: 'search', icon: 'search', hidden: true },
    '/login': { title: '登录 / 注册', view: 'login', icon: 'user', hidden: true },
    '/register': { title: '注册账号', view: 'login', icon: 'user', hidden: true }
  };

  const App = {
    state: {
      route: '/flow',
      flowMonth: null,
      statsGran: 'month',
      statsAnchor: null,
      budgetMonth: null,
      filters: {}
    },
    cleanups: [],
    root: null
  };

  function el(sel) { return global.document.querySelector(sel); }

  App.registerCleanup = function (fn) { App.cleanups.push(fn); };

  function runCleanups() {
    App.cleanups.forEach((fn) => { try { fn(); } catch (e) { /* 清理失败不影响渲染 */ } });
    App.cleanups = [];
  }

  /* ---------------- 主题 / 关怀模式 ---------------- */
  function applyTheme() {
    const mode = Store.settings().theme || 'auto';
    if (mode === 'auto') el('html').removeAttribute('data-theme');
    else el('html').setAttribute('data-theme', mode);
  }

  function applyCare() {
    el('html').setAttribute('data-care', Store.settings().care_mode ? 'on' : 'off');
  }

  App.setTheme = async function (mode) {
    await Store.setSetting('theme', mode);
    applyTheme();
    App.refresh();
  };

  App.setCare = async function (on) {
    await Store.setSetting('care_mode', on);
    applyCare();
    renderNav();
    App.refresh();
    UI.toast(on ? '关怀模式已开启' : '已切回标准模式');
  };

  /* ---------------- 提醒频控（PRD BUD-03：每档每月一次） ---------------- */
  App.shouldRemind = function (ym, level) {
    return !Store.settings()['remind_' + ym + '_' + level];
  };
  App.muteRemind = function (ym, level) {
    Store.setSetting('remind_' + ym + '_' + level, true);
  };
  App.dismissLocalNotice = function () {
    Store.setSetting('local_notice_seen', true);
  };
  App.dismissBackupHint = function () {
    Store.setSetting('backup_hint_dismissed_at', Date.now());
  };
  App.markBackupSeen = function () {
    Store.setSetting('cloud_backup_seen', true);
  };

  /* ---------------- 导航 ---------------- */
  function renderNav() {
    const nav = el('#nav');
    const care = UI.careOn();
    UI.clear(nav);
    if (!care) {
      nav.appendChild(UI.h('div', { class: 'brandbar' }, [
        UI.h('span', { class: 'dot', text: '记' }), UI.h('span', { text: '每日记账本' })
      ]));
    }
    nav.appendChild(navButton('/flow', care ? '账目' : ROUTES['/flow'].title, 'flow'));
    nav.appendChild(UI.h('button', {
      class: 'nav__item nav__item--cta', type: 'button',
      'aria-label': UI.t('record'), onClick: () => Views.openAdd()
    }, [
      UI.h('span', { class: 'nav__plus', html: UI.icon('plus') }),
      UI.h('span', { class: 'nav__label', text: UI.t('record') })
    ]));
    nav.appendChild(navButton('/stats', care ? UI.t('stats') : ROUTES['/stats'].title, 'stats'));
    if (!care) nav.appendChild(navButton('/mine', ROUTES['/mine'].title, 'user'));
  }

  function navButton(route, label, iconName) {
    const active = App.state.route === route;
    return UI.h('button', {
      class: 'nav__item', type: 'button',
      'aria-current': active ? 'page' : null,
      onClick: () => App.go('#' + route)
    }, [
      UI.h('span', { html: UI.icon(iconName) }),
      UI.h('span', { class: 'nav__label', text: label })
    ]);
  }

  /* ---------------- 路由 ---------------- */
  App.go = function (hash) {
    if (location.hash === hash) App.refresh();
    else location.hash = hash;
  };

  function normalize(hash) {
    const path = (hash || '').replace(/^#/, '') || '/flow';
    return ROUTES[path] ? path : '/flow';
  }

  App.refresh = function () {
    render(App.state.route);
  };

  function render(path) {
    runCleanups();
    const route = ROUTES[path];
    const container = UI.clear(el('#view'));
    el('title').textContent = route.title + ' · 每日记账本';
    container.dataset.view = route.view;
    Views[route.view](container);
    global.scrollTo(0, 0);
  }

  function onHashChange() {
    const path = normalize(location.hash);
    App.state.route = path;
    renderNav();
    render(path);
  }

  /* ---------------- 下拉刷新（PRD BILL-01 移动端） ---------------- */
  function initPullToRefresh() {
    let startY = 0;
    let pulling = false;
    let dist = 0;
    const hint = UI.h('div', { class: 'ptr', text: '下拉刷新' });
    document.body.appendChild(hint);

    function reset() {
      pulling = false;
      dist = 0;
      hint.classList.remove('is-on', 'is-ready');
      hint.textContent = '下拉刷新';
      hint.style.transform = 'translateY(-40px)';
    }

    reset();
    document.addEventListener('touchstart', (e) => {
      if (!UI.isTablet() && global.scrollY <= 0 && App.state.route === '/flow' && !UI.overlays.length) {
        startY = e.touches[0].clientY;
        pulling = true;
      }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (!pulling) return;
      dist = e.touches[0].clientY - startY;
      if (dist < 0) { pulling = false; reset(); return; }
      const travel = Math.min(72, dist * 0.5);
      hint.style.transform = 'translateY(' + (travel - 40) + 'px)';
      hint.classList.toggle('is-on', travel > 8);
      hint.classList.toggle('is-ready', travel >= 60);
      if (travel > 8) e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchend', () => {
      if (pulling && dist > 0 && hint.classList.contains('is-ready')) {
        hint.textContent = '已更新';
        App.refresh();
        setTimeout(reset, 600);
      } else reset();
    });
  }

  /* ---------------- PC 快捷键（PRD BR-04） ---------------- */
  function initShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (UI.overlays.length || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); Views.openAdd(); }
    });
  }

  /* ---------------- 演示账号（PRD V1.0.1 ACC-02 登录态策略） ---------------- */
  function initAuth() {
    Auth.configure({
      load: () => Store.settings().auth_state,
      save: (state) => {
        const p = Store.setSetting('auth_state', state);
        if (p && p.catch) p.catch(() => { /* 写盘失败时保持内存态，不打断记账 */ });
      }
    });
    Auth.purgeExpired();
  }

  // Access Token 过期不打断记账：静默续期，只有续期失败才请用户重新登录
  App.ensureSession = function () {
    if (Auth.session().status !== 'needs_refresh') return;
    if (Auth.refresh().ok) return;
    Auth.logout();
    UI.toast('登录已过期，重新登录即可继续备份', 3000);
    Views.openLogin();
  };

  /* ---------------- 启动 ---------------- */
  async function boot() {
    App.root = el('#view');
    await Store.load();
    initAuth();
    applyTheme();
    applyCare();
    App.state.statsAnchor = Logic.todayStr();
    initPullToRefresh();
    initShortcuts();
    global.addEventListener('hashchange', onHashChange);
    onHashChange();
    App.ensureSession();
    if (Store.quotaWarning()) UI.toast('浏览器存储空间不足，请导出备份', 3000);
    document.body.classList.add('is-ready');
  }

  global.App = App;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
