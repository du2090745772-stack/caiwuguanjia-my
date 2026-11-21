import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { Router } from "express";
import { one, query, run, transaction } from "../db.js";
import { ApiError } from "../http/errors.js";
import { requireAuth } from "../middleware/require-auth.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { validatePassword, validateUsername } from "../auth/validators.js";

export const dataRouter = Router();
dataRouter.use(requireAuth);

const invalid = (message) => new ApiError(400, "invalid_data", message);
const monthOf = (value) =>
  /^\d{4}-(0[1-9]|1[0-2])$/.test(value || "") ? value : null;
const centsOf = (value) => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    !/^\d+(?:\.\d{1,2})?$/.test(String(value))
  )
    throw invalid("金额须大于零，最多两位小数");
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents)) throw invalid("金额过大");
  return cents;
};

dataRouter.get("/categories", async (req, res) => {
  let rows = await query(
    `SELECT id,name,icon,type,builtin FROM categories WHERE user_id=? AND deleted_at IS NULL AND hidden=0 ORDER BY type,sort,created_at`,
    [req.auth.userId],
  );
  if (!rows.length) {
    const existing = await one(
      `SELECT id FROM categories WHERE user_id=? LIMIT 1`,
      [req.auth.userId],
    );
    if (!existing) {
      await run(
        `INSERT INTO categories (id,user_id,name,icon,type,sort,builtin) SELECT UUID(),?,name,icon,type,sort,1 FROM category_templates`,
        [req.auth.userId],
      );
      rows = await query(
        `SELECT id,name,icon,type,builtin FROM categories WHERE user_id=? AND deleted_at IS NULL AND hidden=0 ORDER BY type,sort,created_at`,
        [req.auth.userId],
      );
    }
  }
  res.json({ categories: rows });
});

dataRouter.post("/categories", async (req, res) => {
  const { name, icon = "📌", type } = req.body || {};
  if (
    !["expense", "income"].includes(type) ||
    typeof name !== "string" ||
    !name.trim() ||
    [...name].length > 10 ||
    typeof icon !== "string" ||
    [...icon].length > 4
  )
    throw invalid("分类名称或图标不符合要求");
  const exists = await one(
    `SELECT id,hidden FROM categories WHERE user_id=? AND type=? AND name=? AND deleted_at IS NULL`,
    [req.auth.userId, type, name.trim()],
  );
  if (exists?.hidden) {
    await run(`UPDATE categories SET hidden=0,icon=? WHERE id=? AND user_id=?`, [
      icon,
      exists.id,
      req.auth.userId,
    ]);
    return res.json({ id: exists.id, name: name.trim(), icon, type, restored: true });
  }
  if (exists) throw new ApiError(409, "category_exists", "分类名称已存在");
  const id = randomUUID();
  await run(
    `INSERT INTO categories (id,user_id,name,icon,type,sort) VALUES (?,?,?,?,?,(SELECT COALESCE(MAX(sort),0)+1 FROM (SELECT sort FROM categories WHERE user_id=?) AS ranks))`,
    [id, req.auth.userId, name.trim(), icon, type, req.auth.userId],
  );
  res.status(201).json({ id, name: name.trim(), icon, type });
});

dataRouter.put("/categories/:id", async (req, res) => {
  const { name, icon } = req.body || {};
  if (typeof name !== "string" || !name.trim() || [...name.trim()].length > 10 || typeof icon !== "string" || !icon.trim() || [...icon].length > 4) throw invalid("分类名称或图标不符合要求");
  const category = await one(`SELECT id,type FROM categories WHERE id=? AND user_id=? AND deleted_at IS NULL AND hidden=0`, [req.params.id, req.auth.userId]);
  if (!category) throw new ApiError(404, "not_found", "分类不存在");
  const duplicate = await one(`SELECT id FROM categories WHERE user_id=? AND type=? AND name=? AND id<>? AND deleted_at IS NULL AND hidden=0`, [req.auth.userId, category.type, name.trim(), category.id]);
  if (duplicate) throw new ApiError(409, "category_exists", "分类名称已存在");
  await run(`UPDATE categories SET name=?,icon=? WHERE id=? AND user_id=?`, [name.trim(), icon.trim(), category.id, req.auth.userId]);
  res.json({ id: category.id, type: category.type, name: name.trim(), icon: icon.trim() });
});

dataRouter.delete("/categories/:id", async (req, res) => {
  const row = await one(
    `SELECT id FROM categories WHERE id=? AND user_id=? AND deleted_at IS NULL`,
    [req.params.id, req.auth.userId],
  );
  if (!row) throw new ApiError(404, "not_found", "分类不存在");
  await run(
    `UPDATE categories SET deleted_at=UTC_TIMESTAMP(3) WHERE id=? AND user_id=?`,
    [row.id, req.auth.userId],
  );
  res.json({ deleted: true, message: "分类已从数据库有效列表删除，历史账单仍保留" });
});

dataRouter.get("/budgets", async (req, res) => {
  const month = monthOf(req.query.month);
  if (!month) throw invalid("请选择有效的年月");
  const [total, rows] = await Promise.all([
    one(`SELECT budget_cent FROM budgets WHERE user_id=? AND period_month=?`, [
      req.auth.userId,
      month,
    ]),
    query(
      `SELECT c.id,c.name,bc.budget_cent FROM budget_categories bc JOIN categories c ON c.id=bc.category_id WHERE bc.user_id=? AND bc.period_month=?`,
      [req.auth.userId, month],
    ),
  ]);
  res.json({
    month,
    total: total ? Number(total.budget_cent) / 100 : null,
    categories: rows.map((r) => ({
      id: r.id,
      name: r.name,
      amount: Number(r.budget_cent) / 100,
    })),
  });
});

dataRouter.put("/budgets", async (req, res) => {
  const { month, amount, categoryId } = req.body || {};
  if (!monthOf(month)) throw invalid("请选择有效的年月");
  const cents = centsOf(amount);
  if (categoryId) {
    const category = await one(
      `SELECT id FROM categories WHERE id=? AND user_id=? AND type='expense' AND deleted_at IS NULL`,
      [categoryId, req.auth.userId],
    );
    if (!category) throw invalid("请选择有效分类");
    await run(
      `INSERT INTO budget_categories (id,user_id,period_month,category_id,budget_cent) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE budget_cent=VALUES(budget_cent)`,
      [randomUUID(), req.auth.userId, month, categoryId, cents],
    );
  } else {
    await run(
      `INSERT INTO budgets (id,user_id,period_month,budget_cent) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE budget_cent=VALUES(budget_cent)`,
      [randomUUID(), req.auth.userId, month, cents],
    );
  }
  res.json({ month, amount, categoryId: categoryId || null });
});

dataRouter.get("/records", async (req, res) => {
  const month = monthOf(req.query.month);
  if (!month) throw invalid("请选择有效的年月");
  const rows = await query(
    `SELECT b.id, b.type, b.amount_cent, b.record_date, b.note, b.created_at,
      c.id AS category_id, c.name AS category, c.icon, w.name AS wallet
    FROM bill_records b LEFT JOIN categories c ON c.id = b.category_id AND c.user_id = b.user_id
    LEFT JOIN wallet_accounts w ON w.id = b.wallet_id AND w.user_id = b.user_id
    WHERE b.user_id = ? AND b.deleted_at IS NULL AND b.record_date >= ? AND b.record_date < DATE_ADD(?, INTERVAL 1 MONTH)
    ORDER BY b.record_date DESC, b.created_at DESC, b.id DESC`,
    [req.auth.userId, `${month}-01`, `${month}-01`],
  );
  res.json({
    records: rows.map((r) => ({
      id: r.id,
      type: r.type,
      amount: Number(r.amount_cent) / 100,
      date: String(r.record_date).slice(0, 10),
      categoryId: r.category_id,
      category: r.category || "未分类",
      icon: r.icon || "📌",
      wallet: r.wallet || "",
      note: r.note || "",
    })),
  });
});

dataRouter.post("/records", async (req, res) => {
  const {
    type,
    amount,
    date,
    categoryId,
    note = "",
    id: clientId,
  } = req.body || {};
  if (!["expense", "income"].includes(type)) throw invalid("请选择收支类型");
  if (!validDate(date)) throw invalid("请选择有效日期");
  if (typeof note !== "string" || [...note].length > 100)
    throw invalid("备注不能超过 100 字");
  const amountCent = centsOf(amount);
  const category = await one(
    `SELECT id FROM categories WHERE id = ? AND user_id = ? AND type = ? AND deleted_at IS NULL AND hidden = 0`,
    [categoryId, req.auth.userId, type],
  );
  if (!category) throw invalid("请选择有效分类");
  if (
    clientId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      clientId,
    )
  )
    throw invalid("账单 ID 不符合要求");
  const id = clientId || randomUUID();
  const existing =
    clientId &&
    (await one(`SELECT user_id FROM bill_records WHERE id=?`, [clientId]));
  if (existing) {
    if (existing.user_id !== req.auth.userId)
      throw new ApiError(409, "record_exists", "账单 ID 已存在");
    return res.json({ id, alreadyExists: true });
  }
  await run(
    `INSERT INTO bill_records (id,user_id,type,amount_cent,category_id,note,record_date) VALUES (?,?,?,?,?,?,?)`,
    [id, req.auth.userId, type, amountCent, categoryId, note, date],
  );
  res.status(201).json({ id });
});

dataRouter.get("/summary", async (req, res) => {
  const month = monthOf(req.query.month);
  if (!month) throw invalid("请选择有效的年月");
  const [totals, categories, daily, budget] = await Promise.all([
    one(
      `SELECT COALESCE(SUM(IF(type='expense',amount_cent,0)),0) expense_cent, COALESCE(SUM(IF(type='income',amount_cent,0)),0) income_cent FROM bill_records WHERE user_id=? AND deleted_at IS NULL AND record_date>=? AND record_date<DATE_ADD(?,INTERVAL 1 MONTH)`,
      [req.auth.userId, `${month}-01`, `${month}-01`],
    ),
    query(
      `SELECT c.id,c.name,c.icon,COALESCE(SUM(b.amount_cent),0) amount_cent FROM bill_records b JOIN categories c ON c.id=b.category_id WHERE b.user_id=? AND b.type='expense' AND b.deleted_at IS NULL AND b.record_date>=? AND b.record_date<DATE_ADD(?,INTERVAL 1 MONTH) GROUP BY c.id,c.name,c.icon ORDER BY amount_cent DESC`,
      [req.auth.userId, `${month}-01`, `${month}-01`],
    ),
    query(
      `SELECT record_date,COALESCE(SUM(amount_cent),0) amount_cent FROM bill_records WHERE user_id=? AND type='expense' AND deleted_at IS NULL AND record_date>=? AND record_date<DATE_ADD(?,INTERVAL 1 MONTH) GROUP BY record_date ORDER BY record_date`,
      [req.auth.userId, `${month}-01`, `${month}-01`],
    ),
    one(`SELECT budget_cent FROM budgets WHERE user_id=? AND period_month=?`, [
      req.auth.userId,
      month,
    ]),
  ]);
  res.json({
    month,
    expense: Number(totals.expense_cent) / 100,
    income: Number(totals.income_cent) / 100,
    balance: (Number(totals.income_cent) - Number(totals.expense_cent)) / 100,
    budget: budget ? Number(budget.budget_cent) / 100 : null,
    categories: categories.map((r) => ({
      id: r.id,
      name: r.name,
      icon: r.icon,
      amount: Number(r.amount_cent) / 100,
    })),
    daily: daily.map((r) => ({
      date: String(r.record_date).slice(0, 10),
      amount: Number(r.amount_cent) / 100,
    })),
  });
});

const validDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value || "") &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const recordBody = async (body, userId) => {
  const { type, amount, date, categoryId, note = "" } = body || {};
  if (
    !["expense", "income"].includes(type) ||
    !validDate(date) ||
    typeof note !== "string" ||
    [...note].length > 100
  )
    throw invalid("账单字段不符合要求");
  const category = await one(
    `SELECT id FROM categories WHERE id=? AND user_id=? AND type=? AND deleted_at IS NULL AND hidden=0`,
    [categoryId, userId, type],
  );
  if (!category) throw invalid("请选择有效分类");
  return { type, amountCent: centsOf(amount), date, categoryId, note };
};

dataRouter.put("/records/:id", async (req, res) => {
  const value = await recordBody(req.body, req.auth.userId);
  const result = await run(
    `UPDATE bill_records SET type=?,amount_cent=?,record_date=?,category_id=?,note=? WHERE id=? AND user_id=? AND deleted_at IS NULL`,
    [
      value.type,
      value.amountCent,
      value.date,
      value.categoryId,
      value.note,
      req.params.id,
      req.auth.userId,
    ],
  );
  if (!result.affectedRows) throw new ApiError(404, "not_found", "账单不存在");
  res.json({ id: req.params.id });
});
dataRouter.delete("/records/:id", async (req, res) => {
  const result = await run(
    `UPDATE bill_records SET deleted_at=UTC_TIMESTAMP(3) WHERE id=? AND user_id=? AND deleted_at IS NULL`,
    [req.params.id, req.auth.userId],
  );
  if (!result.affectedRows) throw new ApiError(404, "not_found", "账单不存在");
  res.status(204).end();
});

dataRouter.delete("/budgets", async (req, res) => {
  const month = monthOf(req.query.month);
  if (!month) throw invalid("请选择有效的年月");
  if (req.query.categoryId)
    await run(
      `DELETE FROM budget_categories WHERE user_id=? AND period_month=? AND category_id=?`,
      [req.auth.userId, month, req.query.categoryId],
    );
  else
    await run(`DELETE FROM budgets WHERE user_id=? AND period_month=?`, [
      req.auth.userId,
      month,
    ]);
  res.status(204).end();
});

dataRouter.get("/profile", async (req, res) => {
  const user = await one(
    `SELECT u.username,u.nickname,u.bio,u.status,u.created_at,u.last_synced_at,a.image_data avatar FROM users u LEFT JOIN user_avatars a ON a.user_id=u.id WHERE u.id=?`,
    [req.auth.userId],
  );
  if (!user) throw new ApiError(404, "not_found", "账号不存在");
  const stats = await one(
    `SELECT COUNT(*) record_count,COUNT(DISTINCT record_date) active_days,MIN(record_date) first_date FROM bill_records WHERE user_id=? AND deleted_at IS NULL`,
    [req.auth.userId],
  );
  res.json({
    profile: {
      ...user,
      recordCount: Number(stats.record_count),
      activeDays: Number(stats.active_days),
      firstDate: stats.first_date,
    },
  });
});
dataRouter.put("/profile", async (req, res) => {
  const { nickname, bio, avatar, username } = req.body || {};
  const normalizedUsername = username === undefined ? null : validateUsername(username);
  if (
    typeof nickname !== "string" ||
    [...nickname.trim()].length > 20 ||
    typeof bio !== "string" ||
    [...bio].length > 100 ||
    !(
      avatar === null ||
      (typeof avatar === "string" &&
        ((/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar) &&
          avatar.length < 220000) ||
          avatar === ""))
    )
  )
    throw invalid("个人资料不符合要求");
  try {
    await run(`UPDATE users SET username=COALESCE(?,username),nickname=?,bio=? WHERE id=?`, [normalizedUsername, nickname.trim() || null, bio, req.auth.userId]);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") throw new ApiError(409, "username_exists", "账号名已被使用");
    throw error;
  }
  if (avatar)
    await run(
      `INSERT INTO user_avatars (user_id,image_data) VALUES (?,?) ON DUPLICATE KEY UPDATE image_data=VALUES(image_data)`,
      [req.auth.userId, avatar],
    );
  else await run(`DELETE FROM user_avatars WHERE user_id=?`, [req.auth.userId]);
  res.json({ ok: true });
});

dataRouter.get("/analytics", async (req, res) => {
  const month = monthOf(req.query.month);
  if (!month) throw invalid("请选择有效的年月");
  const rows = await query(
    `SELECT b.type,b.record_date,b.amount_cent,c.id category_id,c.name,c.icon FROM bill_records b LEFT JOIN categories c ON c.id=b.category_id AND c.user_id=b.user_id WHERE b.user_id=? AND b.deleted_at IS NULL AND b.record_date>=? AND b.record_date<DATE_ADD(?,INTERVAL 1 MONTH)`,
    [req.auth.userId, `${month}-01`, `${month}-01`],
  );
  res.json({
    month,
    rows: rows.map((r) => ({
      type: r.type,
      date: String(r.record_date).slice(0, 10),
      amount: Number(r.amount_cent) / 100,
      categoryId: r.category_id,
      name: r.name || "未分类",
      icon: r.icon || "📌",
    })),
  });
});

dataRouter.put("/password", async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (typeof oldPassword !== "string") throw invalid("请输入当前密码");
  const next = validatePassword(newPassword);
  const user = await one(`SELECT password_hash FROM users WHERE id=?`, [
    req.auth.userId,
  ]);
  if (!user || !(await verifyPassword(user.password_hash, oldPassword)))
    throw new ApiError(401, "bad_credentials", "当前密码不正确");
  if (oldPassword === next) throw invalid("新密码不能与当前密码相同");
  await run(
    `UPDATE users SET password_hash=?,password_algo='argon2id' WHERE id=?`,
    [await hashPassword(next), req.auth.userId],
  );
  await run(
    `UPDATE auth_sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE user_id=? AND id<>? AND revoked_at IS NULL`,
    [req.auth.userId, req.auth.sessionId],
  );
  res.json({ ok: true });
});

dataRouter.post("/account-deletion", async (req, res) => {
  const { username, exportPrompted } = req.body || {};
  await transaction(async (conn) => {
    const [rows] = await conn.execute(`SELECT username,status FROM users WHERE id=? FOR UPDATE`, [req.auth.userId]);
    const user = rows[0];
    if (!user || username !== user.username || exportPrompted !== true)
      throw invalid("请先导出账单，再输入本人用户名确认注销");
    if (user.status === "deactivating") throw invalid("注销申请已提交");
    await conn.execute(
      `INSERT INTO account_deletions (id,user_id,username_snapshot,bill_count_snapshot,export_prompted_at,purge_after) VALUES (?,?,?,(SELECT COUNT(*) FROM bill_records WHERE user_id=? AND deleted_at IS NULL),UTC_TIMESTAMP(3),DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 7 DAY))`,
      [randomUUID(), req.auth.userId, user.username, req.auth.userId],
    );
    await conn.execute(`UPDATE users SET status='deactivating' WHERE id=?`, [req.auth.userId]);
    await conn.execute(`UPDATE auth_sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE user_id=? AND revoked_at IS NULL`, [req.auth.userId]);
  });
  res.json({ ok: true, graceDays: 7 });
});

dataRouter.get("/export-excel", async (req, res) => {
  const month = monthOf(req.query.month);
  if (!month) throw invalid("请选择有效的年月");
  const rows = await query(
    `SELECT b.type,b.amount_cent,b.record_date,b.note,c.name category,c.icon FROM bill_records b LEFT JOIN categories c ON c.id=b.category_id AND c.user_id=b.user_id WHERE b.user_id=? AND b.deleted_at IS NULL AND b.record_date>=? AND b.record_date<DATE_ADD(?,INTERVAL 1 MONTH) ORDER BY b.record_date DESC,b.created_at DESC`,
    [req.auth.userId, `${month}-01`, `${month}-01`],
  );
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "每日记账本";
  const detail = workbook.addWorksheet("账单明细");
  detail.columns = [
    { header: "日期", key: "date", width: 16 }, { header: "收支类型", key: "type", width: 14 },
    { header: "分类", key: "category", width: 20 }, { header: "金额", key: "amount", width: 16 },
    { header: "备注", key: "note", width: 40 },
  ];
  for (const row of rows) detail.addRow({ date: String(row.record_date).slice(0, 10), type: row.type === "expense" ? "支出" : "收入", category: `${row.icon || "📌"} ${row.category || "未分类"}`, amount: Number(row.amount_cent) / 100, note: row.note || "" });
  detail.getColumn("amount").numFmt = '¥#,##0.00';
  detail.autoFilter = { from: "A1", to: "E1" };
  const summary = workbook.addWorksheet("统计概览");
  const expense = rows.filter((row) => row.type === "expense").reduce((sum, row) => sum + Number(row.amount_cent), 0) / 100;
  const income = rows.filter((row) => row.type === "income").reduce((sum, row) => sum + Number(row.amount_cent), 0) / 100;
  summary.addRows([["月份", month], ["总支出", expense], ["总收入", income], ["结余", income - expense]]);
  summary.getColumn(1).width = 18; summary.getColumn(2).width = 20;
  const category = workbook.addWorksheet("支出分类");
  category.columns = [{ header: "分类", key: "name", width: 22 }, { header: "支出", key: "amount", width: 18 }];
  const totals = new Map();
  for (const row of rows.filter((item) => item.type === "expense")) {
    const key = `${row.icon || "📌"} ${row.category || "未分类"}`;
    totals.set(key, (totals.get(key) || 0) + Number(row.amount_cent) / 100);
  }
  for (const [name, amount] of totals) category.addRow({ name, amount });
  category.getColumn("amount").numFmt = '¥#,##0.00';
  for (const sheet of workbook.worksheets) {
    sheet.getRow(1).font = { bold: true, color: { argb: "FF9B3F5A" } };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  }
  const bytes = await workbook.xlsx.writeBuffer();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="ledger-${month}.xlsx"`);
  res.send(Buffer.from(bytes));
});

dataRouter.get("/export", async (req, res) => {
  const rows = await query(
    `SELECT b.id,b.type,b.amount_cent,b.record_date,b.note,c.name category,c.icon FROM bill_records b LEFT JOIN categories c ON c.id=b.category_id AND c.user_id=b.user_id WHERE b.user_id=? AND b.deleted_at IS NULL ORDER BY b.record_date DESC,b.created_at DESC`,
    [req.auth.userId],
  );
  res.json({
    records: rows.map((r) => ({
      id: r.id,
      type: r.type,
      amount: Number(r.amount_cent) / 100,
      date: String(r.record_date).slice(0, 10),
      note: r.note || "",
      category: r.category || "未分类",
      icon: r.icon || "📌",
    })),
  });
});
