<template>
	<view class="app">
		<Landing v-if="page === 'landing'" @login="go('auth')" @guest="startGuest" />
		<view v-else-if="page === 'auth'" class="auth"
			><text class="back" @tap="go('landing')">‹ 返回首页</text
			><text class="brand">✿ 翔翔记账</text
			><text class="title">{{
				registering ? "创建账号" : "欢迎回来"
			}}</text
			><input
				class="field"
				v-model="username"
				placeholder="用户名"
			/><input
				class="field"
				v-model="password"
				password
				placeholder="密码（至少6位）"
			/><text v-if="registering" class="link" @tap="privacy = !privacy"
				>{{ privacy ? "☑" : "□" }} 我同意隐私规则</text
			><button class="primary" @tap="submitAuth">
				{{ registering ? "立即注册" : "登录" }}</button
			><text class="link" @tap="registering = !registering">{{
				registering ? "已有账号？去登录" : "没有账号？立即注册"
			}}</text
			><text v-if="!accountReady" class="link">账号服务尚未部署，暂时无法登录或注册；本地体验的数据只保存在本设备。</text
			><button class="outline" @tap="startGuest">本地体验</button></view
		>
		<view v-else class="shell"
			><view class="sidebar"
				><text class="brand" @tap="go('landing')">✿ 翔翔记账</text
				><view
					v-for="item in nav"
					:key="item.id"
					class="nav-item"
					:class="{ active: page === item.id }"
					@tap="go(item.id)"
					>{{ item.icon }}　{{ item.label }}</view
				><view class="grow"></view
				><view class="nav-item side-account" @tap="go('profile')"
					><view class="avatar side-avatar"><image v-if="signed && profile.avatar" :src="profile.avatar" mode="aspectFill" /><text v-else>{{ avatarInitial }}</text></view><text>{{ displayName }}</text></view
				><view class="nav-item" @tap="signOut">退出账号</view></view
			><view class="main"
				><view class="topbar"
					><text class="brand mobile-brand" @tap="go('landing')"
						>✿ 翔翔记账</text
					><input
						v-model="search"
						placeholder="搜索分类、备注"
						confirm-type="search"
						@confirm="searchNow"
						@focus="openSearch"
						@input="updateSearch"
					/>
				<view v-if="searchVisible && search.trim()" class="search-results">
						<view v-for="result in searchResults" :key="result.key" class="search-result" @tap="chooseSearch(result)">
							<text class="search-result-title">{{ result.title }}</text>
							<text class="search-result-hint">{{ result.hint }}</text>
						</view>
						<view v-if="!searchResults.length" class="search-empty">没有找到相关页面或账单</view>
					</view></view
				><view v-if="searchVisible && search.trim()" class="search-dismiss" @tap="searchVisible = false"></view
				><scroll-view scroll-y class="content" :scroll-into-view="searchTarget" scroll-with-animation>
					<view v-if="page === 'bills'" class="page"
						><text class="overline">DAILY LEDGER</text
						><text class="title">我的流水</text
						><text class="muted"
							>每一笔认真记录，都值得被看见。</text
						><view class="welcome-note"><text>今天也认真记账啦～ 🌸</text><text>“每一笔开销都是生活的温度” · 已记录 {{ profile.activeDays || 0 }} 天</text></view
						><view class="month"
							><text @tap="changeMonth(-1)">‹</text
							><picker
								mode="date"
								fields="month"
								:value="month + '-01'"
								@change="pickMonth"
								><text>{{ month }} ▾</text></picker
							><text @tap="changeMonth(1)">›</text></view
						><view class="metrics"
							><view
								><text>本月支出</text
								><text class="number"
									>¥{{ fmt(summary.expense) }}</text
								></view
							><view
								><text>本月收入</text
								><text class="number green"
									>¥{{ fmt(summary.income) }}</text
								></view
							><view
								><text>结余</text
								><text class="number"
									>¥{{ fmt(summary.balance) }}</text
								></view
							></view
						><view class="card row" @tap="go('budget')"
							><text>本月预算</text
							><text>¥{{ fmt(budget.total) }}　›</text></view
						><view class="section"
							><text>账单明细</text
							><text class="link" @tap="editRecord()"
								>＋ 记一笔</text
							></view
						><view v-if="!rows.length" class="empty"
							>本月还没有账单，记下第一笔吧</view
						><view
							v-for="r in rows"
							:key="r.id"
							:id="'bill-' + r.id"
							class="record"
							@tap="editRecord(r)"
							><text class="icon">{{ r.icon || "📌" }}</text
							><view class="grow"
								><text>{{ r.category }}</text
								><text class="muted"
									>{{ r.date }} ·
									{{ r.note || "无备注" }}</text
								></view
							><text
								:class="r.type === 'income' ? 'green' : 'pink'"
								>{{ r.type === "income" ? "+" : "-" }}¥{{
									fmt(r.amount)
								}}</text
							></view
						></view
					>
					<view v-if="page === 'stats'" class="page"
						><text class="overline">INSIGHTS</text
						><text class="title">收支统计复盘</text
						><view class="month"
							><text @tap="changeMonth(-1)">‹</text
							><picker
								mode="date"
								fields="month"
								:value="month + '-01'"
								@change="pickMonth"
								><text>{{ month }} ▾</text></picker
							><text @tap="changeMonth(1)">›</text></view
						><view class="metrics"
							><view
								><text>总支出</text
								><text class="number"
									>¥{{ fmt(summary.expense) }}</text
								></view
							><view
								><text>总收入</text
								><text class="number green"
									>¥{{ fmt(summary.income) }}</text
								></view
							><view
								><text>日均消费</text
								><text class="number"
									>¥{{ fmt(summary.expense / days) }}</text
								></view
							></view
						><view class="card"
							><view class="section"
								><text>支出分类占比</text></view
							><view class="donut" :style="{ background: donut }"
								><view
									><text>{{ selectedCategory ? selectedCategory.name + '支出' : '本月支出' }}</text
									><text class="number"
										>¥{{ fmt(selectedCategory ? selectedCategory.amount : summary.expense) }}</text
									></view
								></view
							><scroll-view scroll-x
								><view class="chips"
									><text
										class="chip"
										:class="{ selected: !filter }"
										@tap="filter = ''"
										>全部</text
									><text
										v-for="c in summary.categories || []"
										:key="c.id"
										class="chip"
										:class="{ selected: filter === c.id }"
										@tap="filter = c.id"
										>{{ c.icon }} {{ c.name }}
										{{ percent(c.amount) }}%</text
									></view
								></scroll-view
							></view
						><view v-if="selectedCategory" class="selected-insight"><text>{{ selectedCategory.icon }} {{ selectedCategory.name }} · {{ percent(selectedCategory.amount) }}% · {{ statRows.length }} 笔账单</text><text @tap="filter = ''">查看全部 ›</text></view
						><view class="card"
							><view class="section"
								><text>账单明细</text
								><text class="link" @tap="sort = !sort">{{
									sort ? "按默认排序" : "按金额排序"
								}}</text></view
							><view
								v-for="r in statRows"
								:key="r.id"
								class="record"
								@tap="editRecord(r)"
								><text class="icon">{{ r.icon || "📌" }}</text
								><view class="grow"
									><text>{{ r.category }}</text
									><text class="muted">{{
										r.date
									}}</text></view
								><text class="pink"
									>-¥{{ fmt(r.amount) }}</text
								></view
							><view v-if="!statRows.length" class="empty"
								>暂无符合条件的账单</view
							></view
						><view class="card"
						><text>{{ selectedCategory ? selectedCategory.name + '每日支出走势' : '每日支出走势' }}</text
							><scroll-view scroll-x
								><view class="chart"
									><view
										v-for="b in bars"
										:key="b.day"
										class="bar"
										><text>{{
											b.amount ? Math.round(b.amount) : ""
										}}</text
										><view class="bar-track"
											><view
												:style="{
													height: b.height + '%',
												}"
											></view></view
										><text>{{ b.day }}</text></view
									></view
								></scroll-view
							></view
						></view
					>
					<view v-if="page === 'budget'" class="page budget-page"
						><view class="budget-heading"><text class="budget-peach">🍑</text><text class="title">预算管理与超支预警</text></view
						><text class="budget-subtitle">合理规划每笔开销，让存钱变得像手账一样温暖治愈</text
						><view class="month"
							><text @tap="changeMonth(-1)">‹</text
							><picker
								mode="date"
								fields="month"
								:value="month + '-01'"
								@change="pickMonth"
								><text>{{ month.replace('-', '年') }}月 ▾</text></picker
							><text @tap="changeMonth(1)">›</text></view
						><button class="budget-adjust" @tap="editBudget('')">☷　调整总预算</button
						><view class="budget-hero"
							><view class="budget-card-heading"><text class="icon">▣</text><text>{{ Number(month.slice(5)) }}月月度总预算</text><text class="budget-badge">{{ remaining < 0 ? '已超支' : '健康' }} {{ progress.toFixed(1) }}%</text></view
							><view class="budget-spend"><text>已用 ¥{{ fmt(summary.expense) }}</text><text>总额 ¥{{ fmt(budget.total) }}</text></view
							><view class="progress"
								><view
									:style="{ width: progress + '%' }"
								></view></view
							><view class="budget-remaining"><view><text>剩余可用结余</text><text class="big">¥{{ fmt(remaining) }}</text></view><text :class="remaining < 0 ? 'pink' : 'green'">{{ remaining < 0 ? '已超标' : '✓ 未超标' }}</text></view></view
						><view class="card budget-daily"><view class="budget-card-heading"><text class="icon">▣</text><text>建议日均可支配</text><text class="muted">余 {{ remainingDays }} 天</text></view><view><text class="big">¥{{ fmt(Math.max(0, remaining) / remainingDays) }}</text><text class="muted"> / 天</text></view><text class="muted">按剩余可用结余平均测算</text></view
						><view class="card budget-warning"><view class="budget-card-heading"><text class="icon">!</text><text>超支预警监控</text></view><text :class="remaining < 0 ? 'pink' : 'green'">{{ remaining < 0 ? '本月预算已超支，请关注后续开销' : '本月预算状态正常' }}</text></view
						><view class="card"
							><view class="section"
								><text>分类预算明细</text
								><text
									class="link"
									@tap="openCategory('expense')"
									>管理分类</text
								></view
							><view
								v-for="c in expenseCats"
								:key="c.id"
								class="record"
								><text class="icon">{{ c.icon }}</text
								><view class="grow"
									><text>{{ c.name }}</text
									><text class="muted"
										>已支出 ¥{{ fmt(spent(c.id)) }}</text
									></view
								><text class="link" @tap="editBudget(c.id)"
									>¥{{ fmt(catBudget(c.id)) }} ✎</text
								></view
							></view
						></view
					>
					<view v-if="page === 'profile'" class="page"
						><text class="overline">MY JOURNAL</text
							><text class="title">个人主页与手账设置</text
						><view class="card profile"
							><view class="avatar large" @tap="signed ? editProfile() : openLogin()"
								><image
									v-if="signed && profile.avatar"
									:src="profile.avatar"
									mode="aspectFill"
								/><text v-else>{{ avatarInitial }}</text></view
							><view class="grow"
								><text class="title" @tap="!signed && openLogin()">{{ displayName }}</text
								><text class="muted">{{
									profile.bio || "认真记录每一笔生活。"
								}}</text></view
							><button class="outline" @tap="signed ? editProfile() : openLogin()">
								{{ signed ? "编辑资料" : "登录" }}
							</button></view
						><view class="metrics"
							><view
								><text>累计记账</text
								><text class="number"
									>{{ profile.recordCount || 0 }} 笔</text
								></view
							><view
								><text>坚持打卡</text
								><text class="number"
									>{{ profile.activeDays || 0 }} 天</text
								></view
							><view
								><text>开始记录</text
								><text class="number">{{
									profile.firstDate || "—"
								}}</text></view
							></view
						><view class="card"
							><view class="record" @tap="go('bills')"
								>手帐明细 <text class="grow"></text>›</view
							><view class="record" @tap="go('savings')"
								>存钱小金库 <text class="grow"></text>›</view
							><view class="record" @tap="go('account')"
								>账号与安全 <text class="grow"></text>›</view
							><view class="record" @tap="signOut"
								>退出账号 <text class="grow"></text>›</view
							></view
						></view
					>
					<view v-if="page === 'savings'" class="page"
						><text class="back" @tap="go('profile')">‹ 返回</text
						><text class="title">存钱小金库</text
						><view class="card"
							><text>累计结余</text
							><text class="big"
								>¥{{ fmt(totalSavings) }}</text
							></view
						><view
							v-for="s in savings"
							:key="s.month"
							class="record"
							><view class="grow"
								><text>{{ s.month }}</text
								><text class="muted"
									>收入 ¥{{ fmt(s.income) }} · 支出 ¥{{
										fmt(s.expense)
									}}</text
								></view
							><text>¥{{ fmt(s.income - s.expense) }}</text></view
						></view
					>
					<view v-if="page === 'account'" class="page"
						><text class="back" @tap="go('profile')">‹ 返回</text
						><text class="title">账号与安全</text
						><view class="card"
							><view class="record" @tap="editProfile"
								>个人资料 <text class="grow"></text>›</view
							><view class="record" @tap="modal = 'password'"
								>修改密码 <text class="grow"></text>›</view
							><view
								v-if="signed && guestCount"
								class="record"
								@tap="merge"
								>手动合并 {{ guestCount }} 条本地账单
								<text class="grow"></text>›</view
							><view class="record pink" @tap="modal = 'delete'"
								>注销账号 <text class="grow"></text>›</view
							></view
						></view
					>
				</scroll-view></view
			><view class="bottom"
				><view :class="{ active: page === 'bills' }" @tap="go('bills')"><text>☷</text><text>流水</text></view>
				<view @tap="editRecord()"><text>＋</text><text>记一笔</text></view>
				<view :class="{ active: page === 'stats' }" @tap="go('stats')"><text>◴</text><text>统计</text></view>
				<view :class="{ active: page === 'budget' }" @tap="go('budget')"><text>◫</text><text>预算</text></view>
				<view :class="{ active: page === 'profile' }" @tap="go('profile')"><text>♙</text><text>我的</text></view></view
			></view
		>
		<view v-if="modal" class="overlay" @tap="modal = ''"
			><view class="dialog" @tap.stop
				><view class="section"
					><text>{{ modalTitle }}</text
					><text class="link" @tap="modal = ''">×</text></view
				><scroll-view scroll-y class="dialog-content">
					<view v-if="modal === 'record'"
						><view class="segments"
							><text
								:class="{ selected: d.type === 'expense' }"
								@tap="setType('expense')"
								>支出</text
							><text
								:class="{ selected: d.type === 'income' }"
								@tap="setType('income')"
								>收入</text
							></view
						><input
							class="amount"
							type="digit"
							v-model="d.amount"
							placeholder="¥ 0.00"
						/><view class="section"
							><text>分类</text
							><text class="link" @tap="openCategory(d.type)"
								>添加 / 管理分类</text
							></view
						><view class="category-grid"
							><view
								v-for="c in currentCats"
								:key="c.id"
								:class="{ selected: d.categoryId === c.id }"
								@tap="tapCategory(c)"
								><text>{{ c.icon }}</text
								><text>{{ c.name }}</text></view
							></view
						><view class="form-line"
							><text>日期</text
							><picker
								mode="date"
								:value="d.date"
								@change="d.date = $event.detail.value"
								><text>{{ d.date }} ▾</text></picker
							></view
						><input
							class="field"
							v-model="d.note"
							placeholder="备注"
						/><text
							v-if="d.id"
							class="link pink"
							@tap="deleteRecord"
							>删除这笔账单</text
						></view
					>
					<view v-if="modal === 'budget'"
						><view class="form-line"
							><text>预算类型</text
							><picker
								:range="budgetChoices"
								range-key="name"
								:value="budgetChoice"
								@change="
									budgetChoice = Number($event.detail.value)
								"
								><text
									>{{
										budgetChoices[budgetChoice].name
									}}
									▾</text
								></picker
							></view
						><input
							class="amount"
							type="digit"
							v-model="budgetAmount"
							placeholder="¥ 预算金额"
						/><view class="chips"
							><text
								v-for="v in [1000, 3000, 5000, 8000, 10000]"
								:key="v"
								class="chip"
								:class="{
									selected: Number(budgetAmount) === v,
								}"
								@tap="budgetAmount = String(v)"
								>{{ v }}</text
							></view
						><view class="impact"
							><text>当月支出 ¥{{ fmt(summary.expense) }}</text
							><text>当前总预算 ¥{{ fmt(budget.total) }}</text
							><text>已分配分类 ¥{{ fmt(allocated) }}</text
							><text
								>可分配余额 ¥{{
									fmt(Number(budget.total || 0) - allocated)
								}}</text
							><text>调整后影响 ¥{{ fmt(impact) }}</text></view
						><text
							v-if="
								budgetChoice &&
								catBudget(budgetChoices[budgetChoice].id) !=
									null
							"
							class="link pink"
							@tap="deleteBudget"
							>删除此分类预算</text
						></view
					>
					<view v-if="modal === 'categories'"
						><view class="segments"
							><text
								:class="{ selected: catType === 'expense' }"
								@tap="catType = 'expense'"
								>支出</text
							><text
								:class="{ selected: catType === 'income' }"
								@tap="catType = 'income'"
								>收入</text
							></view
						><view
							v-for="c in managedCats"
							:key="c.id"
							class="record"
							><text class="grow">{{ c.icon }} {{ c.name }}</text
							><text
								class="link"
								@tap="
									catDraft = {
										id: c.id,
										name: c.name,
										icon: c.icon,
									}
								"
								>编辑　</text
							><text class="pink" @tap="deleteCategory(c)"
								>删除</text
							></view
						><input
							class="field"
							v-model="catDraft.icon"
							placeholder="图标，如 🍜" /><input
							class="field"
							v-model="catDraft.name"
							placeholder="分类名称"
					/></view>
					<view v-if="modal === 'profile'"
						><view class="profile-pick" @tap="chooseAvatar"
							><image
								v-if="profileDraft.avatar"
								:src="profileDraft.avatar"
								mode="aspectFill"
							/><text v-else>选择头像</text></view
						><input
							class="field"
							v-model="profileDraft.nickname"
							placeholder="昵称" /><input
							class="field"
							v-model="profileDraft.username"
							placeholder="用户名" /><input
							class="field"
							v-model="profileDraft.bio"
							placeholder="简介"
					/></view>
					<view v-if="modal === 'password'"
						><input
							class="field"
							password
							v-model="oldPass"
							placeholder="原密码" /><input
							class="field"
							password
							v-model="newPass"
							placeholder="新密码" /></view
					><view v-if="modal === 'delete'"
						><text class="pink"
							>注销会删除数据库中的个人资料和账单，无法恢复。</text
						><input
							class="field"
							v-model="deleteName"
							placeholder="输入用户名确认"
						/><text class="link" @tap="backup = !backup"
							>{{ backup ? "☑" : "□" }} 我已自行备份数据</text
						></view
					></scroll-view
				><view class="actions"
					><button class="outline" @tap="modal = ''">取消</button
					><button class="primary" @tap="saveModal">
						保存
					</button></view
				></view
			></view
		>
	</view>
</template>
<script>
import * as api from "../../services/ledger.js";
import Landing from "../../components/Landing.vue";
const now = () => api.date().slice(0, 7);
const pad = (v) => String(v).padStart(2, "0");
export default {
	components: { Landing },
	data() {
		return {
			page: "landing",
			accountReady: api.accountServiceReady(),
			modal: "",
			nav: [
				{ id: "bills", icon: "▤", label: "流水" },
				{ id: "stats", icon: "◔", label: "统计" },
				{ id: "budget", icon: "♡", label: "预算" },
				{ id: "profile", icon: "♙", label: "我的" },
			],
			month: now(),
			signed: false,
			rows: [],
			cats: [],
			summary: {
				expense: 0,
				income: 0,
				balance: 0,
				categories: [],
				daily: [],
			},
			budget: { total: null, categories: [] },
			profile: { nickname: "翔翔", bio: "认真记录每一笔生活。" },
			search: "",
			searchVisible: false,
			searchRecords: [],
			searchTarget: "",
			filter: "",
			sort: false,
			username: "",
			password: "",
			registering: false,
			privacy: false,
			d: {},
			budgetChoice: 0,
			budgetAmount: "",
			catType: "expense",
			catDraft: {},
			profileDraft: {},
			oldPass: "",
			newPass: "",
			deleteName: "",
			backup: false,
			guestCount: api.guestCount(),
			savings: [],
			lastCategoryTap: { id: "", at: 0 },
			recordBeforeCategory: false,
		};
	},
	computed: {
		searchResults() {
			const term = this.search.trim().toLocaleLowerCase();
			if (!term) return [];
			const pages = [
				{ id: "bills", title: "首页流水", words: "账单 流水 支出 收入 记一笔" },
				{ id: "stats", title: "统计报表", words: "统计 报表 支出分类占比 账单明细 趋势" },
				{ id: "budget", title: "预算管理", words: "预算 分类预算明细 调整总预算 日可支配" },
				{ id: "profile", title: "个人主页", words: "个人 资料 头像 简介 账户 安全" },
			];
			const results = pages
				.filter((page) => `${page.title} ${page.words}`.toLocaleLowerCase().includes(term))
				.map((page) => ({ key: "page-" + page.id, type: "page", id: page.id, title: page.title, hint: "前往" + page.title }));
			for (const record of this.searchRecords.filter((row) =>
				`${row.category || ""} ${row.note || ""} ${row.amount || ""} ${row.date || ""}`.toLocaleLowerCase().includes(term)
			).slice(0, 6)) {
				results.push({ key: "record-" + record.id, type: "record", id: record.id,
					month: String(record.date).slice(0, 7),
					title: `${record.icon || "📌"} ${record.category || "未分类"} · ¥${Number(record.amount || 0).toFixed(2)}`,
					hint: `${record.date} · ${record.note || "账单"}` });
			}
			return results;
		},
		displayName() {
			return this.signed
				? this.profile.nickname || this.profile.username || "翔翔"
				: "请登录";
		},
		avatarInitial() {
			return this.displayName.slice(0, 1);
		},
		expenseCats() {
			return this.cats.filter((c) => c.type === "expense");
		},
		currentCats() {
			return this.cats.filter((c) => c.type === this.d.type);
		},
		managedCats() {
			return this.cats.filter((c) => c.type === this.catType);
		},
		days() {
			return new Date(
				+this.month.slice(0, 4),
				+this.month.slice(5, 7),
				0,
			).getDate();
		},
		remainingDays() {
			const today = new Date();
			const currentMonth = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0");
			return Math.max(1, this.month === currentMonth ? this.days - today.getDate() + 1 : this.days);
		},
		statRows() {
			const a = this.rows.filter(
				(r) =>
					r.type === "expense" &&
					(!this.filter || String(r.categoryId) === String(this.filter)),
			);
			return this.sort ? [...a].sort((x, y) => +y.amount - +x.amount) : a;
		},
		selectedCategory() {
			return this.filter
				? (this.summary.categories || []).find((c) => String(c.id) === String(this.filter)) || null
				: null;
		},
		remaining() {
			return (
				Number(this.budget.total || 0) -
				Number(this.summary.expense || 0)
			);
		},
		progress() {
			return this.budget.total
				? Math.min(
						100,
						Math.max(
							0,
							(100 * this.summary.expense) / this.budget.total,
						),
					)
				: 0;
		},
		budgetChoices() {
			return [{ id: "", name: "总预算" }, ...this.expenseCats];
		},
		allocated() {
			return (this.budget.categories || []).reduce(
				(n, c) => n + Number(c.amount),
				0,
			);
		},
		impact() {
			return this.budgetChoice
				? Number(this.budget.total || 0) -
						this.allocated +
						Number(
							this.catBudget(
								this.budgetChoices[this.budgetChoice].id,
							) || 0,
						) -
						Number(this.budgetAmount || 0)
				: Number(this.budgetAmount || 0) -
						Number(this.summary.expense || 0);
		},
		modalTitle() {
			return {
				record: "记一笔",
				budget: "预算调整",
				categories: "管理分类",
				profile: "编辑个人资料",
				password: "修改密码",
				delete: "注销账号",
			}[this.modal];
		},
		donut() {
			const list = this.summary.categories || [],
				total = Number(this.summary.expense || 0),
				colors = [
					"#ff8fab",
					"#9bcdb9",
					"#f6bf76",
					"#b5a1d8",
					"#8db9d5",
					"#e99c8a",
				];
			if (!total) return "conic-gradient(#f4e4e9 0 100%)";
			if (this.selectedCategory) {
				const index = list.findIndex((c) => String(c.id) === String(this.filter));
				const share = Math.min(100, Math.max(0, Number(this.selectedCategory.amount) / total * 100));
				return `conic-gradient(${colors[index % colors.length]} 0% ${share}%, #f4e4e9 ${share}% 100%)`;
			}
			let pos = 0;
			return (
				"conic-gradient(" +
				list
					.map((c, i) => {
						const end = pos + (Number(c.amount) / total) * 100,
							s = `${colors[i % colors.length]} ${pos}% ${end}%`;
						pos = end;
						return s;
					})
					.join(",") +
				")"
			);
		},
		bars() {
			const map = {};
			for (const row of this.statRows) {
				const day = Number(String(row.date).slice(-2));
				if (day >= 1 && day <= this.days) map[day] = (map[day] || 0) + Number(row.amount || 0);
			}
			const max = Math.max(1, ...Object.values(map));
			return Array.from({ length: this.days }, (_, i) => ({
				day: i + 1,
				amount: map[i + 1] || 0,
				height: Math.max(3, ((map[i + 1] || 0) / max) * 100),
			}));
		},
		totalSavings() {
			return this.savings.reduce((n, s) => n + s.income - s.expense, 0);
		},
	},
	onLoad() {
		this.signed = api.signedIn();
		this.page = this.signed || api.isGuestMode() || !api.accountServiceReady() ? "bills" : "landing";
		if (!api.accountServiceReady()) api.enterGuestMode();
		if (this.page === "bills") this.refresh();
	},
	methods: {
		startGuest() {
			api.enterGuestMode();
			this.signed = false;
			this.go("bills");
		},
		openLogin() {
			this.registering = false;
			this.go("auth");
		},
		fmt(v) {
			return Number(v || 0).toFixed(2);
		},
		percent(v) {
			return this.summary.expense
				? Math.round((100 * v) / this.summary.expense)
				: 0;
		},
		toast(e) {
			uni.showToast({ title: String(e), icon: "none" });
		},
		async refresh() {
			try {
				const [rows, cats, summary, budget, profile] =
					await Promise.all([
						api.records(this.month),
						api.categories(),
						api.summary(this.month),
						api.budget(this.month),
						api.profile(),
					]);
				this.rows = rows;
				this.cats = cats;
				this.summary = summary;
				this.budget = budget;
				this.profile = profile;
				this.guestCount = api.guestCount();
			} catch (e) {
				this.toast(e.message);
			}
		},
		go(p) {
			this.page = p;
			this.filter = "";
			this.searchVisible = false;
			if (p === "savings") this.loadSavings();
			else if (p !== "landing" && p !== "auth") this.refresh();
		},
		changeMonth(v) {
			const d = new Date(
				+this.month.slice(0, 4),
				+this.month.slice(5, 7) - 1 + v,
				1,
			);
			this.month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
			this.refresh();
		},
		pickMonth(e) {
			this.month = e.detail.value.slice(0, 7);
			this.refresh();
		},
		async submitAuth() {
			if (!api.accountServiceReady()) return this.toast("账号服务尚未部署，暂时无法登录或注册");
			if (this.password.length < 6) return this.toast("密码至少6位");
			if (this.registering && !this.privacy)
				return this.toast("请先同意隐私规则");
			try {
				await api.login(this.username, this.password, this.registering);
				this.signed = true;
				this.go("bills");
			} catch (e) {
				this.toast(e.message);
			}
		},
		async signOut() {
			try {
				if (this.signed) await api.logout();
			} catch (e) {
				this.toast(e.message);
			}
			this.signed = false;
			api.leaveGuestMode();
			this.go("landing");
		},
		async openSearch() {
			this.searchVisible = true;
			try {
				this.searchRecords = await api.allRecords();
			} catch (e) {
				this.searchRecords = [];
				this.toast(e.message);
			}
		},
		updateSearch(e) {
			this.search = e.detail.value;
			this.searchVisible = true;
		},
		searchNow() {
			if (!this.search.trim()) return;
			if (this.searchResults.length) return this.chooseSearch(this.searchResults[0]);
			this.toast("没有找到相关页面或账单");
		},
		async chooseSearch(result) {
			uni.hideKeyboard();
			this.searchVisible = false;
			this.search = "";
			if (result.type === "page") {
				this.searchTarget = "";
				this.go(result.id);
				return;
			}
			this.month = result.month;
			this.page = "bills";
			this.searchTarget = "";
			await this.refresh();
			this.$nextTick(() => { this.searchTarget = "bill-" + result.id; });
		},
		editRecord(r) {
			this.d = r
				? {
						id: r.id,
						type: r.type,
						amount: String(r.amount),
						date: r.date,
						categoryId: r.categoryId,
						note: r.note || "",
					}
				: {
						type: "expense",
						amount: "",
						date: api.date(),
						categoryId: this.expenseCats[0]?.id || "",
						note: "",
					};
			this.modal = "record";
		},
		setType(t) {
			this.d.type = t;
			this.d.categoryId = this.cats.find((c) => c.type === t)?.id || "";
		},
		editBudget(id) {
			this.budgetChoice = Math.max(
				0,
				this.budgetChoices.findIndex((c) => c.id === id),
			);
			this.budgetAmount = String(
				id ? (this.catBudget(id) ?? "") : (this.budget.total ?? ""),
			);
			this.modal = "budget";
		},
		catBudget(id) {
			return (
				this.budget.categories?.find((c) => c.id === id)?.amount ?? null
			);
		},
		spent(id) {
			return (
				this.summary.categories?.find((c) => c.id === id)?.amount || 0
			);
		},
		openCategory(t) {
			this.recordBeforeCategory = this.modal === "record";
			this.catType = t;
			this.catDraft = { id: "", name: "", icon: "" };
			this.modal = "categories";
		},
		tapCategory(c) {
			const at = Date.now();
			if (
				this.lastCategoryTap.id === c.id &&
				at - this.lastCategoryTap.at < 450
			) {
				this.openCategory(c.type);
				this.catDraft = { id: c.id, name: c.name, icon: c.icon };
				this.lastCategoryTap = { id: "", at: 0 };
			} else {
				this.d.categoryId = c.id;
				this.lastCategoryTap = { id: c.id, at };
			}
		},
		editProfile() {
			this.profileDraft = {
				nickname: this.profile.nickname || "",
				username: this.profile.username || "",
				bio: this.profile.bio || "",
				avatar: this.profile.avatar || "",
			};
			this.modal = "profile";
		},
		chooseAvatar() {
			uni.chooseImage({
				count: 1,
				sizeType: ["compressed"],
				success: async (res) => {
					const path = res.tempFilePaths[0];
					try {
					// #ifdef H5
					const image = new Image();
					image.src = path;
					await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
					const canvas = document.createElement("canvas");
					const side = Math.min(image.width, image.height);
					let prepared = "";
					for (const [width, quality] of [[256, .75], [192, .6], [128, .45]]) {
						canvas.width = canvas.height = width;
						canvas.getContext("2d").drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, width, width);
						prepared = canvas.toDataURL("image/jpeg", quality);
						if (prepared.length < 220000) break;
					}
					this.setAvatarData(prepared);
					// #endif
					// #ifdef MP-WEIXIN
					await this.compressAvatar(path);
					// #endif
					// #ifdef APP-PLUS
					await this.compressAvatar(path);
					// #endif
					} catch (e) { this.toast("头像处理失败，请换一张图片重试"); }
				},
			});
		},
		async compressAvatar(path) {
			for (const [width, quality] of [[256, 75], [192, 60], [128, 45]]) {
				const compressed = await new Promise((resolve, reject) => uni.compressImage({
					src: path, quality, compressedWidth: width,
					success: (r) => resolve(r.tempFilePath), fail: reject,
				}));
				let data = "";
				// #ifdef MP-WEIXIN
				const encoded = await new Promise((resolve, reject) => uni.getFileSystemManager().readFile({
					filePath: compressed, encoding: "base64", success: (r) => resolve(r.data), fail: reject,
				}));
				data = `data:image/${/\.png(?:\?|$)/i.test(compressed) ? "png" : "jpeg"};base64,${encoded}`;
				// #endif
				// #ifdef APP-PLUS
				data = await new Promise((resolve, reject) => plus.io.resolveLocalFileSystemURL(compressed,
					(entry) => entry.file((file) => { const reader = new plus.io.FileReader(); reader.onloadend = (e) => resolve(e.target.result); reader.onerror = reject; reader.readAsDataURL(file); }, reject), reject));
				// #endif
				if (data && data.length < 220000) { this.profileDraft.avatar = data; return; }
			}
			this.toast("图片处理后仍然过大，请换一张照片");
		},
		setAvatarData(data) {
			if (!data || data.length >= 220000)
				return this.toast("图片处理后仍然过大，请换一张照片");
			this.profileDraft.avatar = data;
		},
		async saveModal() {
			try {
				if (this.modal === "record") {
					if (!(Number(this.d.amount) > 0) || !this.d.categoryId)
						return this.toast("请输入金额并选择分类");
					const row = {
						type: this.d.type,
						amount: Number(this.d.amount),
						date: this.d.date,
						categoryId: this.d.categoryId,
						note: this.d.note || "",
					};
					if (this.d.id) await api.editRecord(this.d.id, row);
					else await api.addRecord(row);
				} else if (this.modal === "budget") {
					const n = Number(this.budgetAmount);
					if (!Number.isFinite(n) || n <= 0)
						return this.toast("预算金额须大于零");
					await api.saveBudget(
						this.month,
						n,
						this.budgetChoices[this.budgetChoice].id || undefined,
					);
				} else if (this.modal === "categories") {
					if (
						!this.catDraft.name?.trim() ||
						!this.catDraft.icon?.trim()
					)
						return this.toast("请输入分类名称和图标");
					const row = {
						type: this.catType,
						name: this.catDraft.name.trim(),
						icon: this.catDraft.icon.trim(),
					};
					if (this.catDraft.id)
						await api.editCategory(this.catDraft.id, row);
					else {
						const created = await api.addCategory(row);
						if (this.recordBeforeCategory)
							this.d.categoryId = created.id;
					}
				} else if (this.modal === "profile")
					await api.saveProfile(this.profileDraft);
				else if (this.modal === "password") {
					if (!this.signed) return this.toast("请先登录");
					await api.changePassword(this.oldPass, this.newPass);
				} else if (this.modal === "delete") {
					if (
						!this.signed ||
						!this.backup ||
						this.deleteName !== this.profile.username
					)
						return this.toast("请确认备份并输入用户名");
					await api.deleteAccount(this.deleteName, true);
					await api.logout();
					this.signed = false;
					this.page = "landing";
				}
				const previous = this.modal;
				this.modal = "";
				await this.refresh();
				if (previous === "categories" && this.recordBeforeCategory) {
					this.recordBeforeCategory = false;
					this.modal = "record";
				}
				this.toast("已保存");
			} catch (e) {
				this.toast(e.message);
			}
		},
		async deleteBudget() {
			const id = this.budgetChoices[this.budgetChoice]?.id;
			if (!id) return;
			try {
				await api.removeBudget(this.month, id);
				this.modal = "";
				await this.refresh();
				this.toast("已删除分类预算");
			} catch (e) {
				this.toast(e.message);
			}
		},
		deleteRecord() {
			uni.showModal({
				title: "删除账单",
				content: "确定删除？",
				success: async (r) => {
					if (r.confirm) {
						try {
							await api.removeRecord(this.d.id);
							this.modal = "";
							await this.refresh();
						} catch (e) {
							this.toast(e.message);
						}
					}
				},
			});
		},
		deleteCategory(c) {
			uni.showModal({
				title: "删除分类",
				content: `确定删除${c.name}？`,
				success: async (r) => {
					if (r.confirm) {
						try {
							await api.removeCategory(c.id);
							await this.refresh();
						} catch (e) {
							this.toast(e.message);
						}
					}
				},
			});
		},
		async merge() {
			try {
				const n = await api.mergeGuestRecords();
				await this.refresh();
				this.toast(`已合并${n}条账单`);
			} catch (e) {
				this.toast(e.message);
			}
		},
		async loadSavings() {
			try {
				const rows = await api.allRecords(),
					map = {};
				rows.forEach((r) => {
					const m = r.date.slice(0, 7);
					map[m] ??= { month: m, income: 0, expense: 0 };
					map[m][r.type] += Number(r.amount);
				});
				this.savings = Object.values(map).sort((a, b) =>
					b.month.localeCompare(a.month),
				);
			} catch (e) {
				this.toast(e.message);
			}
		},
	},
};
</script>
<style>
@import "./page.css";
</style>
