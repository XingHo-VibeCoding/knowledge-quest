# Day 17 打卡 · 第一条读取接口：GET

> 2026-10-04 ｜ 项目：knowledge-quest（知识闯关）｜ 环境：`zgr202511108235qr-d2dkj33964b842`
> 目标库：CloudBase **PostgreSQL 17.11**（体验版 · ap-shanghai）

## 一、今天做了什么

今天让页面第一次从**真数据库**取数：写三个读接口 → 部署到公网 → 逐项验证 → 前端接线。

1. **接口实现**：`GET /api/cards`（支持 `subject`/`q`/`limit`）、`GET /api/cards/:id`、`GET /api/quiz-records`，响应统一 `{ok, data, error}`，与 `api-contract.md` 一致
2. **数据层**：新建 `cloudbase/functions/api/db.js`，所有查询集中在这一层，接口文件里看不到任何查询语句（Day 19 会在此基础上正式拆 repository）
3. **部署**：云函数 `api` 重新部署（环境变量注入见第七节），公网地址不变
4. **前端接线**：`js/main.js` 的 `load()` 改为**优先读公网接口**，接口不可用时回退本地 mock（页面不白屏）
5. **四项检测**：读取检测、真库检测（改库→接口/页面跟着变）、错误形状检测（表名写错→中文错误）、契约对齐检测

## 二、接口清单（全部公网可访问）

基址：`https://zgr202511108235qr-d2dkj33964b842.service.tcloudbase.com`

| 接口 | 参数 | 实测返回 | 状态 |
|---|---|---|---|
| `GET /api/cards` | `subject`（精确）、`q`（front/back 包含）、`limit`（默认 100） | `200 {ok,count:3,data:[...]}` | ✅ |
| `GET /api/cards/:id` | 路径 `id` | `200 {ok,data:{...9 字段}}`；不存在 → `404 CARD_NOT_FOUND` | ✅ |
| `GET /api/quiz-records` | `limit`（默认 10，按 date desc） | `200 {ok,count:6,data:[...]}` | ✅ |
| 参数非法 | — | `400 {ok:false,error:{code:"BAD_LIMIT",message:"limit 必须是 1~1000 之间的整数"}}` | ✅ |
| 未实现接口 | POST / DELETE | `501 {code:"NOT_IMPLEMENTED",message:"…按计划在 Day 18 实现"}` | ✅ 按契约占位 |

> ⚠️ **平台行为记录（实测）**：CloudBase 网关会给**所有**响应硬加 `content-disposition: attachment`，
> 于是浏览器地址栏直接打开接口地址会变成「下载文件」而不是显示 JSON。函数侧返回 `Content-Disposition: inline`
> 改不动它（试过让接口按 `Accept` 返回内联 HTML 页，`content-type` 确实能变成 `text/html`，但 `attachment`
> 照旧——见第七节）。所以「在浏览器里看接口返回」这件事，改由**公网核验台**承担：
>
> 🔗 <https://xingho-vibecoding.github.io/knowledge-quest/tools/api-live.html>
>
> 地址栏就是公网地址，页面里显示**接口公网地址 + HTTP 状态 + 耗时 + 原始 JSON**（截图见第九节「截图五」）。

## 三、完成标准逐条自检

| 完成标准（教材） | 状态 | 证据 |
|---|---|---|
| 公网打开 GET 接口返回 `{ok:true,data:[...]}` | ✅ | `kq_day17_api_live.png`（请求地址 / HTTP 200 / 条数 / 原始 JSON） |
| 「在浏览器里看到返回」这一动作 | ✅ | 接口地址本身会触发下载（平台网关行为，见第二节说明），改由公网核验台承担：`kq_day17_api_public.png`（地址栏 = 公网地址，页内显示接口公网地址 + 200 + 原始 JSON） |
| 记录表也有读接口 | ✅ | `GET /api/quiz-records` 返回 6 条（`count:6`） |
| 数据来自真实数据库（改库后跟着变） | ✅ | `kq_day17_page_after_db.png`：控制台改一行 → 刷新页面，卡片文字跟着变（已改回） |
| 前端不再只认写死的 mock | ✅ | `js/main.js` `loadFromApi()` 优先读接口，`console` 打印数据来源；本地 mock 仅作兜底 |

## 四、自检 4 条（对应教材「今天怎么检测」）

| # | 检测项 | 结果 |
|---|---|---|
| 1 | **读取检测**：接口返回真实数据 | ✅ 24 张卡全部来自库（`cards` 表 24 行），单卡、列表、战绩三类都通；前端页面顶部「共 24 张卡片」与库一致 |
| 2 | **真库检测**（最关键） | ✅ 控制台 `UPDATE cards SET front = front || '（Day17真库验证）' WHERE id = 1;` → 接口与页面同步变化 → 已改回（前后各留一张图） |
| 3 | **错误形状检测** | ✅ 故意把表名改成 `cards_typo_` 重新部署 → 返回 `500 {ok:false, error:{code:"DB_ERROR", message:"数据暂时拿不到，请稍后再试（数据库接口返回 404：Could not find the table …）"}}`，不是白屏也不是英文堆栈 → 已改回并复测正常 |
| 4 | **契约对齐检测** | ✅ 逐字段比对接口实际返回与契约：`cards` 9 字段、`quiz_records` 6 字段、`count`、错误三件套全对齐；**发现差异见第八节每日一问**（`subjects` 不在表里、`id` 类型混用） |

## 五、今日不做 / 卡住降级

- 🛡️ **没写任何写入接口**——证据：`POST /api/cards`、`POST /api/quiz-records` 仍返回 501，云端只改了 `index.js` / `db.js` 两个文件
- 🛡️ **没改表结构**——证据：今天零 SQL 结构变更（只做过一次 `UPDATE` 验证，且已还原）
- ➖ 卡住降级**未触发**：接口本身一次跑通；唯一走不通的是「云函数 pg 直连」，已按等价方案解决（见第七节）

## 六、余力加练：查询参数

已实现 `limit`（1~1000，超界返回 400）、`subject`（精确匹配）、`q`（对 front/back 做包含匹配，例：`q=会议` → 命中「会议结尾做总结（三点式）」）。

## 七、今天最值得记的一件事：云函数怎么连上数据库

教材与官方文档的标准做法是「pg 模块 + `PGHOST`/`PGUSER`/`PGPASSWORD` 环境变量直连」。实测**本环境走不通**，过程留痕如下：

| 步骤 | 做法 | 结果 |
|---|---|---|
| 1 | 部署临时探针函数，检查平台是否注入数据库环境变量 | 65 个环境变量里没有 `PG*`（只有 `SCF_*` 与临时云凭证） |
| 2 | 探针里对库内网地址做 TCP 连通测试 | `28.72.71.124:54325` → **TIMEOUT**（免费体验版无内网互联） |
| 3 | 探针里测试 CloudBase 网关域名 | `https://<envId>.api.tcloudbasegateway.com` → **401**（通，只是缺鉴权） |
| 4 | 用云 API 创建环境 API Key（`service_role`），改走官方「服务端 HTTP API」通道 | ✅ 直接读到真库数据 |
| 5 | 探针任务完成，函数与本地目录一并删除 | ✅ 云端只剩 `api` 一个函数 |

于是新增 `db.js` 作为数据访问层：查询条件全部走 URL 参数下发（等价于参数化，不存在拼接注入），API Key 只存在于云函数环境变量（部署时由**不入库**的 `cloudbaserc.local.json` 注入）。

顺带解决了跨域：免费版不允许新增「安全域名」（CLI 实测：当前套餐无法执行此操作），改为由云函数按白名单回显 `Access-Control-Allow-Origin`（**不使用 `*`**）。

### 顺带踩到的一个平台坑：接口地址在浏览器里会「下载」而不是显示

教材的读取检测写的是「浏览器打开 GET 接口公网地址，应看到 `{ok:true,data:[...]}`」。实测打开后，浏览器**下载了一个文件**，界面上看不到 JSON。查响应头才明白：

```
content-disposition: attachment      ← 网关硬加，函数返回什么都会被它覆盖
content-type: application/json; charset=utf-8
```

三次尝试与结果：

| 尝试 | 结果 |
|---|---|
| 云函数返回 `Content-Disposition: inline` | ❌ 被网关覆盖，仍是 `attachment` |
| 让接口按 `Accept: text/html` 返回内联 HTML 视图 | 半个：`content-type` 确实变成 `text/html`，但 `attachment` **照旧** ❌ |
| 换 CloudBase 静态托管域名（`tcloudbaseapp.com`）看是否也如此 | ❌ 一样是 `server: tcbgw` + `attachment` |

结论：这是 CloudBase HTTP 访问服务的平台行为，应用层改不动。好处是**前端 `fetch` 完全不受影响**（CORS、JSON 都正常）；代价是「把接口地址贴给同学，他点开只会下载一个文件」。于是另做了一个**公网核验台**页面挂在 GitHub Pages 上（Pages 不加 `attachment`）：

🔗 <https://xingho-vibecoding.github.io/knowledge-quest/tools/api-live.html>

地址栏是公网地址、页内显示「接口公网地址 + HTTP 状态 + 耗时 + 原始 JSON」——群里给这个链接，点开就能看。**接口本身与契约一个字没动**；三次尝试的代码改动已全部回退，`index.js` 只留一条注释记录这件事，免得以后再踩。

### 数据「不会去」的地方（反向声明）

- API Key **不会**出现在前端代码、前端请求、仓库、Git 历史里（`.env`、`cloudbaserc.local.json` 均已忽略）
- 云函数响应**不会**返回表内部字段之外的东西（`select` 写死字段清单，不是 `select=*`）
- 页面的卡片数据**不会**再以本地 mock 为主：接口可用时一律用真库，mock 只是接口不可用时的兜底

## 八、每日一问：

> **接口返回的数据里，哪一项和你建的表对不上？怎么发现的？**

有两处对不上，都是接接口那天发现的。

一是**前端要的 `subjects` 分类清单，表里根本没有**——它原本写在 mock 文件顶层，是「按卡片去重推导」的派生数据。接口只给每张卡的 `subject`，前端拿到的是 `undefined`，一级筛选会空。改法是前端自己从卡片推导，不向接口要表里没有的东西。

二是 **id 类型**：库里的卡是整数 id，我本机加的卡是字符串 `u<时间戳>`，混在一个数组里就会按 id 找不到卡。这是 Day 16 登记过的口径差异，今天接接口真的踩到了。

## 九、截图与文件索引

| 材料 | 文件 |
|---|---|
| 截图一 · 接口公网返回（核验台：请求地址 / 状态 / 条数 / 原始 JSON） | `docs/screenshots/kq_day17_api_live.png` |
| 截图二 · 页面显示真实数据（卡片墙，地址栏 + 24 张真库卡） | `docs/screenshots/kq_day17_page_live.png` |
| 截图三 · 真库检测：改一行数据后页面跟着变 | `docs/screenshots/kq_day17_page_after_db.png` |
| 截图四 · 错误形状（400 + 中文人话） | `docs/screenshots/kq_day17_api_error.png` |
| 截图五 · 公网地址直开（地址栏 = Pages 公网地址，页内 = 接口公网地址 + 200 + 原始 JSON） | `docs/screenshots/kq_day17_api_public.png` |
| 核验台（可点按钮现场复核） | `tools/api-live.html` |
| 数据访问层 | `cloudbase/functions/api/db.js` |
| 入口层（路由 / 校验 / 响应形状 / CORS） | `cloudbase/functions/api/index.js` |
| 接口契约（三个 GET 已标记「已实现」） | `api-contract.md` |

## 十、commit

- **标题**：Day 17｜第一条读取接口：GET，页面改读真库
- **改了什么**：`cloudbase/functions/api/index.js`（新增三个 GET 路由 + 参数校验 + CORS 白名单）、`cloudbase/functions/api/server.js`（支持 async 处理器）、`js/main.js`（数据源改为优先读公网接口、失败回退 mock）、`api-contract.md`（标记已实现 + 补「服务端如何访问数据库」实测结论）
- **加了什么**：`cloudbase/functions/api/db.js`（数据访问层）、`tools/api-live.html`（接口真库核验台）、`docs/day17-checkin.md`、`docs/screenshots/kq_day17_*.png`

**补充 commit**（同一天收尾，把「公网怎么给人看」这件事补齐）

- **标题**：Day 17｜补公网可读入口：核验台上线 Pages + 网关 attachment 实测记录
- **改了什么**：`api-contract.md`（新增「部署后怎么访问」实测结论 + 变更记录）、`docs/day17-checkin.md`（第二节平台说明、第三节完成标准、第七节实测小节、第九节截图五）、`cloudbase/functions/api/index.js`（**只加一条注释**记录网关行为，三次无效尝试的代码已全部回退）
- **加了什么**：`docs/screenshots/kq_day17_api_public.png`（地址栏 = 公网地址的接口核验截图）
