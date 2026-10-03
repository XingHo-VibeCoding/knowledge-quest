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
| 「＋ 添加卡片」录入新卡（现在存 localStorage） | `POST /api/cards` |
| 删除自存卡（现在删 localStorage） | `DELETE /api/cards/:id` |
| 查看闯关最佳战绩（现在存 localStorage） | `GET /api/quiz-records` |
| 闯关结束后写入战绩（现在只存本机） | `POST /api/quiz-records` |

## 二、数据模型概览（Day 16 建表的唯一依据）

按「一个主对象 + 一堆按时间累积的记录」两张表模式（对应打卡示例 plan_days / checkins）：

| 表 | 角色 | 字段 |
|---|---|---|
| `cards` | 主对象：知识卡片 | `id`（serial 主键）、`subject`（科目，text）、`type`（类型，text）、`level`（难度 1-3，int）、`front`（正面/问题，text）、`back`（背面/答案，text）、`source`（`mock` / `user`，text）、`created_at`（timestamptz） |
| `quiz_records` | 记录：每次闯关结果 | `id`（serial 主键）、`score`（答对数，int）、`total`（总题数，int）、`date`（成绩日期，date）、`created_at`（timestamptz） |

前端 mock 数据 `data/quest-cards.json` 的 24 张卡即 `cards` 表的种子数据（Day 16 灌入），字段一一对应。

## 三、接口登记

### 通用约定

- 成功响应统一带 `"ok": true`；业务数据放 `data` 字段。
- 错误响应统一形状：`{ "ok": false, "error": { "code": "<错误码>", "message": "<人话描述>" } }`，HTTP 状态码 4xx/5xx。
- 时间一律 ISO 8601（`2026-10-03T12:00:00+08:00`）。
- 列表响应统一带 `"count"`（本页条数），方便前端核对。

### 1. `GET /api/health` ✅ 已实现（Day 15）

- 请求参数：无
- 成功：`200 { "ok": true, "service": "knowledge-quest", "time": "<服务器时间>" }`
- 错误：理论上无（不连数据库；连不上网关即 502）

### 2. `GET /api/cards` 🕐 Day 17 实现

- 请求参数（query，均可选）：`subject`（科目名，精确匹配）、`q`（关键词，对 front/back 做包含匹配）、`limit`（默认 100）
- 成功：`200 { "ok": true, "count": <n>, "data": [ { id, subject, type, level, front, back, source, created_at }, ... ] }`
- 错误：`400 { ok:false, error:{ code:"BAD_LIMIT", message:"limit 必须是正整数" } }`；`500 { ..., code:"DB_ERROR" }`
- 空数据不报错：`count: 0, data: []`（前端已有「没有找到相关内容」空态承接）

### 3. `GET /api/cards/:id` 🕐 Day 17 实现

- 请求参数：路径参数 `id`（正整数）
- 成功：`200 { "ok": true, "data": { id, subject, type, level, front, back, source, created_at } }`
- 错误：`400 { code:"BAD_ID" }`（id 非正整数）；`404 { code:"CARD_NOT_FOUND", message:"卡片不存在" }`（前端详情页边界态承接）

### 4. `POST /api/cards` 🕐 Day 18 实现

- 请求体（JSON）：`{ subject, type, level, front, back }` —— 均必填；`level` 为 1-3 整数；`subject`/`type` ≤ 8 字；`front` ≤ 200 字；`back` ≤ 500 字
- 成功：`201 { "ok": true, "data": { id, ..., source: "user", created_at } }`
- 错误：`400 { code:"VALIDATION_ERROR", message:"缺字段/超长/level 越界" }`；`500 { code:"DB_ERROR" }`

### 5. `DELETE /api/cards/:id` 🔮 Day 22 实现（第 4 周）

- 请求参数：路径参数 `id`
- 成功：`200 { "ok": true, "data": { id } }`
- 错误：`404 { code:"CARD_NOT_FOUND" }`；`403 { code:"NOT_DELETABLE", message:"mock 卡不可删除" }`

### 6. `GET /api/quiz-records` 🕐 Day 17 实现

- 请求参数：`limit`（默认 10，按 date 倒序）
- 成功：`200 { "ok": true, "count": <n>, "data": [ { id, score, total, date, created_at }, ... ] }`
- 错误：同通用错误形状

### 7. `POST /api/quiz-records` 🕐 Day 18 实现

- 请求体（JSON）：`{ score, total, date }` —— 均必填；`0 ≤ score ≤ total ≤ 100`；`date` 为 `YYYY-MM-DD`
- 成功：`201 { "ok": true, "data": { id, score, total, date, created_at } }`
- 错误：`400 { code:"VALIDATION_ERROR" }`

## 四、明确不做（第 3 周范围外）

- 用户账号/登录（本项目自用数据，不做多用户隔离）
- 卡片修改（PATCH）——如需要列入第 4 周
- 定时任务、外部数据源接入
