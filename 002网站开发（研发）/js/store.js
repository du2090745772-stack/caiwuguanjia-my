/* 数据层：IndexedDB 优先（PRD 数据持久性），file:// 等受限环境自动退到 localStorage。
   金额一律以「分」为整数存储；账单/分类/预算带 ACC-02 要求的多端同步字段。 */
(function (global) {
  'use strict';

  const DB_NAME = 'daily_ledger';
  const DB_VER = 1;
  const LS_KEY = 'daily_ledger:v1';
  const MARK_KEY = 'daily_ledger:record_count';
  const STORES = ['records', 'categories', 'kv'];
  const USER_ID = 'local';

  const DEFAULT_CATEGORIES = [
    { name: '餐饮', icon: '🍜', type: 'expense' },
    { name: '交通', icon: '🚌', type: 'expense' },
    { name: '购物', icon: '🛍️', type: 'expense' },
    { name: '住房', icon: '🏠', type: 'expense' },
    { name: '娱乐', icon: '🎮', type: 'expense' },
    { name: '医疗', icon: '💊', type: 'expense' },
    { name: '人情', icon: '🎁', type: 'expense' },
    { name: '学习', icon: '📚', type: 'expense' },
    { name: '其他', icon: '📌', type: 'expense' },
    { name: '工资', icon: '💰', type: 'income' },
    { name: '理财', icon: '📈', type: 'income' },
    { name: '兼职', icon: '💼', type: 'income' },
    { name: '红包', icon: '🧧', type: 'income' },
    { name: '其他', icon: '📌', type: 'income' }
  ];

  let db = null;
  let storageMode = 'loading';
  let quotaWarning = false;

  const state = {
    records: [],
    categories: [],
    settings: { care_mode: false, theme: 'auto', continue_mode: false, backup_hint_dismissed_at: 0 },
    budgets: {}
  };
  let sortDirty = true;

  const stamp = () => new Date().toISOString();
  const uid = (p) => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* ---------------- IndexedDB ---------------- */
  function idbRequest(req) {
    return new Promise((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }

  function openIdb() {
    return new Promise((res, rej) => {
      if (!global.indexedDB) return rej(new Error('no indexedDB'));
      let req;
      try {
        req = global.indexedDB.open(DB_NAME, DB_VER);
      } catch (err) {
        return rej(err);
      }
      req.onupgradeneeded = () => {
        const d = req.result;
        STORES.forEach((name) => {
          if (!d.objectStoreNames.contains(name)) {
            d.createObjectStore(name, { keyPath: name === 'kv' ? 'k' : 'id' });
          }
        });
      };
      req.onsuccess = () => {
        db = req.result;
        db.onversionchange = () => db.close();
        res(db);
      };
      req.onerror = () => rej(req.error);
      req.onblocked = () => rej(new Error('idb blocked'));
    });
  }

  function idbTx(store, mode, fn) {
    return new Promise((res, rej) => {
      const tx = db.transaction(store, mode);
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error || new Error('tx aborted'));
      const out = fn(tx.objectStore(store));
      tx.oncomplete = () => res(out && out.result);
    });
  }

  const idbAll = (store) => idbTx(store, 'readonly', (os) => os.getAll());
  const idbPut = (store, val) => idbTx(store, 'readwrite', (os) => os.put(val));
  const idbDel = (store, key) => idbTx(store, 'readwrite', (os) => os.delete(key));

  /* ---------------- localStorage 兜底 ---------------- */
  function lsRead() {
    try {
      const raw = global.localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function lsWrite() {
    try {
      global.localStorage.setItem(LS_KEY, JSON.stringify({
        records: state.records,
        categories: state.categories,
        kv: [
          { k: 'settings', v: state.settings },
          { k: 'budgets', v: state.budgets }
        ]
      }));
      quotaWarning = false;
    } catch (err) {
      quotaWarning = true;
    }
  }

  // 供着陆页判断"这台设备记过账"，避免重复打开 IndexedDB
  function markRecordCount() {
    try { global.localStorage.setItem(MARK_KEY, String(state.records.length)); } catch (err) { /* 仅用于文案 */ }
  }

  async function persistRecord(rec) {
    if (storageMode === 'idb') await idbPut('records', rec);
    else lsWrite();
  }

  async function dropRecord(id) {
    if (storageMode === 'idb') await idbDel('records', id);
    else lsWrite();
  }

  async function persistCategory(cat) {
    if (storageMode === 'idb') await idbPut('categories', cat);
    else lsWrite();
  }

  async function removeCategoryRow(id) {
    if (storageMode === 'idb') await idbDel('categories', id);
    else lsWrite();
  }

  async function persistKv() {
    if (storageMode === 'idb') {
      await idbPut('kv', { k: 'settings', v: state.settings });
      await idbPut('kv', { k: 'budgets', v: state.budgets });
    } else lsWrite();
  }

  /* ---------------- 载入 ---------------- */
  async function load() {
    try {
      await openIdb();
      storageMode = 'idb';
      const [records, categories, kv] = await Promise.all([idbAll('records'), idbAll('categories'), idbAll('kv')]);
      state.records = records || [];
      state.categories = categories || [];
      (kv || []).forEach((row) => {
        if (row.k === 'settings') state.settings = Object.assign({}, state.settings, row.v);
        if (row.k === 'budgets') state.budgets = row.v || {};
      });
    } catch (err) {
      storageMode = 'local';
      const data = lsRead();
      if (data) {
        state.records = data.records || [];
        state.categories = data.categories || [];
        (data.kv || []).forEach((row) => {
          if (row.k === 'settings') state.settings = Object.assign({}, state.settings, row.v);
          if (row.k === 'budgets') state.budgets = row.v || {};
        });
      }
    }

    if (!state.categories.length) {
      DEFAULT_CATEGORIES.forEach((c, i) => {
        state.categories.push({
          id: uid('cat'),
          user_id: USER_ID,
          name: c.name,
          icon: c.icon,
          type: c.type,
          sort: i,
          hidden: false,
          builtin: true,
          created_at: stamp(),
          updated_at: stamp(),
          sync_status: 'local',
          platform: 'web'
        });
      });
      await persistKvAndCats();
    }
    sortDirty = true;
    return storageMode;
  }

  async function persistKvAndCats() {
    if (storageMode === 'idb') {
      for (const c of state.categories) await idbPut('categories', c);
    } else lsWrite();
  }

  /* ---------------- 记录 ---------------- */
  function sortRecords() {
    state.records.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.created_at < b.created_at ? 1 : -1;
    });
    sortDirty = false;
  }

  function upsertRecord(input) {
    const isEdit = Boolean(input.id);
    const rec = {
      id: isEdit ? input.id : uid('rec'),
      user_id: USER_ID,
      type: input.type === 'income' ? 'income' : 'expense',
      amount: Math.max(0, Math.round(Number(input.amount) || 0)),
      category_id: input.category_id,
      note: String(input.note || '').slice(0, 100),
      date: input.date,
      created_at: isEdit ? (findById(state.records, input.id) || {}).created_at || stamp() : stamp(),
      updated_at: stamp(),
      sync_status: 'local',
      platform: 'web'
    };
    const idx = state.records.findIndex((r) => r.id === rec.id);
    if (idx >= 0) state.records[idx] = rec;
    else state.records.push(rec);
    sortDirty = true;
    markRecordCount();
    return persistRecord(rec).then(() => rec);
  }

  function deleteRecord(id) {
    state.records = state.records.filter((r) => r.id !== id);
    sortDirty = true;
    markRecordCount();
    return dropRecord(id);
  }

  function findById(list, id) {
    return list.find((x) => x.id === id);
  }

  /* ---------------- 分类 ---------------- */
  function upsertCategory(input) {
    const existing = input.id ? findById(state.categories, input.id) : null;
    const cat = {
      id: existing ? existing.id : uid('cat'),
      user_id: USER_ID,
      name: String(input.name || '').slice(0, 10),
      icon: input.icon || '📌',
      type: input.type === 'income' ? 'income' : 'expense',
      sort: input.sort != null ? input.sort : (existing ? existing.sort : state.categories.filter((c) => c.type === input.type).length),
      hidden: input.hidden != null ? Boolean(input.hidden) : Boolean(existing && existing.hidden),
      builtin: existing ? existing.builtin : false,
      created_at: existing ? existing.created_at : stamp(),
      updated_at: stamp(),
      sync_status: 'local',
      platform: 'web'
    };
    if (existing) Object.assign(existing, cat);
    else state.categories.push(cat);
    return persistCategory(cat).then(() => cat);
  }

  function deleteCategory(id) {
    state.categories = state.categories.filter((c) => c.id !== id);
    return removeCategoryRow(id);
  }

  function replaceCategories(list) {
    state.categories = list;
    return persistKvAndCats();
  }

  /* ---------------- 设置 / 预算 ---------------- */
  function setSetting(key, value) {
    state.settings[key] = value;
    return persistKv();
  }

  function setBudget(yearMonth, cents) {
    state.budgets[yearMonth] = {
      amount: cents == null ? null : Math.round(Number(cents) || 0),
      updated_at: stamp()
    };
    return persistKv();
  }

  async function wipe() {
    state.records = [];
    state.budgets = {};
    state.categories = [];
    state.settings = { care_mode: false, theme: 'auto', continue_mode: false, backup_hint_dismissed_at: 0 };
    if (storageMode === 'idb') {
      for (const s of STORES) await idbTx(s, 'readwrite', (os) => os.clear());
      await load();
    } else {
      lsWrite();
      await load();
    }
  }

  const api = {
    load,
    storageMode: () => storageMode,
    quotaWarning: () => quotaWarning,
    records: () => {
      if (sortDirty) sortRecords();
      return state.records;
    },
    recordById: (id) => findById(state.records, id),
    categories: (type) => {
      const all = state.categories.slice().sort((a, b) => a.sort - b.sort);
      return type ? all.filter((c) => c.type === type && !c.hidden) : all;
    },
    categoryById: (id) => findById(state.categories, id),
    upsertRecord,
    deleteRecord,
    upsertCategory,
    deleteCategory,
    replaceCategories,
    settings: () => state.settings,
    setSetting,
    budgets: () => state.budgets,
    budgetFor: (ym) => (state.budgets[ym] && state.budgets[ym].amount) || null,
    setBudget,
    wipe,
    exportSnapshot: () => ({
      exported_at: stamp(),
      app: '每日记账本',
      version: 1,
      storage: storageMode,
      user_id: USER_ID,
      categories: state.categories,
      budgets: state.budgets,
      records: api.records()
    }),
    DEFAULT_CATEGORIES
  };

  global.Store = api;
})(typeof window !== 'undefined' ? window : globalThis);
