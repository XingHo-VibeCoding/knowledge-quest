# Day 16 契约一致性核对报告

> 日期：2026-10-04 ｜ 项目：knowledge-quest ｜ 环境：`zgr202511108235qr-d2dkj33964b842`（CloudBase PostgreSQL 17.11）
>
> **做法**：把「实测表结构」与 `api-contract.md` 的数据形状逐字段对照，不一致的地方**先改契约**（契约是唯一仲裁物），再回头确认表结构。
> **结论**：核对 15 个字段 + 7 条约束 + 5 个接口形状，**发现 6 处不一致，全部修正，复算后 0 处**。

## 一、核对方法（三个来源交叉验证）

| 来源 | 取数方式 | 用途 |
|---|---|---|
| 实测表结构 | `information_schema.columns` + `pg_constraint`（真库查询） | 表里到底有什么 |
| 契约文档 | `api-contract.md` 第二章「数据模型概览」+ 各接口响应形状 | 约定应该有什么 |
| 真实数据与代码 | `data/quest-cards.json`（24 张卡）、`js/main.js`（新增卡构造）、`js/store.js`（localStorage） | 实际在用的是什么 |

## 二、cards 表逐字段核对（9 字段）

| # | 字段 | 实测表结构 | 契约原文 | 前端实际使用 | 结论 |
|---|---|---|---|---|---|
| 1 | `id` | `serial` 主键，integer | ✅ 已写（serial 主键） | mock 卡为数字 1–24；用户本机卡为字符串 `u<时间戳>` | ⚠️ **口径不一致** → 补口径说明 |
| 2 | `subject` | `text NOT NULL` | ✅ 已写 | ✅ 用于一级筛选 | 一致 |
| 3 | `sub` | `text NOT NULL DEFAULT ''` | ❌ **缺** | ✅ 24/24 张卡都带，两级分类筛选依赖它 | ❌ **漏记** → 契约补 |
| 4 | `type` | `text NOT NULL DEFAULT '问答'` | ✅ 已写 | ✅ 用于展示 | 一致 |
| 5 | `level` | `integer NOT NULL`，CHECK 1–3 | ✅ 已写（1-3 int） | ✅ 展示难度 | 一致 |
| 6 | `front` | `text NOT NULL` | ✅ 已写 | ✅ 题面 | 一致 |
| 7 | `back` | `text NOT NULL` | ✅ 已写 | ✅ 答案 | 一致 |
| 8 | `source` | `text NOT NULL DEFAULT 'user'`，CHECK `mock`/`user` | ✅ 已写取值范围 | ❌ mock JSON 里没有该字段、前端也不读；前端自存卡用的是另一个标记 `local: true` | ⚠️ **产生方式没写清** → 补口径说明 |
| 9 | `created_at` | `timestamptz NOT NULL DEFAULT now()` | ✅ 已写 | ❌ 前端暂不展示 | 一致（服务端生成） |

## 三、quiz_records 表逐字段核对（6 字段）

| # | 字段 | 实测表结构 | 契约原文 | 前端实际使用 | 结论 |
|---|---|---|---|---|---|
| 1 | `id` | `serial` 主键 | ✅ 已写 | localStorage 最佳战绩里没有 id（本机不需要） | 一致 |
| 2 | `score` | `integer NOT NULL`，CHECK ≥ 0 | ✅ 已写 | ✅ `kq_best_score.score` | 一致 |
| 3 | `total` | `integer NOT NULL`，CHECK 1–100 | ✅ 已写 | ✅ `kq_best_score.total` | 一致 |
| 4 | `card_ids` | `integer[] NOT NULL DEFAULT '{}'` | ❌ **缺** | 后端写入；前端目前不上报 | ❌ **漏记** → 契约补 + 说明关联方式 |
| 5 | `date` | `date NOT NULL` | ✅ 已写 | ✅ `YYYY-MM-DD` | 一致 |
| 6 | `created_at` | `timestamptz NOT NULL DEFAULT now()` | ✅ 已写 | ❌ 前端不做 | 一致 |

## 四、约束核对（7 条）

| 约束 | 表里 | 契约 | 结论 |
|---|---|---|---|
| `cards.level BETWEEN 1 AND 3` | ✅ CHECK | ✅ 写明 | 一致 |
| `cards.source IN ('mock','user')` | ✅ CHECK | ✅ 写明取值范围 | 一致 |
| `cards.id` 主键 | ✅ PRIMARY KEY | ✅ 写明 | 一致 |
| `quiz_records.score >= 0` | ✅ CHECK | ✅（写作 `0 ≤ score ≤ total ≤ 100`） | 一致（等价表达） |
| `quiz_records.total BETWEEN 1 AND 100` | ✅ CHECK | ✅ | 一致 |
| `quiz_records.score <= total` | ✅ CHECK | ✅ | 一致 |
| 两表之间 | **无外键**（故意） | 原文档未说明关联方式 | ⚠️ **没写关联** → 契约补「弱关联」说明 |

## 五、接口契约层面的字段一致性（5 处受影响）

| 接口 | 问题 | 处置 |
|---|---|---|
| `GET /api/cards` | 响应 `data[]` 字段清单缺 `sub` | 补 `sub` |
| `GET /api/cards/:id` | 同上 | 补 `sub` |
| `POST /api/cards` | 请求体缺 `sub`；响应写成 `{ id, ... }` 含糊 | 请求体补 `sub`（可选）+ 明确「不含 id/source/created_at」；响应列全字段 |
| `GET /api/quiz-records` | 响应缺 `card_ids` | 补 `card_ids` |
| `POST /api/quiz-records` | 未说明 `card_ids` 可选、未说明与前端「只存单条最佳」的差异 | 补可选说明 + 登记差异（Day 18 处理） |

## 六、发现的 6 处不一致与修正

| # | 不一致 | 性质 | 修正 |
|---|---|---|---|
| 1 | `cards` 缺 `sub`（子分类）字段 | 契约漏记（表是对的） | 契约第二章补 `sub`，各读接口响应补 `sub`，`POST` 请求体补 `sub` 及 `≤12 字` 约束 |
| 2 | `quiz_records` 缺 `card_ids` 字段 | 契约漏记（表是对的） | 契约补 `card_ids` + 读/写接口响应补 |
| 3 | `id` 口径冲突（契约说整数，前端本机卡是字符串） | 口径未写明 | 契约加「字段口径说明」：入库后一律为数据库整数，本机临时 id 不入库 |
| 4 | `source` 产生方式未说明 | 口径未写明 | 明确「服务端写入，请求体不含」：seed 写 `mock`，POST 写 `user` |
| 5 | `local` 字段契约里没有 | 前端专有字段未登记 | 登记为「前端本机标记，不入库、不属于接口字段」 |
| 6 | 两表关联方式未写 | 契约缺失 | 补「`cards.id` ← `quiz_records.card_ids`，弱关联（数组包含，不建外键）」及不建外键的理由 |

> 另登记一条**行为差异**（不算字段冲突）：前端 localStorage 只存单条最佳战绩，而 `POST /api/quiz-records` 写的是每轮一条历史记录 —— 已写进契约，Day 18 接接口时前端同步改。

## 七、修正后复算

修正后重新逐条比对：**15 个字段全对齐、7 条约束全对齐、5 个接口形状全对齐、不一致 0 处**。

## 八、SQL 文件（留痕）

| 文件 | 内容 | 链接 |
|---|---|---|
| `db/schema.sql` | 建表语句 + 字段注释 + 约束 + 索引（先 DROP 再 CREATE，可重复执行） | https://github.com/XingHo-VibeCoding/knowledge-quest/blob/main/db/schema.sql |
| `db/seed.sql` | 24 张 mock 卡 + 6 条闯关战绩（`TRUNCATE ... RESTART IDENTITY` 后插入，可重复执行） | https://github.com/XingHo-VibeCoding/knowledge-quest/blob/main/db/seed.sql |
| `db/verify.sql` | 两条 select 自检语句 + 字段结构查询 | https://github.com/XingHo-VibeCoding/knowledge-quest/blob/main/db/verify.sql |
