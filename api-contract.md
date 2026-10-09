# api-contract.md — 接口契约（第 3 周唯一仲裁物）

> 项目：knowledge-quest（知识闯关）
> 建立日期：Day 15（2026-10-03）
> 规则：后端照契约实现，前端照契约调用；任何接口改动先改这份文档再改代码。
> 状态标记：`✅ 已实现` / `🕐 已登记未实现（标注实现日）` / `🔮 第 4 周`

## 一、页面动作 → 接口对照表（Day 15 填写）

| 第 2 周页面上的动作 | 需要后端提供什么 |
|---|---|
| 健康检查（部署链路验证） | `GET /api/health` |
| 浏览卡片列表（含科目筛选、关键词搜索） | `GET /api/cards`（支持 `subject`、`q` 查询参数） |
| 打开卡片详情页（`#/card/:id`，含同科目相关卡） | `GET /api/cards/:id` |
| 「＋ 添加卡片」录入新卡（Day 18 起直接写进真库） | `POST /api/cards` ✅ |
| 修改自己加的卡（改答案 / 难度 / 子分类 / 题面） | `PATCH /api/cards/:id` ✅ |
| 删除自己加的卡（Day 22 起改为真删库；此前只删本机 localStorage） | `DELETE /api/cards/:id` ✅ |
| 查看闯关最佳战绩（现在存 localStorage） | `GET /api/quiz-records` |
| 闯关结束后写入战绩（现在只存本机） | `POST /api/quiz-records` |

## 二、数据模型概览（Day 16 建表的唯一依据）

按「一个主对象 + 一堆按时间累积的记录」两张表模式（对应打卡示例 plan_days / checkins）：

| 表 | 角色 | 字段 |
|---|---|---|
| `cards` | 主对象：知识卡片 | `id`（serial 主键）、`subject`（科目，text）、`sub`（子分类，text，空串=未细分）、`type`（类型，text）、`level`（难度 1-3，int）、`front`（正面/问题，text）、`back`（背面/答案，text）、`source`（`mock` / `user`，text）、`created_at`（timestamptz） |
| `quiz_records` | 记录：每次闯关结果 | `id`（serial 主键）、`score`（答对数，int）、`total`（总题数，int）、`card_ids`（本轮抽中的卡片 id 数组，int[]）、`date`（成绩日期，date）、`created_at`（timestamptz） |

前端 mock 数据 `data/quest-cards.json` 的 24 张卡即 `cards` 表的种子数据（Day 16 灌入），字段一一对应。

### 两表关联（Day 16 补）

`cards.id` ← `quiz_records.card_ids`（**弱关联**：数组包含，不建外键）。

- 存的是「本轮抽中了哪几张卡」，因此能回答「这张卡我被考过几次、答错几次」这类问题。
- 用弱关联而非外键的原因：战绩是**历史快照**——卡被删改（Day 22 的 DELETE）后，历史成绩不该跟着变，所以允许 `card_ids` 里出现已不存在的 id。
- 查询示例：`SELECT * FROM quiz_records WHERE card_ids @> ARRAY[3]`（第 3 号卡的所有闯关记录）。

### 字段口径说明（Day 16 补，逐字段核对产出）

| 字段 | 口径 |
|---|---|
| `id` | **入库后一律为数据库生成的整数**。前端本机新增卡在 localStorage 里用字符串 `u<时间戳>` 作临时 id，入库时由数据库重新分配，请求体**不含** id。 |
| `sub` | 二级分类，可为空串 `''`（表示未细分）。一级/二级分类都允许用户自定义，故用 text 而非 enum。 |
| `source` | **由服务端写入，请求体不含该字段**：种子数据写 `mock`，用户经 `POST /api/cards` 新增写 `user`。Day 22「mock 卡不可删除」据此判断。 |
| `local` | 前端 localStorage 用户卡上的本机标记（`true` 表示只存在本机），**不入库、不属于接口字段**。 |
| `created_at` | 服务端生成（`now()`），请求体不含。时间为 ISO 8601 带时区（`2026-10-04T13:30:00+08:00`）。 |
| `card_ids` | 服务端可写可不写：前端若上报本轮抽中的卡则写入，缺省为空数组 `{}`。 |
| `date` | 用户本地日期 `YYYY-MM-DD`，不按 UTC 切日。 |


## 三、接口登记

### 通用约定

- 成功响应统一带 `"ok": true`；业务数据放 `data` 字段。
- 错误响应统一形状：`{ "ok": false, "error": { "code": "<错误码>", "message": "<人话描述>" } }`，HTTP 状态码 4xx/5xx。
- 时间一律 ISO 8601（`2026-10-03T12:00:00+08:00`）。
- 列表响应统一带 `"count"`（本页条数），方便前端核对。

### 服务端如何访问数据库（Day 17 补充，实测结论）

接口形状不变，但「云函数怎么读到数据库」这件事在免费体验版上做过调整，记录在此备查：

| 方案 | 结论 | 依据 |
|---|---|---|
| pg 直连（`PGHOST`/`PGUSER`/`PGPASSWORD` + pg 模块） | ❌ 本环境走不通 | 探针函数实测：数据库内网地址 `28.72.71.124:54325` **TCP 超时**；平台不注入 `PG*` 环境变量；免费体验版无「内网互联 / 公网直连」能力 |
| 网关 HTTP API（PostgREST）+ 环境 API Key | ✅ **采用** | 探针实测网关域名可达（`401` = 通、缺鉴权）；创建 API Key 后可直读真库并验证「改库→接口变」 |

- **实现位置**：所有查询集中在 `cloudbase/functions/api/db.js`（Day 19 会在此基础上正式拆成 repository 并跑回归）。
- **参数化**：HTTP API 不传 SQL 字符串，查询条件以 URL query 参数下发、由服务端解析绑定，不存在字符串拼接注入。
- **密钥管理**：API Key 只进云函数环境变量（部署时由**不入库**的 `cloudbaserc.local.json` 注入）；前端、仓库、Git 历史里都没有它。
- **跨域（CORS）**：免费版不允许新增「安全域名」（CLI 实测：当前套餐无法执行此操作），改为由云函数按白名单回显 `Access-Control-Allow-Origin`（**不使用 `*`**）；白名单＝GitHub Pages ＋ CloudBase 静态托管 ＋ 本机任意端口。

### 部署后怎么访问（Day 17 补充，实测结论）

| 方式 | 结果 | 说明 |
|---|---|---|
| 前端 `fetch` / `curl` / 任何 HTTP 客户端 | ✅ 正常 | 返回 `application/json`，形状与本文档完全一致 |
| **浏览器地址栏直接打开接口地址** | ⚠️ 会**下载**而不是显示 | 网关给所有响应硬加 `content-disposition: attachment`，函数侧设置会被覆盖；静态托管同理（同为 `tcbgw`） |
| 想「在浏览器里看到返回」 | ✅ 用公网核验台 | <https://xingho-vibecoding.github.io/knowledge-quest/tools/api-live.html>（GitHub Pages 不加 `attachment`）：地址栏是公网地址，页内显示接口地址 + 状态 + 原始 JSON |

> 这是平台行为，不影响接口契约，也不影响前端。记录在此，免得以后有人拿接口地址在浏览器里试、以为接口坏了。

### 1. `GET /api/health` ✅ 已实现（Day 15）

- 请求参数：无
- 成功：`200 { "ok": true, "service": "knowledge-quest", "time": "<服务器时间>" }`
- 错误：理论上无（不连数据库；连不上网关即 502）

### 2. `GET /api/cards` ✅ 已实现（Day 17）

- 请求参数（query，均可选）：`subject`（科目名，精确匹配）、`q`（关键词，对 front/back 做包含匹配）、`limit`（默认 100）
- 成功：`200 { "ok": true, "count": <n>, "data": [ { id, subject, sub, type, level, front, back, source, created_at }, ... ] }`
- 错误：`400 { ok:false, error:{ code:"BAD_LIMIT", message:"limit 必须是正整数" } }`；`500 { ..., code:"DB_ERROR" }`
- 空数据不报错：`count: 0, data: []`（前端已有「没有找到相关内容」空态承接）

### 3. `GET /api/cards/:id` ✅ 已实现（Day 17）

- 请求参数：路径参数 `id`（正整数）
- 成功：`200 { "ok": true, "data": { id, subject, sub, type, level, front, back, source, created_at } }`
- 错误：`400 { code:"BAD_ID" }`（id 非正整数）；`404 { code:"CARD_NOT_FOUND", message:"卡片不存在" }`（前端详情页边界态承接）

### 4. `POST /api/cards` ✅ 已实现（Day 18）

- 请求体（JSON）：`{ subject, sub, type, level, front, back }` —— `sub`（子分类）可选、缺省为空串，其余均必填；`level` 为 1-3 整数；`subject`/`type` ≤ 8 字；`sub` ≤ 12 字；`front` ≤ 200 字；`back` ≤ 500 字
- 请求体**不含** `id` / `source` / `created_at`（三者由服务端生成，见「字段口径说明」）
- **防重复判定（Day 18 定）**：同一 `subject` 下、`front`（去掉首尾空白后）完全相同的卡只保留一张。命中时返回 `409`，不写入。
- 校验口径（Day 18 实现）：长度按 **Unicode 码点**计（中文一个字算 1）；错误信息一律中文，**说明缺了哪个字段 / 哪个字段不合规**，不返回堆栈。
- 成功：`201 { "ok": true, "data": { id, subject, sub, type, level, front, back, source: "user", created_at } }` —— 返回的是**数据库写入后的真实行**（含库分配的 `id` 与库生成的 `created_at`）
- 错误：`400 { code:"VALIDATION_ERROR", message:"缺少必填字段「题面」" ｜ "「科目」太长了：最多 8 个字，现在有 9 个字" ｜ "「难度」要在 1~3 之间，现在填的是 5" }`；`409 { code:"DUPLICATE_CARD", message:"这张卡已经存在了（口语 · id 29）：同一科目下题面相同的卡只存一张" }`；`500 { code:"DB_ERROR" }`

### 5. `PATCH /api/cards/:id` ✅ 已实现（Day 22）

- 请求参数：路径参数 `id`（正整数）
- 请求体（JSON）：`{ front?, back?, sub?, level? }` —— **可改字段只有这四个，且至少要给一个**
- **不可改字段**（出现即报错，**不静默忽略**）：`id`（数据库主键）、`subject`（科目——改它等于换了张卡，历史战绩与筛选口径都会跟着飘）、`type`（分类骨架）、`source`（服务端记账字段）、`created_at`（服务端生成）
- 校验口径：与 `POST /api/cards` **完全同一套**（长度按 Unicode 码点计、`level` 限 1~3、错误信息为中文并指明是哪个字段不合规）
- **防重复**：改 `front` 后若与**同一 `subject` 下另一张卡**的 `front` 相同 → `409`；把 `front` 填成原值（等于没变）不算重复
- 成功：`200 { "ok": true, "data": { id, subject, sub, type, level, front, back, source, created_at } }` —— 返回的是**改完的真实行**（return=representation），前端不必再 GET 一次
- 错误：`400 BAD_ID`（id 非正整数）／`404 CARD_NOT_FOUND`（id 不存在）／`400 EMPTY_PATCH`（空请求体）／`400 IMMUTABLE_FIELD`（夹带不可改字段）／`400 UNKNOWN_FIELD`（不认识的字段）／`400 VALIDATION_ERROR`／`409 DUPLICATE_CARD`／`500 DB_ERROR`
- **对内只读卡（`source=mock`）不设限制（Day 22 定）**：改是可逆的（改回来即可），护栏留给不可逆的操作。种子卡允许修正答案与难度。

### 6. `DELETE /api/cards/:id` ✅ 已实现（Day 22）

- 请求参数：路径参数 `id`（正整数）
- 成功：`200 { "ok": true, "data": { id, subject, sub, type, level, front, back, source, created_at } }` —— 返回的是**被删掉的那一整行**（留作操作凭据）
- 错误：`400 BAD_ID`（id 非正整数）／`404 CARD_NOT_FOUND`（id 不存在，**绝不返回 200 假成功**）／`403 NOT_DELETABLE`（`source !== 'user'` 的内置卡不可删：删掉就得重灌种子数据）
- **三层护栏（各管一段，缺一不可）**：
  1. **服务端只读卡保护**——`source=mock` 一律 `403`，护栏在最里面，绕过前端也拦得住；
  2. **存在性校验**——查不到就 `404`，不给「假成功」留空子；
  3. **前端二次确认**——不可逆操作要求用户点两次（见 `tools/checkup.html` 的两步删除按钮）。
- **与战绩表的关系**：`quiz_records.card_ids` 是**弱关联**，历史战绩里可能留着这张卡的 id；删卡后战绩不跟着变（这正是 Day 16 选弱关联的原因），故 `card_ids` 允许出现已不存在的 id。

### 7. `GET /api/quiz-records` ✅ 已实现（Day 17）

- 请求参数：`limit`（默认 10，按 date 倒序）
- 成功：`200 { "ok": true, "count": <n>, "data": [ { id, score, total, card_ids, date, created_at }, ... ] }`
- 错误：同通用错误形状

### 8. `POST /api/quiz-records` ✅ 已实现（Day 18）

- 请求体（JSON）：`{ score, total, card_ids?, date }` —— `score`/`total`/`date` 必填；`card_ids` 可选（本轮抽中的卡片 id 数组，缺省为空数组）；`0 ≤ score ≤ total ≤ 100`；`date` 为 `YYYY-MM-DD`
- **防重复判定（Day 18 定）**：同一天 + 同分数 + 同题数 + **同一批卡 id**（顺序也一致）= 同一条战绩，只记一次（对应打卡示例里「同一天同一计划项不重复打卡」）。命中时返回 `409`。
- 成功：`201 { "ok": true, "data": { id, score, total, card_ids, date, created_at } }`
- 错误：`400 { code:"VALIDATION_ERROR", message:"缺少必填字段「日期」" ｜ "「日期」要写成 YYYY-MM-DD 的样子，例如 2026-10-05，现在收到的是「2026/10/05」" ｜ "答对数不能大于总题数（score=9 大于 total=5）" ｜ "「抽中的卡 id」里出现了不是正整数的值：-2" }`；`409 { code:"DUPLICATE_RECORD" }`
- **前端接线状态（Day 18）**：接口已可用，但**前端还没接**——闯关页目前仍只把最佳战绩写在本机（`kq_best_score`）。改动涉及「每轮结束 POST 一条 + 最佳战绩改由 `GET /api/quiz-records` 取最大值」，和 Day 18 主任务（写接口本身）不是一回事，留到前端收敛那天一并做，免得两件事混在一次提交里说不清。

## 四、明确不做（截至 Day 22）

- 用户账号/登录（本项目自用数据，不做多用户隔离）
- **批量操作**（批量改 / 批量删）——Day 22 教材明确划出范围；单条接口已足够，批量会让「一次失误影响面」变大，等真有需求再谈
- **软删除**（只在记录上打 `is_deleted` 标记、查询时跳过）——Day 22 归入「余力加练」，本次未做，登记为待办；真要做时，接口形状不变，改的是 `remove` 的语义与所有查询的过滤条件
- 定时任务、外部数据源接入

> 已从本清单移出：**卡片修改（PATCH）**——Day 22 已实现，见第三章第 5 节。

## 五、变更记录

| 日期 | 变更 | 原因 |
|---|---|---|
| Day 15（2026-10-03） | 建立本文档；7 个接口登记；首次定义两张表模型 | 第 3 周开工 |
| Day 16（2026-10-04） | **契约一致性核对后修订 6 处**：① `cards` 补 `sub` 子分类字段；② `quiz_records` 补 `card_ids` 数组字段并明确两表**弱关联**；③ 新增「字段口径说明」（`id`/`source`/`local`/`created_at`/`card_ids`/`date`）；④ `POST /api/cards` 请求体补 `sub` 与「不含 id/source/created_at」；⑤ 各读接口响应字段清单补 `sub`/`card_ids`；⑥ 登记「前端只存单条最佳战绩 vs 接口写每轮一条」的差异（Day 18 处理） | 建表时拿真实数据（`data/quest-cards.json` 24 张卡全带 `sub`）与前端 `js/main.js`、`js/store.js` 的字段逐条核对，发现契约漏记；按「先改契约再改代码」的规矩回填 |
| Day 17（2026-10-04） | ① `GET /api/cards`、`GET /api/cards/:id`、`GET /api/quiz-records` 标记 **已实现**；② 新增「服务端如何访问数据库」实测结论（pg 直连在免费版走不通 → 改用网关 HTTP API + 环境 API Key）；③ 登记 CORS 白名单方案 | 读接口上线，公网 7 项验证通过（含真库变更联动、400/404/501 错误形状）；访问方式变更属实现细节，接口形状未动 |
| Day 17 补充（2026-10-04） | 新增「部署后怎么访问」实测结论：网关强制 `content-disposition: attachment`，浏览器直开接口地址会下载而非显示 JSON；公网可读入口改由 Pages 上的 `tools/api-live.html` 承担 | 接口与契约形状零改动，仅补访问方式说明；已回退三次无效尝试的代码 |
| Day 19（2026-10-06） | **接口形状零改动**——本次是纯结构重构（把数据库代码从接口里拆进数据访问层），按规矩在变更记录里留档说明「契约未受影响」：7 个接口的路径、方法、请求体、响应形状、错误码全部逐字节不变 | 重构验收即回归：31 条用例快照重构前后 **MD5 完全相同**（本地 + 公网各跑一遍），写接口回归 28/28；路由表逐条对照零新增。契约文档本身仅新增本行 |
| Day 20（2026-10-06） | **接口形状零改动**——本次是前端换心脏（页面请求目标从本地 `data/quest-cards.json` 改为公网接口），后端未改一行。后端侧唯一变化是「被调用」；前端侧新增 `js/config.js`（接口地址唯一收敛点 `KQ_CONFIG.API_BASE`）与 `tools/checkup.html`（云端数据检查台） | 第 3 周主线要求「拿到一个可分享的公网 URL，页面展示真实数据」。已实测：公网首页 1 条请求、检查台 4 条请求全部指向公网地址，本机地址 0 条；页面外改库后刷新内容跟着变（真数据验证）；写入仍走既有 `POST /api/cards`，201/409 行为不变 |
| Day 22（2026-10-09） | **接口形状变更**（本契约第 4 周第一次真改形状）：① 新增 `PATCH /api/cards/:id`；② `DELETE /api/cards/:id` 由 `🔮 第 4 周` 转为**已实现**，并把成功响应从原先草案的 `data:{ id }` 改成 **返回被删掉的一整行**（草案时期未定，按 Day 22 实测口径定稿）；③ CORS `Access-Control-Allow-Methods` 增加 `PATCH`（否则浏览器预检就把请求掐了）；④ 「卡片修改（PATCH）」从第四章「明确不做」移出，「批量操作」「软删除」补入 | 第 4 周主线：数据从「只能加」变成「能改能删」。按规矩先改本文档再改代码。回归证据：Day 19 的 31 条只读快照用例**保持条数不变**重跑一遍，仅 **2 条**行为有变（且正是本次实现的接口留下的占位用例——`DELETE /api/cards` 集合级 `501→404`、`DELETE /api/cards/5` 内置卡 `501→403`），其余 **29 条逐字节一致**；本地代码与线上部署那两份 31 条结果 md5 相同。新增接口自身的行为验证 30 条用例（本地 / 公网各跑一遍，全绿，无 5xx）见 `docs/day22-checkin.md` |

> 核对方法：`information_schema.columns` 拉真实表结构 + `pg_constraint` 拉真实约束，与本文档字段清单逐条对齐；结论见 `docs/day16-contract-check.md`。

