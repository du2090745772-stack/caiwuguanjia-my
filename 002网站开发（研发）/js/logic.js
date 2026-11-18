/* 纯计算逻辑：金额、日期区间、分组汇总、分类占比、趋势序列、筛选。
   不依赖 DOM，可在 Node 下直接单测（tests/logic.test.cjs）。 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else root.Logic = mod;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const pad = (n) => String(n).padStart(2, '0');
  const toStr = (dt) => dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
  const parse = (s) => {
    const p = String(s).split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2] || 1);
  };

  const todayStr = () => toStr(new Date());
  const monthKey = (dateStr) => String(dateStr).slice(0, 7);
  const yearKey = (dateStr) => String(dateStr).slice(0, 4);

  /** 输入输出同为 YYYY-MM */
  function ymShift(ym, delta) {
    const p = String(ym).split('-').map(Number);
    const d = new Date(p[0], p[1] - 1 + delta, 1);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  }

  function daysInMonth(ym) {
    const p = String(ym).split('-').map(Number);
    return new Date(p[0], p[1], 0).getDate();
  }

  function addDays(dateStr, n) {
    const d = parse(dateStr);
    d.setDate(d.getDate() + n);
    return toStr(d);
  }

  /* 周一为一周起点 */
  function startOfWeek(dateStr) {
    const d = parse(dateStr);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return toStr(d);
  }

  const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const cnDate = (dateStr) => {
    const d = parse(dateStr);
    return d.getMonth() + 1 + '月' + d.getDate() + '日';
  };

  function dayLabel(dateStr, today) {
    const t = today || todayStr();
    if (dateStr === t) return '今天';
    if (dateStr === addDays(t, -1)) return '昨天';
    const d = parse(dateStr);
    const base = cnDate(dateStr) + ' ' + WEEKDAYS[d.getDay()];
    return d.getFullYear() === parse(t).getFullYear() ? base : d.getFullYear() + '年' + base;
  }

  /** 周期区间：返回本期与上期，用于环比（PRD STAT-01） */
  function periodRange(granularity, anchor) {
    const a = anchor.length === 7 ? anchor + '-01' : anchor;
    if (granularity === 'day') {
      return {
        from: a, to: a,
        prevFrom: addDays(a, -1), prevTo: addDays(a, -1),
        label: dayLabel(a),
        next: addDays(a, 1), prev: addDays(a, -1)
      };
    }
    if (granularity === 'week') {
      const s = startOfWeek(a);
      return {
        from: s, to: addDays(s, 6),
        prevFrom: addDays(s, -7), prevTo: addDays(s, -1),
        label: cnDate(s) + ' - ' + cnDate(addDays(s, 6)),
        next: addDays(s, 7), prev: addDays(s, -7)
      };
    }
    if (granularity === 'year') {
      const y = Number(a.slice(0, 4));
      return {
        from: y + '-01-01', to: y + '-12-31',
        prevFrom: y - 1 + '-01-01', prevTo: y - 1 + '-12-31',
        label: y + '年',
        next: y + 1 + '-01-01', prev: y - 1 + '-01-01'
      };
    }
    const ym = a.slice(0, 7);
    const last = daysInMonth(ym);
    const prevYm = ymShift(ym, -1);
    return {
      from: ym + '-01', to: ym + '-' + pad(last),
      prevFrom: prevYm + '-01', prevTo: prevYm + '-' + pad(daysInMonth(prevYm)),
      label: Number(ym.slice(0, 4)) + '年' + Number(ym.slice(5, 7)) + '月',
      next: ymShift(ym, 1) + '-01', prev: prevYm + '-01'
    };
  }

  function inRange(dateStr, from, to) {
    return dateStr >= from && dateStr <= to;
  }

  function slice(records, from, to) {
    return records.filter((r) => inRange(r.date, from, to));
  }

  function sumBy(records, type) {
    let out = 0;
    for (const r of records) if (r.type === type) out += r.amount;
    return out;
  }

  const totals = (records) => ({
    expense: sumBy(records, 'expense'),
    income: sumBy(records, 'income'),
    balance: sumBy(records, 'income') - sumBy(records, 'expense')
  });

  function groupByDay(records) {
    const map = new Map();
    for (const r of records) {
      if (!map.has(r.date)) map.set(r.date, []);
      map.get(r.date).push(r);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, items]) => ({ date, items, expense: sumBy(items, 'expense'), income: sumBy(items, 'income') }));
  }

  /** PRD STAT-02：占比 <2% 的分类并入「其他」 */
  function categoryShare(records, type, categories, threshold) {
    const th = threshold == null ? 0.02 : threshold;
    const named = new Map();
    let total = 0;
    for (const r of records) {
      if (r.type !== type) continue;
      total += r.amount;
      const id = r.category_id || '__none__';
      if (!named.has(id)) named.set(id, 0);
      named.set(id, named.get(id) + r.amount);
    }
    if (!total) return { total: 0, items: [] };

    const nameOf = (id) => {
      const c = categories.find((x) => x.id === id);
      return c ? c.name : '未分类';
    };
    const iconOf = (id) => {
      const c = categories.find((x) => x.id === id);
      return c ? c.icon : '📌';
    };

    const main = [];
    let merged = 0;
    let mergedIds = [];
    for (const [id, cents] of named) {
      const isOther = nameOf(id) === '其他' || id === '__none__';
      if (!isOther && cents / total >= th) main.push({ id, cents, pct: cents / total, name: nameOf(id), icon: iconOf(id), ids: [id] });
      else {
        merged += cents;
        mergedIds = mergedIds.concat(id);
      }
    }
    main.sort((a, b) => b.cents - a.cents);
    if (merged > 0) {
      main.push({ id: '__merged__', cents: merged, pct: merged / total, name: '其他', icon: '📌', ids: mergedIds, isMerged: true });
    }
    return { total, items: main };
  }

  /** 环比：上期为 0 时不编造百分比 */
  function change(current, previous) {
    if (!previous) return { dir: 'none', pct: null };
    const pct = ((current - previous) / Math.abs(previous)) * 100;
    if (Math.abs(pct) < 0.5) return { dir: 'flat', pct: 0 };
    return { dir: current > previous ? 'up' : 'down', pct: Math.abs(pct) };
  }

  function dailySeries(records, ym) {
    const days = daysInMonth(ym);
    const out = [];
    for (let d = 1; d <= days; d++) out.push({ day: d, date: ym + '-' + pad(d), expense: 0, income: 0 });
    for (const r of records) {
      if (monthKey(r.date) !== ym) continue;
      const idx = Number(r.date.slice(8, 10)) - 1;
      if (out[idx]) out[idx][r.type] += r.amount;
    }
    return out;
  }

  function monthlySeries(records, year) {
    const out = [];
    for (let m = 1; m <= 12; m++) out.push({ month: m, ym: year + '-' + pad(m), expense: 0, income: 0 });
    for (const r of records) {
      if (yearKey(r.date) !== year) continue;
      out[Number(r.date.slice(5, 7)) - 1][r.type] += r.amount;
    }
    return out;
  }

  /** PRD BR-03：近 30 天使用频次 Top N 分类 */
  function topCategoryIds(records, opts) {
    const { type, limit = 8, days = 30, today = todayStr() } = opts;
    const from = addDays(today, -days);
    const freq = new Map();
    for (const r of records) {
      if (r.type !== type || r.date < from || r.date > today) continue;
      freq.set(r.category_id, (freq.get(r.category_id) || 0) + 1);
    }
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map((e) => e[0]);
  }

  /** PRD BUD-01：80% 转橙、100% 转红 */
  function budgetStatus(budgetCents, spentCents) {
    if (!budgetCents) return { level: 'none', pct: 0, remaining: 0 };
    const pct = (spentCents / budgetCents) * 100;
    const level = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok';
    return { level, pct, remaining: budgetCents - spentCents };
  }

  /** PRD BILL-03 搜索 / 筛选 */
  function filterRecords(records, criteria, categories) {
    const { q = '', type = '', from = '', to = '', min = null, max = null, categoryIds = null } = criteria;
    const needle = String(q).trim().toLowerCase();
    const nameById = new Map(categories.map((c) => [c.id, c.name]));
    return records.filter((r) => {
      if (type && r.type !== type) return false;
      if (from && r.date < from) return false;
      if (to && r.date > to) return false;
      if (min != null && r.amount < min) return false;
      if (max != null && r.amount > max) return false;
      if (categoryIds && !categoryIds.includes(r.category_id)) return false;
      if (needle) {
        const hay = (String(r.note || '') + ' ' + (nameById.get(r.category_id) || '')).toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }

  /* ---------- 金额 ---------- */
  function parseAmount(input) {
    const raw = String(input == null ? '' : input).trim().replace(/,/g, '');
    if (!raw) return null;
    if (!/^\d*(\.\d{0,2})?$/.test(raw)) return null;
    const [int, dec = ''] = raw.split('.');
    if (!int && !dec) return null;
    const cents = Number(int || '0') * 100 + Number((dec + '00').slice(0, 2));
    return Number.isFinite(cents) ? Math.round(cents) : null;
  }

  function fmtCents(cents, withSign) {
    const n = Math.round(Number(cents) || 0);
    const abs = Math.abs(n);
    const text = (abs / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (withSign) return (n > 0 ? '+' : n < 0 ? '-' : '') + text;
    return (n < 0 ? '-' : '') + text;
  }

  function fmtMoney(cents) {
    return '¥' + fmtCents(cents);
  }

  function fmtWan(cents) {
    const n = Math.round(Number(cents) || 0);
    if (Math.abs(n) >= 100000000) return (n / 100000000).toFixed(2) + ' 亿';
    if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(2) + ' 万';
    return fmtCents(n);
  }

  /* ---------- 导出 CSV（PRD SET-02） ---------- */
  function toCsv(rows) {
    const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const head = ['日期', '类型', '分类', '金额', '备注'];
    return [head, ...rows.map((r) => [r.date, r.type, r.category, r.amount, r.note])].map((line) => line.map(esc).join(',')).join('\r\n');
  }

  function exportRows(records, categories) {
    const nameById = new Map(categories.map((c) => [c.id, c.name]));
    return records.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map((r) => ({
      date: r.date,
      type: r.type === 'income' ? '收入' : '支出',
      category: nameById.get(r.category_id) || '未分类',
      amount: (r.amount / 100).toFixed(2),
      note: r.note || ''
    }));
  }

  /* ---------- 冷启动第 3 笔后备份提示（PRD 流程二） ---------- */
  function shouldHintBackup(recordCount, dismissedAt, today) {
    if (recordCount < 3) return false;
    const dismissed = Number(dismissedAt || 0);
    if (!dismissed) return true;
    return parse(today || todayStr()).getTime() - new Date(dismissed).getTime() >= 7 * 864e5;
  }

  return {
    todayStr, monthKey, yearKey, addDays, ymShift, startOfWeek, daysInMonth, parse, toStr,
    cnDate, dayLabel, periodRange, inRange, slice, sumBy, totals, groupByDay, categoryShare,
    change, dailySeries, monthlySeries, topCategoryIds, budgetStatus, filterRecords,
    parseAmount, fmtCents, fmtMoney, fmtWan, toCsv, exportRows, shouldHintBackup, WEEKDAYS
  };
});
