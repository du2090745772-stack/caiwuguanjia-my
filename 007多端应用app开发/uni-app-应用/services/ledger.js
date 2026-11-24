import { API_BASE_URL } from "../config/api.js";

const PREFIX = "peach.uni.";
const get = (key, fallback) => {
	try {
		return uni.getStorageSync(PREFIX + key) || fallback;
	} catch {
		return fallback;
	}
};
const put = (key, value) => uni.setStorageSync(PREFIX + key, value);
const del = (key) => uni.removeStorageSync(PREFIX + key);
const uuid = () =>
	"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		return (c === "x" ? r : (r & 3) | 8).toString(16);
	});
const date = () => {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const defaults = [
	["expense", "餐饮", "🍜"],
	["expense", "交通", "🚌"],
	["expense", "购物", "🛍️"],
	["expense", "住房", "🏠"],
	["expense", "娱乐", "🎮"],
	["expense", "医疗", "💊"],
	["expense", "人情", "🎁"],
	["expense", "学习", "📚"],
	["expense", "其他", "📌"],
	["income", "工资", "💰"],
	["income", "理财", "📈"],
	["income", "兼职", "💼"],
	["income", "红包", "🧧"],
	["income", "其他", "📌"],
];
const local = () => {
	const state = get("guest", null);
	if (state) return state;
	const fresh = {
		categories: defaults.map(([type, name, icon]) => ({
			id: uuid(),
			type,
			name,
			icon,
			builtin: true,
		})),
		records: [],
		budgets: {},
		profile: {
			username: "",
			nickname: "翔翔",
			bio: "认真记录每一笔生活。",
			avatar: "",
		},
	};
	put("guest", fresh);
	return fresh;
};
const save = (state) => put("guest", state);
const base = API_BASE_URL;
const platform = () => {
	// #ifdef MP-WEIXIN
	return "miniprogram";
	// #endif
	// #ifdef APP-PLUS
	return uni.getSystemInfoSync().platform === "ios" ? "ios" : "android";
	// #endif
	return "web";
};
function deviceId() {
	let id = get("deviceId", "");
	if (!id) {
		id = uuid();
		put("deviceId", id);
	}
	return id;
}
export const session = () => get("auth", null);
export const accountServiceReady = () => Boolean(base);
export const isGuestMode = () => Boolean(get("guestMode", false));
export const enterGuestMode = () => {
	del("auth");
	put("guestMode", true);
};
export const leaveGuestMode = () => del("guestMode");
export const signedIn = () => accountServiceReady() && !isGuestMode() && Boolean(session()?.access_token);
function raw(path, method = "GET", body, token) {
	if (!base)
		return Promise.reject(Error("账号服务尚未部署，请联系开发者"));
	return new Promise((resolve, reject) =>
		uni.request({
			url: base + path,
			method,
			data: body,
			header: {
				"content-type": "application/json",
				"x-device-id": deviceId(),
				"x-platform": platform(),
				...(token ? { authorization: `Bearer ${token}` } : {}),
			},
			success(response) {
				if (response.statusCode >= 200 && response.statusCode < 300)
					return resolve(response.data ?? null);
				const error = response.data?.error;
				reject(
					Error(
						error?.message || `请求失败（${response.statusCode}）`,
					),
				);
			},
			fail() {
				reject(
					Error(
						"暂时无法连接账号服务，请确认电脑与手机网络及服务状态。",
					),
				);
			},
		}),
	);
}
async function authorized(path, method = "GET", body) {
	let auth = session();
	if (!auth) throw Error("请先登录");
	if (auth.expires - Date.now() < 60000) {
		const result = await raw("/auth/refresh", "POST", {
			refresh_token: auth.refresh_token,
		});
		auth = {
			...auth,
			access_token: result.access_token,
			refresh_token: result.refresh_token,
			expires: Date.now() + Number(result.expires_in || 7200) * 1000,
		};
		put("auth", auth);
	}
	return raw(path, method, body, auth.access_token);
}
export async function login(username, password, register = false) {
	const payload = {
		username: username.trim(),
		password,
		...(register ? { privacy_accepted: true } : {}),
	};
	const result = await raw(
		register ? "/auth/register" : "/auth/login",
		"POST",
		payload,
	);
	put("auth", {
		username: result.user.username,
		access_token: result.access_token,
		refresh_token: result.refresh_token,
		expires: Date.now() + Number(result.expires_in || 7200) * 1000,
	});
	leaveGuestMode();
	return result.user;
}
export async function logout() {
	try {
		if (signedIn()) await authorized("/auth/session", "DELETE");
	} finally {
		del("auth");
	}
}
const monthRows = (records, month) =>
	records.filter((r) => r.date?.slice(0, 7) === month);
const summaryOf = (records, month, budget) => {
	const rows = monthRows(records, month),
		categories = new Map(),
		days = new Map();
	let income = 0,
		expense = 0;
	for (const r of rows) {
		if (r.type === "income") income += Number(r.amount);
		else {
			expense += Number(r.amount);
			const item = categories.get(r.categoryId) || {
				id: r.categoryId,
				name: r.category || "未分类",
				icon: r.icon || "📌",
				amount: 0,
			};
			item.amount += Number(r.amount);
			categories.set(r.categoryId, item);
			days.set(r.date, (days.get(r.date) || 0) + Number(r.amount));
		}
	}
	return {
		month,
		income,
		expense,
		balance: income - expense,
		budget: budget ?? null,
		categories: [...categories.values()].sort(
			(a, b) => b.amount - a.amount,
		),
		daily: [...days]
			.map(([day, amount]) => ({ date: day, amount }))
			.sort((a, b) => a.date.localeCompare(b.date)),
	};
};
export async function categories() {
	return signedIn()
		? (await authorized("/data/categories")).categories
		: local().categories;
}
export async function addCategory(value) {
	if (signedIn()) return authorized("/data/categories", "POST", value);
	const state = local();
	if (
		state.categories.some(
			(c) => c.type === value.type && c.name === value.name,
		)
	)
		throw Error("分类名称已存在");
	const row = { ...value, id: uuid(), builtin: false };
	state.categories.push(row);
	save(state);
	return row;
}
export async function editCategory(id, value) {
	if (signedIn()) return authorized(`/data/categories/${id}`, "PUT", value);
	const state = local(),
		row = state.categories.find((c) => c.id === id);
	if (!row) throw Error("分类不存在");
	if (
		state.categories.some(
			(c) => c.id !== id && c.type === row.type && c.name === value.name,
		)
	)
		throw Error("分类名称已存在");
	Object.assign(row, value);
	state.records
		.filter((record) => record.categoryId === id)
		.forEach((record) => {
			record.category = row.name;
			record.icon = row.icon;
		});
	Object.values(state.budgets).forEach((month) =>
		month.categories.forEach((category) => {
			if (category.id === id) category.name = row.name;
		}),
	);
	save(state);
	return row;
}
export async function removeCategory(id) {
	if (signedIn()) return authorized(`/data/categories/${id}`, "DELETE");
	const state = local();
	state.categories = state.categories.filter((c) => c.id !== id);
	save(state);
}
export async function records(month) {
	return signedIn()
		? (await authorized(`/data/records?month=${month}`)).records
		: monthRows(local().records, month).sort((a, b) =>
				b.date.localeCompare(a.date),
			);
}
export async function addRecord(row) {
	if (signedIn()) return authorized("/data/records", "POST", row);
	const state = local(),
		category = state.categories.find((c) => c.id === row.categoryId);
	const result = {
		...row,
		id: uuid(),
		category: category?.name || "未分类",
		icon: category?.icon || "📌",
	};
	state.records.push(result);
	save(state);
	return result;
}
export async function editRecord(id, row) {
	if (signedIn()) return authorized(`/data/records/${id}`, "PUT", row);
	const state = local(),
		target = state.records.find((r) => r.id === id),
		category = state.categories.find((c) => c.id === row.categoryId);
	if (!target) throw Error("账单不存在");
	Object.assign(target, row, {
		category: category?.name || "未分类",
		icon: category?.icon || "📌",
	});
	save(state);
}
export async function removeRecord(id) {
	if (signedIn()) return authorized(`/data/records/${id}`, "DELETE");
	const state = local();
	state.records = state.records.filter((r) => r.id !== id);
	save(state);
}
export async function budget(month) {
	if (signedIn()) return authorized(`/data/budgets?month=${month}`);
	const state = local();
	return {
		month,
		total: state.budgets[month]?.total ?? null,
		categories: state.budgets[month]?.categories || [],
	};
}
export async function saveBudget(month, amount, categoryId) {
	if (signedIn())
		return authorized("/data/budgets", "PUT", {
			month,
			amount,
			categoryId,
		});
	const state = local(),
		current = state.budgets[month] || { total: null, categories: [] };
	if (categoryId) {
		const cat = state.categories.find((c) => c.id === categoryId);
		current.categories = current.categories.filter(
			(c) => c.id !== categoryId,
		);
		current.categories.push({
			id: categoryId,
			name: cat?.name || "未分类",
			amount,
		});
	} else current.total = amount;
	state.budgets[month] = current;
	save(state);
}
export async function removeBudget(month, categoryId) {
	if (signedIn())
		return authorized(
			`/data/budgets?month=${month}${categoryId ? `&categoryId=${categoryId}` : ""}`,
			"DELETE",
		);
	const state = local(),
		item = state.budgets[month];
	if (!item) return;
	if (categoryId)
		item.categories = item.categories.filter((c) => c.id !== categoryId);
	else item.total = null;
	save(state);
}
export async function summary(month) {
	return signedIn()
		? authorized(`/data/summary?month=${month}`)
		: summaryOf(local().records, month, local().budgets[month]?.total);
}
export async function analytics(month) {
	return signedIn()
		? authorized(`/data/analytics?month=${month}`)
		: {
				month,
				rows: monthRows(local().records, month).map((r) => ({
					type: r.type,
					date: r.date,
					amount: r.amount,
					categoryId: r.categoryId,
					name: r.category,
					icon: r.icon,
				})),
			};
}
export async function profile() {
	if (signedIn()) return (await authorized("/data/profile")).profile;
	const state = local();
	const dates = new Set(state.records.map((r) => r.date));
	return {
		...state.profile,
		recordCount: state.records.length,
		activeDays: dates.size,
		firstDate: [...dates].sort()[0] || null,
	};
}
export async function saveProfile(value) {
	if (signedIn()) return authorized("/data/profile", "PUT", value);
	const state = local();
	Object.assign(state.profile, value);
	save(state);
}
export async function changePassword(oldPassword, newPassword) {
	return authorized("/data/password", "PUT", { oldPassword, newPassword });
}
export async function deleteAccount(username, exportPrompted) {
	return authorized("/data/account-deletion", "POST", {
		username,
		exportPrompted,
	});
}
export async function allRecords() {
	return signedIn()
		? (await authorized("/data/export")).records
		: local().records;
}
export function guestCount() {
	const username = session()?.username;
	if (!username) return local().records.length;
	const merged = new Set(get(`merged.${username}`, []));
	return local().records.filter((row) => !merged.has(row.id)).length;
}
export async function mergeGuestRecords() {
	if (!signedIn()) throw Error("请先登录");
	const state = local(),
		username = session().username,
		merged = new Set(get(`merged.${username}`, []));
	const pending = state.records.filter((row) => !merged.has(row.id));
	if (!pending.length) return 0;
	const cloudCategories = await categories();
	let count = 0;
	for (const row of pending) {
		let category = cloudCategories.find(
			(c) => c.type === row.type && c.name === row.category,
		);
		if (!category) {
			category = await addCategory({
				type: row.type,
				name: row.category,
				icon: row.icon || "📌",
			});
			cloudCategories.push(category);
		}
		await authorized("/data/records", "POST", {
			id: row.id,
			type: row.type,
			amount: row.amount,
			date: row.date,
			categoryId: category.id,
			note: row.note || "",
		});
		merged.add(row.id);
		put(`merged.${username}`, [...merged]);
		count++;
	}
	return count;
}
export { date };
