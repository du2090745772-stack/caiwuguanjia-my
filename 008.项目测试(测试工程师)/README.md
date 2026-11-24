# 每日记账本测试工程

本目录只放测试配置与测试代码，不修改 `004前端开发/画面设计`、`004前端开发/框架开发`、`007多端应用app开发/uni-app-应用` 的业务代码。三份具体测试计划在 `测试计划/`，每次运行产生的结果在 `测试报告/`（已从 Git 排除）。

## 安装与命令

在本目录执行 `npm install`。网页自动化调用本机已安装的 Google Chrome；如未安装 Chrome，先安装浏览器或调整 Playwright 配置。

| 命令 | 作用与前提 |
| --- | --- |
| `npm test` | 运行后端健康检查、uni-app 配置检查和网页桌面/手机冒烟；需先启动后端及网页静态托管 |
| `npm run test:web` | Playwright 打开网页版，检查游客入口与记账弹窗；默认 `http://127.0.0.1:3000`，可用 `TEST_WEB_URL` 覆盖 |
| `npm run test:backend:smoke` | 检查 `/healthz`；默认地址同上，可用 `TEST_BACKEND_URL` 覆盖；只读 |
| `npm run test:backend:integration` | 运行后端现有数据库集成测试；**会写数据库**，仅在显式设置 `DB_NAME` 和相同的 `TEST_DB_NAME`、且名称以 `_test` 结尾时运行；需准备独立测试库及后端所需密钥 |
| `npm run test:uni` | 用 Node 内置测试器检查三端构建入口与接口配置；不启动设备，不访问数据库 |
| `npm run test:uni:build` | 依次编译微信小程序、App、H5，并写出构建结果；编译通过不等于真机功能通过 |

后端现有集成测试入口仍在 `004前端开发/框架开发/test/auth.e2e.test.js`。测试工程通过安全检查后调用它，没有移动或改写该文件。不要在后端目录直接用生产配置执行 `npm test`。

## 文件作用

| 文件 | 作用 |
| --- | --- |
| `tests/web/playwright.config.mjs` | 配置桌面和手机 Chrome、网页地址、失败截图/追踪、HTML 与 JUnit 报告目录 |
| `tests/web/navigation.spec.mjs` | 检查着陆页的游客入口及桌面/手机“记一笔”弹窗 |
| `tests/backend/smoke.test.mjs` | 只读检查后端健康接口与数据库可用状态 |
| `tests/uni/project.test.mjs` | 检查 uni-app 三端构建命令、单页入口和正式包接口配置约束 |
| `scripts/run-node-tests.mjs` | 统一运行 Node 测试并生成 JUnit 报告 |
| `scripts/run-backend-integration.mjs` | 在写库集成测试前强制核对测试数据库名，再调用既有用例 |
| `scripts/run-uni-build.mjs` | 依次执行三个目标构建，汇总结果到 `测试报告/uni-build.json` |

## 报告与边界

- 网页报告：`测试报告/网页-html/`、`网页-junit.xml`、`网页-artifacts/`。
- 后端与 uni-app：`backend-junit.xml`、`backend-integration-junit.xml`、`uni-junit.xml`、`uni-build.json`。
- 当前是测试工程骨架与基础冒烟。更完整的金额、跨账号隔离、游客合并、三端真机和正式包测试需按三份计划继续补充；这些场景不能由基础冒烟通过推定为已通过。
