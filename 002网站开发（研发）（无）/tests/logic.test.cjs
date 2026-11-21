const assert = require('assert');
const L = require('../js/logic.js');

let pass = 0;
function t(name, fn) {
  try {
    fn();
    pass++;
  } catch (err) {
    console.error('FAIL  ' + name + '\n      ' + err.message);
    process.exitCode = 1;
  }
}

/* ---------- 金额 ---------- */
t('parseAmount 基本与非法输入', () => {
  assert.strictEqual(L.parseAmount('12.34'), 1234);
  assert.strictEqual(L.parseAmount('8'), 800);
  assert.strictEqual(L.parseAmount('.5'), 50);
  assert.strictEqual(L.parseAmount('0.05'), 5);
  assert.strictEqual(L.parseAmount('1,234.5'), 123450);
  assert.strictEqual(L.parseAmount('12.345'), null);
  assert.strictEqual(L.parseAmount('abc'), null);
  assert.strictEqual(L.parseAmount(''), null);
  assert.strictEqual(L.parseAmount('-5'), null);
});

t('fmtCents 千分位与符号（PRD：不单纯依赖颜色，用 +/- 区分）', () => {
  assert.strictEqual(L.fmtCents(0), '0.00');
  assert.strictEqual(L.fmtCents(1234567), '12,345.67');
  assert.strictEqual(L.fmtCents(-800), '-8.00');
  assert.strictEqual(L.fmtCents(800, true), '+8.00');
  assert.strictEqual(L.fmtCents(-800, true), '-8.00');
  assert.strictEqual(L.fmtMoney(800), '¥8.00');
});

/* ---------- 日期 ---------- */
t('periodRange 月：本期与上期自然月', () => {
  const r = L.periodRange('month', '2026-11');
  assert.strictEqual(r.from, '2026-11-01');
  assert.strictEqual(r.to, '2026-11-30');
  assert.strictEqual(r.prevFrom, '2026-10-01');
  assert.strictEqual(r.prevTo, '2026-10-31');
  assert.strictEqual(r.label, '2026年11月');
});

t('periodRange 月：闰年 2 月天数', () => {
  assert.strictEqual(L.periodRange('month', '2028-02').to, '2028-02-29');
  assert.strictEqual(L.periodRange('month', '2026-02').to, '2026-02-28');
  assert.strictEqual(L.daysInMonth('2026-11'), 30);
});

t('periodRange 周：7 天跨度且含锚点日', () => {
  const r = L.periodRange('week', '2026-11-17');
  const span = (L.parse(r.to) - L.parse(r.from)) / 864e5;
  assert.strictEqual(span, 6);
  assert.ok(r.from <= '2026-11-17' && r.to >= '2026-11-17');
  assert.strictEqual(L.periodRange('week', '2026-11-17').prevTo, L.addDays(r.from, -1));
});

t('periodRange 日/年 与环比区间不重叠', () => {
  const d = L.periodRange('day', '2026-11-17');
  assert.strictEqual(d.from, '2026-11-17');
  assert.strictEqual(d.prevFrom, '2026-11-16');
  const y = L.periodRange('year', '2026-01-01');
  assert.strictEqual(y.from, '2026-01-01');
  assert.strictEqual(y.to, '2026-12-31');
  assert.strictEqual(y.prevFrom, '2025-01-01');
});

t('dayLabel 今天/昨天/跨年', () => {
  assert.strictEqual(L.dayLabel('2026-11-17', '2026-11-17'), '今天');
  assert.strictEqual(L.dayLabel('2026-11-16', '2026-11-17'), '昨天');
  assert.ok(L.dayLabel('2025-11-17', '2026-11-17').startsWith('2025年'));
});

/* ---------- 汇总 ---------- */
const rec = (o) => Object.assign({ id: Math.random().toString(36).slice(2), type: 'expense', amount: 0, category_id: 'c1', note: '', date: '2026-11-17' }, o);
const cats = [
  { id: 'c1', name: '餐饮', icon: '🍜', type: 'expense' },
  { id: 'c2', name: '交通', icon: '🚌', type: 'expense' },
  { id: 'c3', name: '购物', icon: '🛍️', type: 'expense' },
  { id: 'c4', name: '住房', icon: '🏠', type: 'expense' },
  { id: 'c9', name: '其他', icon: '📌', type: 'expense' }
];

t('totals / sumBy 按类型汇总', () => {
  const rows = [rec({ type: 'expense', amount: 1200 }), rec({ type: 'expense', amount: 800 }), rec({ type: 'income', amount: 10000 })];
  const s = L.totals(rows);
  assert.deepStrictEqual(s, { expense: 2000, income: 10000, balance: 8000 });
});

t('groupByDay 按日期倒序并给出当日合计', () => {
  const rows = [
    rec({ date: '2026-11-15', amount: 500 }),
    rec({ date: '2026-11-17', amount: 300 }),
    rec({ date: '2026-11-17', amount: 700, type: 'income' })
  ];
  const g = L.groupByDay(rows);
  assert.deepStrictEqual(g.map((x) => x.date), ['2026-11-17', '2026-11-15']);
  assert.strictEqual(g[0].expense, 300);
  assert.strictEqual(g[0].income, 700);
  assert.strictEqual(g[1].expense, 500);
});

/* ---------- PRD STAT-02：占比 <2% 合并为其他 ---------- */
t('categoryShare 合并小于 2% 的分类', () => {
  const rows = [
    rec({ category_id: 'c1', amount: 1000000 }),
    rec({ category_id: 'c2', amount: 1000000 }),
    rec({ category_id: 'c3', amount: 15000 }),
    rec({ category_id: 'c4', amount: 5000 })
  ];
  const s = L.categoryShare(rows, 'expense', cats);
  assert.strictEqual(s.total, 2020000);
  assert.deepStrictEqual(s.items.map((i) => i.name), ['餐饮', '交通', '其他']);
  const merged = s.items[2];
  assert.strictEqual(merged.cents, 20000);
  assert.strictEqual(merged.isMerged, true);
  assert.deepStrictEqual(merged.ids.sort(), ['c3', 'c4'].sort());
});

t('categoryShare 各项占比合计为 100%', () => {
  const rows = [rec({ category_id: 'c1', amount: 70000 }), rec({ category_id: 'c2', amount: 25000 }), rec({ category_id: 'c3', amount: 5000 })];
  const s = L.categoryShare(rows, 'expense', cats);
  assert.ok(Math.abs(s.items.reduce((a, i) => a + i.pct, 0) - 1) < 1e-9);
});

t('categoryShare 已存在的「其他」不重复成两行', () => {
  const rows = [rec({ category_id: 'c1', amount: 900000 }), rec({ category_id: 'c9', amount: 100000 })];
  const s = L.categoryShare(rows, 'expense', cats);
  assert.strictEqual(s.items.filter((i) => i.name === '其他').length, 1);
  assert.strictEqual(s.items.find((i) => i.name === '其他').cents, 100000);
});

t('categoryShare 空数据不抛错', () => {
  assert.deepStrictEqual(L.categoryShare([], 'expense', cats), { total: 0, items: [] });
});

t('categoryShare 未知分类归入其他', () => {
  const rows = [rec({ category_id: 'c1', amount: 99000 }), rec({ category_id: 'ghost', amount: 1000 })];
  const s = L.categoryShare(rows, 'expense', cats);
  assert.strictEqual(s.items[s.items.length - 1].name, '其他');
});

/* ---------- 环比 ---------- */
t('change 上期为 0 时不编造百分比', () => {
  assert.deepStrictEqual(L.change(5000, 0), { dir: 'none', pct: null });
  assert.deepStrictEqual(L.change(0, 0), { dir: 'none', pct: null });
});

t('change 涨跌方向与取整', () => {
  assert.strictEqual(L.change(11000, 10000).dir, 'up');
  assert.strictEqual(L.change(9000, 10000).dir, 'down');
  assert.strictEqual(L.change(10000, 10000).dir, 'flat');
  assert.ok(Math.abs(L.change(10000, 5000).pct - 100) < 1e-9);
});

/* ---------- 趋势序列（PRD STAT-03） ---------- */
t('dailySeries 长度等于当月天数并落到正确日期', () => {
  const rows = [rec({ date: '2026-11-03', amount: 400 }), rec({ date: '2026-11-30', amount: 600 }), rec({ date: '2026-10-31', amount: 999 })];
  const s = L.dailySeries(rows, '2026-11');
  assert.strictEqual(s.length, 30);
  assert.strictEqual(s[2].expense, 400);
  assert.strictEqual(s[29].expense, 600);
  assert.strictEqual(s.reduce((a, d) => a + d.expense, 0), 1000);
});

t('monthlySeries 12 个月且排除其他年份', () => {
  const rows = [rec({ date: '2026-01-05', amount: 100, type: 'income' }), rec({ date: '2025-01-05', amount: 900 })];
  const s = L.monthlySeries(rows, '2026');
  assert.strictEqual(s.length, 12);
  assert.strictEqual(s[0].income, 100);
  assert.strictEqual(s.reduce((a, m) => a + m.expense + m.income, 0), 100);
});

/* ---------- 常用分类（PRD BR-03） ---------- */
t('topCategoryIds 近 30 天频次排序并限量', () => {
  const rows = [
    rec({ category_id: 'c1', date: '2026-11-16' }),
    rec({ category_id: 'c1', date: '2026-11-15' }),
    rec({ category_id: 'c2', date: '2026-11-14' }),
    rec({ category_id: 'c3', date: '2026-01-01' })
  ];
  const top = L.topCategoryIds(rows, { type: 'expense', limit: 2, today: '2026-11-17' });
  assert.deepStrictEqual(top, ['c1', 'c2']);
});

/* ---------- 预算（PRD BUD-01） ---------- */
t('budgetStatus 80% 转橙、100% 转红', () => {
  assert.strictEqual(L.budgetStatus(100000, 79900).level, 'ok');
  assert.strictEqual(L.budgetStatus(100000, 80000).level, 'warn');
  assert.strictEqual(L.budgetStatus(100000, 100000).level, 'over');
  assert.strictEqual(L.budgetStatus(100000, 150000).remaining, -50000);
  assert.strictEqual(L.budgetStatus(null, 100).level, 'none');
});

/* ---------- 搜索（PRD BILL-03） ---------- */
t('filterRecords 关键词命中备注或分类名', () => {
  const rows = [rec({ category_id: 'c1', note: '早餐豆浆' }), rec({ category_id: 'c2', note: '' })];
  assert.strictEqual(L.filterRecords(rows, { q: '豆浆' }, cats).length, 1);
  assert.strictEqual(L.filterRecords(rows, { q: '交通' }, cats).length, 1);
  assert.strictEqual(L.filterRecords(rows, { q: '    ' }, cats).length, 2);
});

t('filterRecords 金额区间、日期区间、类型', () => {
  const rows = [
    rec({ category_id: 'c1', amount: 1000, date: '2026-11-01' }),
    rec({ category_id: 'c2', amount: 5000, date: '2026-11-20', type: 'income' })
  ];
  assert.strictEqual(L.filterRecords(rows, { min: 2000, max: 9999 }, cats).length, 1);
  assert.strictEqual(L.filterRecords(rows, { from: '2026-11-10' }, cats).length, 1);
  assert.strictEqual(L.filterRecords(rows, { to: '2026-11-10' }, cats).length, 1);
  assert.strictEqual(L.filterRecords(rows, { type: 'income' }, cats).length, 1);
  assert.strictEqual(L.filterRecords(rows, {}, cats).length, 2);
});

/* ---------- 导出（PRD SET-02） ---------- */
t('exportRows 中文表头与金额两位小数', () => {
  const rows = [rec({ category_id: 'c1', amount: 1234, note: '午', date: '2026-11-02' })];
  const out = L.exportRows(rows, cats);
  assert.deepStrictEqual(out, [{ date: '2026-11-02', type: '支出', category: '餐饮', amount: '12.34', note: '午' }]);
});

t('toCsv 转义引号与逗号', () => {
  const csv = L.toCsv([{ date: '2026-11-02', type: '支出', category: '餐饮', amount: '1.00', note: 'a,b"c' }]);
  assert.ok(csv.includes('"a,b""c"'));
  assert.ok(csv.startsWith('"日期","类型","分类","金额","备注"'));
});

/* ---------- 冷启动提示（PRD 流程二：7 天内不再提示） ---------- */
t('shouldHintBackup 第 3 笔触发、关闭后 7 天内不再提示', () => {
  const today = '2026-11-17';
  const nowMs = L.parse(today).getTime();
  assert.strictEqual(L.shouldHintBackup(2, 0, today), false);
  assert.strictEqual(L.shouldHintBackup(3, 0, today), true);
  assert.strictEqual(L.shouldHintBackup(5, nowMs - 6 * 864e5, today), false);
  assert.strictEqual(L.shouldHintBackup(5, nowMs - 8 * 864e5, today), true);
});

console.log(pass + ' 组断言通过' + (process.exitCode ? '，存在失败用例' : ''));
