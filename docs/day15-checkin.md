# Day 15｜打通云端链路 · 打卡材料

> 项目：knowledge-quest（知识闯关）｜第 3 周第 1 天
> 环境：`zgr202511108235qr-d2dkj33964b842`（免费体验版 / 上海 / 2027-04-03 到期）

---

## 一、每日一问

**今日问题**：公网地址第一次打开时，你第一个想确认的是哪一件事？

**答**：今天把「知识闯关」的第一条云端链路打通了——部署云函数 `/api/health`、把前端 mock 版传上静态托管、写下接口契约 `api-contract.md`。
公网地址第一次打开时，我第一个想确认的是：**它是真的跑在云上，还是只是"本机跑得通"的假象**。
我的判断依据不是"浏览器能打开"（那有可能是缓存），而是两条：① 同一个地址换成命令行请求也拿到了 `{"ok":true}`，说明返回来自云端而不是本地缓存；② 域名是 CloudBase 的默认域名，不是 localhost。
这两条同时成立，才算这一步真的通了——因为后面 13 天的所有接口都走这同一条路。

**卡在哪一步（也算答）**：写代码没花多少时间，卡在网关。CLI 自动建的 `/api` 路由把上游登记成了**事件函数（SCF）**，而我们的函数是 **Web 函数（WEB_SCF）**，类型对不上，网关一直返回 `FUNCTIONS_PARAM_INVALID`。把路由类型改成 `WEB_SCF` 并等网关收敛后，`/api/health` 才返回 200。这一步让我明白：**"部署成功"≠"能访问"**，中间还有路由类型这一层要对齐。

---

## 二、commit 标题与说明

**标题**：Day 15｜打通云端链路

**说明**：
- **改了什么**：无（今天不改前端页面，第 2 周的页面原样上传）
- **加了什么**：`api-contract.md`（7 个接口的路径 / 方法 / 请求 / 响应 / 错误形状）；`cloudbase/functions/api/`（云函数：`index.js` 事件翻译层 + `server.js` HTTP 壳 + `scf_bootstrap` 启动文件）；`cloudbase/deploy.sh`（一键部署：建函数 → 开 `/api` 路由 → 传静态站）；`cloudbaserc.json`；`docs/day15-cloudbase-setup.md`（环境三项记录）、`docs/day15-cloudbase-deploy-log.md`（部署排查实录）、`docs/day15-cloud-function-explained.md`（云函数逐段讲解）

对应提交：`e79d918`（接口契约 + 云函数 + 部署清单）、`0c772a9`（装 CLI，部署压成一条命令）、`c71a977`（自检留档 + 云函数讲解 + 本地预演壳）

---

## 三、今天交的三张截图

| # | 截的是什么 | 文件 | 图里能看到 |
|---|---|---|---|
| 1 | 云函数公网地址的返回 | `kq_cb_api_health.png` | 地址栏 `…service.tcloudbase.com/api/health` + 返回 `{"ok":true,"service":"knowledge-quest","time":"…"}` |
| 2 | 前端公网页面 | `kq_cb_site.png` | 地址栏 `…-1500012353.tcloudbaseapp.com/index.html` + 知识闯关页面（卡片墙、展览模式入口） |
| 3 | 控制台环境信息 | `kq_cb_console2.png`（+ `kq_cb_console.png` 概览） | 地址栏 `console.cloud.tencent.com/tcb/env/index` + 环境 ID `zgr202511108235qr-d2dkj33964b842`、套餐「包年包月环境 体验版」、到期时间 `2027-04-03 23:59:59` |

> 关于「剩余额度」：免费体验版是**包月套餐**（每月 3,000 资源点、0 元、不支持按量付费），控制台没有"按量余额"数字，只有套餐规格与有效期——因此额度信息以官方定价页 + 环境卡片上的套餐类型为准，已记进 `docs/day15-cloudbase-setup.md`。

---

## 四、完成情况自检（对照教材完成标准）

| 教材要求 | 状态 | 证据 |
|---|---|---|
| 按附录 M 注册开通 CloudBase，记录三项 | ✅ | 环境 `zgr202511108235qr-d2dkj33964b842` / 3,000 资源点每月 / 2027-04-03 到期（`docs/day15-cloudbase-setup.md`） |
| 部署 `/api/health` 云函数，拿到公网地址 | ✅ | `https://zgr202511108235qr-d2dkj33964b842.service.tcloudbase.com/api/health` → 200 |
| 第 2 周前端（mock 版）部署到静态托管 | ✅ | `https://zgr202511108235qr-d2dkj33964b842-1500012353.tcloudbaseapp.com` |
| 产出 `api-contract.md` 并入库 | ✅ | 仓库根目录，7 接口，自检 42/42 项通过 |
| 公网可访问返回 JSON | ✅ | 线上实测 6 组：`/health` 200、4 个已登记未实现接口 501、未知路径 404 |
| 截图三张 | ✅ | 见上表 |
| 收尾：列改动文件清单 + 提交推送 | ✅ | 见第二节 |
| 余力加练：AI 逐段解释云函数 | ✅ | `docs/day15-cloud-function-explained.md` |

**今日不做（守住了）**：没有实现任何业务接口、没有建数据库表、没有配跨域——按教材这些属于 Day 16–20。

---

## 五、下一步（Day 16 预告）

按 `api-contract.md` 的两张表模型（`cards` / `quiz_records`）建表和种子数据，并保证 `seed.sql` 可重复执行。
