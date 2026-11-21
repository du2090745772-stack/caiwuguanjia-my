import ExcelJS from 'exceljs';
import { one, query } from './db.js';

const yuan = n => Number(n || 0) / 100;
const integer = (v, fallback, max) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback; };
const date = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : null;
const today = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const range = q => {
  const end = date(q.end) || today();
  const start = date(q.start) || new Date(Date.parse(`${end}T00:00:00Z`) - 29 * 86400000).toISOString().slice(0, 10);
  if (start > end || (Date.parse(end) - Date.parse(start)) / 86400000 > 366) throw Object.assign(Error('日期范围须在一年以内'), { status: 400 });
  const until = new Date(Date.parse(`${end}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  return { start, end, until };
};
const datetime = s => s ? `${String(s).replace(' ', 'T')}Z` : null;
const period = q => /^\d{4}-(0[1-9]|1[0-2])$/.test(q.month || '') ? q.month : today().slice(0, 7);
const search = v => String(v || '').trim().slice(0, 100);
const like = v => `%${v.replace(/[\\%_]/g, '\\$&')}%`;
const wrap = handler => async (req, res, next) => { try { await handler(req, res); } catch (error) { if (error.status) res.status(error.status).json({ error: error.message }); else next(error); } };
const whereRecords = (q, { includeUser = true } = {}) => {
  const { start, end, until } = range(q);
  const clauses = ['b.record_date>=?', 'b.record_date<?', q.deleted === 'true' ? 'b.deleted_at IS NOT NULL' : 'b.deleted_at IS NULL'];
  const params = [start, until];
  if (q.type && ['income', 'expense'].includes(q.type)) { clauses.push('b.type=?'); params.push(q.type); }
  if (includeUser && search(q.user)) { clauses.push('(u.username LIKE ? OR u.id=?)'); params.push(like(search(q.user)), search(q.user)); }
  if (search(q.category)) { clauses.push('c.name LIKE ?'); params.push(like(search(q.category))); }
  if (search(q.note)) { clauses.push('b.note LIKE ?'); params.push(like(search(q.note))); }
  if (q.min !== undefined && q.min !== '') { const min = Number(q.min); if (!Number.isFinite(min) || min < 0) throw Object.assign(Error('最低金额不正确'), { status: 400 }); clauses.push('b.amount_cent>=?'); params.push(Math.round(min * 100)); }
  if (q.max !== undefined && q.max !== '') { const max = Number(q.max); if (!Number.isFinite(max) || max < 0) throw Object.assign(Error('最高金额不正确'), { status: 400 }); clauses.push('b.amount_cent<=?'); params.push(Math.round(max * 100)); }
  return { start, end, until, where: clauses.join(' AND '), params };
};
const recordJoin = 'FROM bill_records b JOIN users u ON u.id=b.user_id LEFT JOIN categories c ON c.id=b.category_id';
const recordSelect = `SELECT b.id,b.user_id,u.username,b.type,b.amount_cent,b.record_date,b.note,b.created_at,b.deleted_at,c.name category,c.icon,c.deleted_at category_deleted_at ${recordJoin}`;
const recordOut = r => ({ id: r.id, userId: r.user_id, username: r.username, type: r.type, amount: yuan(r.amount_cent), date: String(r.record_date).slice(0, 10), category: r.category || '未分类', icon: r.icon || '📌', categoryDeleted: Boolean(r.category_deleted_at), notePreview: (r.note || '').slice(0, 20), createdAt: datetime(r.created_at), deleted: Boolean(r.deleted_at) });
const amounts = row => ({ count: Number(row?.count || 0), income: yuan(row?.income_cent), expense: yuan(row?.expense_cent), balance: yuan(Number(row?.income_cent || 0) - Number(row?.expense_cent || 0)) });

export function dataRoutes(app) {
  app.get('/api/admin/overview', wrap(async (req, res) => {
    const { start, end, until } = range(req.query);
    const [users, signups, active, totals, daily] = await Promise.all([
      one('SELECT COUNT(*) total,SUM(status=\'deactivating\') deactivating FROM users'),
      one('SELECT COUNT(*) count FROM users WHERE created_at>=? AND created_at<?', [`${start} 00:00:00`, `${until} 00:00:00`]),
      one('SELECT COUNT(DISTINCT user_id) count FROM bill_records WHERE created_at>=? AND created_at<? AND deleted_at IS NULL', [`${start} 00:00:00`, `${until} 00:00:00`]),
      one('SELECT COUNT(*) count,COALESCE(SUM(IF(type=\'income\',amount_cent,0)),0) income_cent,COALESCE(SUM(IF(type=\'expense\',amount_cent,0)),0) expense_cent FROM bill_records WHERE record_date>=? AND record_date<? AND deleted_at IS NULL', [start, until]),
      query('SELECT record_date day,COUNT(*) count,SUM(IF(type=\'income\',amount_cent,0)) income_cent,SUM(IF(type=\'expense\',amount_cent,0)) expense_cent FROM bill_records WHERE record_date>=? AND record_date<? AND deleted_at IS NULL GROUP BY record_date ORDER BY record_date', [start, until]),
    ]);
    res.json({ start, end, updatedAt: new Date().toISOString(), registered: Number(users.total), deactivating: Number(users.deactivating || 0), newUsers: Number(signups.count), activeUsers: Number(active.count), averageRecords: active.count ? Number(totals.count) / Number(active.count) : null, ...amounts(totals), daily: daily.map(d => ({ date: String(d.day).slice(0, 10), ...amounts(d) })) });
  }));
  app.get('/api/admin/users', wrap(async (req, res) => {
    const page = integer(req.query.page, 1, 100000), size = integer(req.query.size, 20, 100), term = search(req.query.search);
    const clauses = ['1=1'], params = [];
    if (term) { clauses.push('(u.username LIKE ? OR u.id=?)'); params.push(like(term), term); }
    if (['active','deactivating'].includes(req.query.status)) { clauses.push('u.status=?'); params.push(req.query.status); }
    if (date(req.query.start)) { clauses.push('u.created_at>=?'); params.push(`${req.query.start} 00:00:00`); }
    if (date(req.query.end)) { const until = new Date(Date.parse(`${req.query.end}T00:00:00Z`) + 86400000).toISOString().slice(0,10); clauses.push('u.created_at<?'); params.push(`${until} 00:00:00`); }
    const where = clauses.join(' AND ');
    const order = req.query.sort === 'last_login' ? 'u.last_login_at DESC' : 'u.created_at DESC';
    const [count, rows] = await Promise.all([
      one(`SELECT COUNT(*) count FROM users u WHERE ${where}`, params),
      query(`SELECT u.id,u.username,u.nickname,u.status,u.created_at,u.last_login_at,COALESCE(r.count,0) bill_count,COALESCE(r.income_cent,0) income_cent,COALESCE(r.expense_cent,0) expense_cent FROM users u LEFT JOIN (SELECT user_id,COUNT(*) count,SUM(IF(type='income',amount_cent,0)) income_cent,SUM(IF(type='expense',amount_cent,0)) expense_cent FROM bill_records WHERE deleted_at IS NULL GROUP BY user_id) r ON r.user_id=u.id WHERE ${where} ORDER BY ${order},u.id LIMIT ? OFFSET ?`, [...params, size, (page - 1) * size]),
    ]);
    res.json({ page, size, total: Number(count.count), rows: rows.map(r => ({ id:r.id, username:r.username, nickname:r.nickname || '', status:r.status, createdAt:datetime(r.created_at), lastLoginAt:datetime(r.last_login_at), billCount:Number(r.bill_count), income:yuan(r.income_cent), expense:yuan(r.expense_cent) })) });
  }));
  app.get('/api/admin/users/:id', wrap(async (req, res) => {
    const u = await one('SELECT u.id,u.username,u.nickname,u.bio,u.status,u.created_at,u.last_login_at,a.image_data avatar FROM users u LEFT JOIN user_avatars a ON a.user_id=u.id WHERE u.id=?', [req.params.id]);
    if (!u) return res.status(404).json({ error: '用户不存在' });
    const [totals, dates, months, bills, budgets, deletion] = await Promise.all([
      one("SELECT COUNT(*) count,SUM(IF(type='income',amount_cent,0)) income_cent,SUM(IF(type='expense',amount_cent,0)) expense_cent FROM bill_records WHERE user_id=? AND deleted_at IS NULL", [u.id]),
      one('SELECT MIN(record_date) first_date,MAX(record_date) last_date FROM bill_records WHERE user_id=? AND deleted_at IS NULL', [u.id]),
      query("SELECT DATE_FORMAT(record_date,'%Y-%m') month,SUM(IF(type='income',amount_cent,0)) income_cent,SUM(IF(type='expense',amount_cent,0)) expense_cent FROM bill_records WHERE user_id=? AND deleted_at IS NULL AND record_date>=DATE_SUB(CURDATE(),INTERVAL 12 MONTH) GROUP BY month ORDER BY month", [u.id]),
      query(`SELECT b.id,b.user_id,u.username,b.type,b.amount_cent,b.record_date,b.note,b.created_at,b.deleted_at,c.name category,c.icon,c.deleted_at category_deleted_at ${recordJoin} WHERE b.user_id=? AND b.deleted_at IS NULL ORDER BY b.record_date DESC,b.created_at DESC LIMIT 10`, [u.id]),
      query('SELECT period_month month,budget_cent FROM budgets WHERE user_id=? ORDER BY period_month DESC LIMIT 12', [u.id]),
      one("SELECT status,requested_at,purge_after FROM account_deletions WHERE user_id=? ORDER BY requested_at DESC LIMIT 1", [u.id]),
    ]);
    res.json({ user: { id:u.id, username:u.username, nickname:u.nickname || '', bio:u.bio || '', avatar:u.avatar || null, status:u.status, createdAt:datetime(u.created_at), lastLoginAt:datetime(u.last_login_at), firstRecordDate:dates.first_date ? String(dates.first_date).slice(0,10) : null, lastRecordDate:dates.last_date ? String(dates.last_date).slice(0,10) : null, ...amounts(totals) }, monthly: months.map(m => ({ month:m.month, income:yuan(m.income_cent), expense:yuan(m.expense_cent) })), recentRecords:bills.map(recordOut), budgets:budgets.map(b => ({ month:b.month, amount:yuan(b.budget_cent) })), deletion:deletion ? { status:deletion.status, requestedAt:datetime(deletion.requested_at), purgeAfter:datetime(deletion.purge_after) } : null });
  }));
  app.get('/api/admin/records', wrap(async (req, res) => {
    const { start, end, where, params } = whereRecords(req.query);
    const page = integer(req.query.page, 1, 100000), size = integer(req.query.size, 20, 100);
    const [totals, rows] = await Promise.all([
      one(`SELECT COUNT(*) count,SUM(IF(b.type='income',b.amount_cent,0)) income_cent,SUM(IF(b.type='expense',b.amount_cent,0)) expense_cent ${recordJoin} WHERE ${where}`, params),
      query(`${recordSelect} WHERE ${where} ORDER BY b.record_date DESC,b.created_at DESC,b.id DESC LIMIT ? OFFSET ?`, [...params,size,(page-1)*size]),
    ]);
    res.json({ start, end, page, size, total:Number(totals.count), summary:amounts(totals), rows:rows.map(recordOut) });
  }));
  app.get('/api/admin/records/:id', wrap(async (req, res) => {
    const row = await one(`${recordSelect} WHERE b.id=?`, [req.params.id]);
    if (!row) return res.status(404).json({ error: '账单不存在' });
    res.json({ ...recordOut(row), note:row.note || '' });
  }));
  app.get('/api/admin/analytics', wrap(async (req, res) => {
    const { start, end, until, where, params } = whereRecords(req.query);
    const bucket = req.query.granularity === 'month' ? "DATE_FORMAT(b.record_date,'%Y-%m')" : 'b.record_date';
    const [trend, categories, frequency] = await Promise.all([
      query(`SELECT ${bucket} bucket,SUM(IF(b.type='income',b.amount_cent,0)) income_cent,SUM(IF(b.type='expense',b.amount_cent,0)) expense_cent FROM bill_records b JOIN users u ON u.id=b.user_id LEFT JOIN categories c ON c.id=b.category_id WHERE ${where} GROUP BY bucket ORDER BY bucket`, params),
      query(`SELECT b.type,c.id category_id,c.name,c.icon,c.deleted_at,COUNT(*) count,SUM(b.amount_cent) amount_cent,COUNT(DISTINCT b.user_id) users FROM bill_records b JOIN users u ON u.id=b.user_id LEFT JOIN categories c ON c.id=b.category_id WHERE ${where} GROUP BY b.type,c.id,c.name,c.icon,c.deleted_at ORDER BY amount_cent DESC LIMIT 100`, params),
      query('SELECT user_id,COUNT(*) count FROM bill_records WHERE record_date>=? AND record_date<? AND deleted_at IS NULL GROUP BY user_id', [start, until]),
    ]);
    const distribution = { '1-5':0, '6-20':0, '21-50':0, '51+':0 };
    for (const row of frequency) distribution[row.count <= 5 ? '1-5' : row.count <= 20 ? '6-20' : row.count <= 50 ? '21-50' : '51+']++;
    res.json({ start,end,trend:trend.map(t => ({ bucket:String(t.bucket).slice(0,10), income:yuan(t.income_cent), expense:yuan(t.expense_cent), balance:yuan(Number(t.income_cent || 0)-Number(t.expense_cent || 0)) })), categories:categories.map(c => ({ id:c.category_id, type:c.type, name:c.name || '未分类', icon:c.icon || '📌', deleted:Boolean(c.deleted_at), count:Number(c.count), users:Number(c.users), amount:yuan(c.amount_cent) })), distribution });
  }));
  app.get('/api/admin/budgets', wrap(async (req, res) => {
    const month = period(req.query), page = integer(req.query.page,1,100000), size = integer(req.query.size,20,100);
    const [population, aggregate, spent, thresholds, count, rows, categories] = await Promise.all([
      one('SELECT COUNT(*) count FROM users'),
      one('SELECT COUNT(*) count,SUM(budget_cent) budget_cent FROM budgets WHERE period_month=?', [month]),
      one("SELECT COALESCE(SUM(r.amount_cent),0) spent_cent FROM bill_records r JOIN budgets b ON b.user_id=r.user_id AND b.period_month=? WHERE r.deleted_at IS NULL AND r.type='expense' AND r.record_date>=? AND r.record_date<DATE_ADD(?,INTERVAL 1 MONTH)",[month,`${month}-01`,`${month}-01`]),
      query("SELECT z.percent FROM (SELECT b.user_id,IFNULL(SUM(r.amount_cent),0)/b.budget_cent*100 percent FROM budgets b LEFT JOIN bill_records r ON r.user_id=b.user_id AND r.deleted_at IS NULL AND r.type='expense' AND r.record_date>=? AND r.record_date<DATE_ADD(?,INTERVAL 1 MONTH) WHERE b.period_month=? GROUP BY b.user_id,b.budget_cent) z", [`${month}-01`,`${month}-01`,month]),
      one('SELECT COUNT(*) count FROM budgets WHERE period_month=?', [month]),
      query("SELECT b.user_id,u.username,b.budget_cent,IFNULL(SUM(r.amount_cent),0) spent_cent FROM budgets b JOIN users u ON u.id=b.user_id LEFT JOIN bill_records r ON r.user_id=b.user_id AND r.deleted_at IS NULL AND r.type='expense' AND r.record_date>=? AND r.record_date<DATE_ADD(?,INTERVAL 1 MONTH) WHERE b.period_month=? GROUP BY b.user_id,u.username,b.budget_cent ORDER BY u.username LIMIT ? OFFSET ?", [`${month}-01`,`${month}-01`,month,size,(page-1)*size]),
      query("SELECT bc.user_id,bc.category_id,c.name,c.icon,bc.budget_cent,COALESCE(SUM(r.amount_cent),0) spent_cent FROM budget_categories bc JOIN categories c ON c.id=bc.category_id LEFT JOIN bill_records r ON r.user_id=bc.user_id AND r.category_id=bc.category_id AND r.type='expense' AND r.deleted_at IS NULL AND r.record_date>=? AND r.record_date<DATE_ADD(?,INTERVAL 1 MONTH) WHERE bc.period_month=? GROUP BY bc.user_id,bc.category_id,c.name,c.icon,bc.budget_cent", [`${month}-01`,`${month}-01`,month]),
    ]);
    const categoryMap = new Map(); for (const c of categories) { const list=categoryMap.get(c.user_id)||[]; list.push({ id:c.category_id,name:c.name,icon:c.icon,amount:yuan(c.budget_cent),spent:yuan(c.spent_cent),remaining:yuan(Number(c.budget_cent)-Number(c.spent_cent)) }); categoryMap.set(c.user_id,list); }
    res.json({ month,page,size,total:Number(count.count),population:Number(population.count),covered:Number(aggregate.count),coverage:population.count ? Number(aggregate.count)/Number(population.count) : 0,budget:yuan(aggregate.budget_cent),spent:yuan(spent.spent_cent),above80:thresholds.filter(t=>t.percent>=80).length,above100:thresholds.filter(t=>t.percent>=100).length,rows:rows.map(r=>({ userId:r.user_id,username:r.username,budget:yuan(r.budget_cent),spent:yuan(r.spent_cent),remaining:yuan(Number(r.budget_cent)-Number(r.spent_cent)),percent:r.budget_cent ? Number(r.spent_cent)/Number(r.budget_cent)*100 : 0,categories:categoryMap.get(r.user_id)||[] })) });
  }));
  app.get('/api/admin/categories', wrap(async (req, res) => {
    const rows=await query("SELECT type,builtin,COUNT(*) total FROM categories WHERE deleted_at IS NULL AND hidden=0 GROUP BY type,builtin");
    res.json({ rows:rows.map(r=>({ type:r.type,builtin:Boolean(r.builtin),count:Number(r.total) })) });
  }));
  app.get('/api/admin/system', wrap(async (req, res) => {
    const [deletions, failures, locks, migrations, events] = await Promise.all([
      query('SELECT status,COUNT(*) count FROM account_deletions GROUP BY status'),
      one("SELECT COALESCE(SUM(fail_count),0) count FROM auth_login_attempts WHERE scope IN ('login_username','login_ip')"),
      one("SELECT COUNT(*) count FROM auth_login_attempts WHERE lock_until>UTC_TIMESTAMP(3) AND scope='login_username'"),
      query('SELECT status,COUNT(*) count FROM data_migrations GROUP BY status'),
      one('SELECT COUNT(*) count FROM analytics_events'),
    ]);
    res.json({ checkedAt:new Date().toISOString(),database:'ok',deletions:Object.fromEntries(deletions.map(x=>[x.status,Number(x.count)])),loginFailures:Number(failures.count),lockedAccounts:Number(locks.count),migrations:Object.fromEntries(migrations.map(x=>[x.status,Number(x.count)])),eventCount:Number(events.count) });
  }));
  app.get('/api/admin/export/:kind', wrap(async (req, res) => {
    const kind=req.params.kind;
    if (!['users','records','summary'].includes(kind)) return res.status(404).json({ error:'导出类型不存在' });
    const workbook=new ExcelJS.Workbook(); workbook.creator='每日记账本后台';
    const sheet=workbook.addWorksheet(kind==='users'?'用户列表':kind==='records'?'账单明细':'收支汇总');
    let rows=[];
    if (kind==='users') {
      const term=search(req.query.search), clauses=['1=1'], params=[];
      if (term) { clauses.push('(u.username LIKE ? OR u.id=?)'); params.push(like(term),term); }
      if (['active','deactivating'].includes(req.query.status)) { clauses.push('u.status=?'); params.push(req.query.status); }
      if (date(req.query.start)) { clauses.push('u.created_at>=?'); params.push(`${req.query.start} 00:00:00`); }
      if (date(req.query.end)) { const until=new Date(Date.parse(`${req.query.end}T00:00:00Z`)+86400000).toISOString().slice(0,10); clauses.push('u.created_at<?'); params.push(`${until} 00:00:00`); }
      const count=await one(`SELECT COUNT(*) count FROM users u WHERE ${clauses.join(' AND ')}`,params);
      if (count.count>10000) throw Object.assign(Error('结果超过 10000 行，请缩小筛选范围'),{status:400});
      rows=await query(`SELECT u.id,u.username,u.nickname,u.status,u.created_at,u.last_login_at FROM users u WHERE ${clauses.join(' AND ')} ORDER BY u.created_at DESC`,params);
      sheet.addRow(['用户 ID','用户名','网名','状态','注册时间','最近登录']);
      for (const r of rows) sheet.addRow([r.id,r.username,r.nickname||'',r.status,datetime(r.created_at)||'',datetime(r.last_login_at)||'']);
    } else if (kind==='records') {
      const {where,params}=whereRecords(req.query);
      const count=await one(`SELECT COUNT(*) count ${recordJoin} WHERE ${where}`,params);
      if (count.count>10000) throw Object.assign(Error('结果超过 10000 行，请缩小日期范围'),{status:400});
      rows=await query(`${recordSelect} WHERE ${where} ORDER BY b.record_date DESC,b.created_at DESC`,params);
      sheet.addRow(['日期','用户名','类型','分类','金额（元）','备注摘要','创建时间']);
      for (const r of rows) sheet.addRow([String(r.record_date).slice(0,10),r.username,r.type==='income'?'收入':'支出',r.category||'未分类',yuan(r.amount_cent),(r.note||'').slice(0,20),datetime(r.created_at)||'']);
      sheet.getColumn(5).numFmt='#,##0.00';
    } else {
      const {start,until}=range(req.query);
      rows=await query("SELECT record_date,SUM(IF(type='income',amount_cent,0)) income_cent,SUM(IF(type='expense',amount_cent,0)) expense_cent,COUNT(*) count FROM bill_records WHERE deleted_at IS NULL AND record_date>=? AND record_date<? GROUP BY record_date ORDER BY record_date",[start,until]);
      sheet.addRow(['日期','收入（元）','支出（元）','结余（元）','账单笔数']);
      for (const r of rows) sheet.addRow([String(r.record_date).slice(0,10),yuan(r.income_cent),yuan(r.expense_cent),yuan(Number(r.income_cent)-Number(r.expense_cent)),Number(r.count)]);
      for (const col of [2,3,4]) sheet.getColumn(col).numFmt='#,##0.00';
    }
    sheet.getRow(1).font={bold:true,color:{argb:'FF9B3F5A'}};
    sheet.views=[{state:'frozen',ySplit:1}];
    sheet.columns.forEach(col=>{col.width=Math.max(16,Math.min(40,col.width||22));});
    const bytes=await workbook.xlsx.writeBuffer();
    res.set('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition',`attachment; filename="admin-${kind}-${today()}.xlsx"`);
    res.send(Buffer.from(bytes));
  }));
}
