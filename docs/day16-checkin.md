# Day 16 打卡 · 数据模型先行：建表和种子数据

> 2026-10-04 ｜ 项目：knowledge-quest（知识闯关）｜ 环境：`zgr202511108235qr-d2dkj33964b842`
> 目标库：CloudBase **PostgreSQL 17.11**（体验版 · ap-shanghai）

## 一、今天做了什么

今天不写接口、不改前端，只干一件事：**把地基打好**。

1. **定数据模型**：以 `api-contract.md` 第二章为唯一依据，与前端真实数据（`data/quest-cards.json` 24 张卡）逐字段核对后定稿两张表
2. **写建表脚本** `db/schema.sql`：两张表 + 字段注释 + 约束 + 索引，先 DROP 再 CREATE，可重复执行
3. **写种子脚本** `db/seed.sql`：24 张 mock 卡 + 6 条闯关战绩，`TRUNCATE ... RESTART IDENTITY` 后插入，**连跑两遍不报错、数据不翻倍、id 也不变**
4. **真库执行**：用 `tcb db execute` 在云上跑通，两条 select 各取 ≥5 行验证
5. **契约一致性检测**：15 个字段 + 7 条约束 + 5 个接口形状逐条比对契约，**发现 6 处不一致并全部修正**

## 二、两张表

| 表 | 角色 | 字段数 | 存什么 |
|---|---|---|---|
| `cards` | 主对象 | 9 | 知识卡片：`id / subject / sub / type / level / front / back / source / created_at` |
| `quiz_records` | 记录 | 6 | 每次闯关的成绩：`id / score / total / card_ids / date / created_at` |

**关联**：`cards.id` ← `quiz_records.card_ids`（弱关联，数组包含，不建外键）

### 约束（真库已生效，7 条）

- `cards.level` BETWEEN 1 AND 3
- `cards.source` ∈ ('mock','user')
- 两表主键
- `quiz_records.score >= 0`、`total` BETWEEN 1 AND 100、`score <= total`

### 索引（3 个）

- `cards` 主键、`quiz_records` 主键
- `idx_cards_subject_sub (subject, sub)` —— 服务 Day 17 的卡片墙筛选
- `idx_quiz_records_date (date DESC, id DESC)` —— 服务战绩列表倒序

## 三、完成标准逐条自检

| 完成标准（教材） | 状态 | 证据 |
|---|---|---|
| 每张核心表 select 至少 5 行 | ✅ | `cards` 24 行（截图取前 10 行）、`quiz_records` 6 行 |
| `seed.sql` 重复执行不报错 | ✅ | 连跑两遍均成功，行数稳定 24 / 6，重跑后 id 仍为 1–6 |
| `db/schema.sql` 和 `db/seed.sql` 已入库 | ✅ | 见文末链接（仓库 `db/` 目录） |

## 四、自检 4 条

| # | 自检项 | 结果 |
|---|---|---|
| 1 | 两条 select 结果 | ✅ `cards` 10 行 / `quiz_records` 6 行，见截图 |
| 2 | 第二遍执行成功 | ✅ 重跑输出与第一遍一致（行数不变），且 id 未漂移 |
| 3 | **契约一致性检测**：逐字段核对表结构与契约 | ✅ 核对 15 字段 + 7 约束 + 5 接口形状 → **挑出 6 处不一致，全部修正，复算 0 处**。详见 `docs/day16-contract-check.md` |
| 4 | **仓库留痕检测**：能打开两个 SQL 文件看到完整 SQL | ✅ `db/schema.sql`、`db/seed.sql`（另有 `db/verify.sql`） |

### 挑出的 6 处不一致（自检 3 的产出）

| # | 不一致 | 处置 |
|---|---|---|
| 1 | 契约漏记 `cards.sub`（子分类）—— 但前端 24/24 张卡都有它 | 契约补 `sub`，各接口响应与 POST 请求体同步补 |
| 2 | 契约漏记 `quiz_records.card_ids` | 契约补该字段 + 说明关联方式 |
| 3 | `id` 口径冲突（契约说整数，前端本机卡是字符串 `u<时间戳>`） | 契约加口径说明：入库后一律为数据库整数 |
| 4 | `source` 怎么写进去的没说明 | 明确：服务端写入，请求体不含；seed 写 `mock`、POST 写 `user` |
| 5 | 前端 `local` 标记未登记 | 登记为「本机字段，不入库」 |
| 6 | 两表关联方式没写 | 补「弱关联」说明 + 不建外键的理由 |

## 五、今日不做 / 卡住降级

- 🛡️ **没写任何接口**（GET/POST 是 Day 17–18 的事）——证据：今天只动 `db/` 目录，`cloudbase/functions/api` 一行未改
- 🛡️ **没改前端**——证据：`index.html` / `js/` / `css/` 今天零提交
- ➖ 卡住降级**未触发**：两张表都跑通了，没有出现「只保一张表」的情况

## 六、余力加练：字段注释 + 类型为什么这么选

已在 `db/schema.sql` 里给**每个字段**写了 `COMMENT ON COLUMN`（真库可查）。类型选择的理由：

| 字段 | 选型 | 为什么 |
|---|---|---|
| `subject` / `sub` | `text` 而非 `enum` | 分类是**用户可自定义**的（两级分类可增删），用 enum 每加一个科目就要改表结构 |
| `level` | `integer` + CHECK 1–3 | 整数能排序、能范围筛选（`level >= 2`），比存文本"入门/进阶"更好查 |
| `front` / `back` | `text` 而非 `varchar(n)` | PG 里 `text` 与 `varchar(n)` 性能无差别，但不设长度上限，长句不会插入失败；长度约束放在接口层校验 |
| `source` | `text` + CHECK 约束两值 | 只有两个固定取值时 CHECK 足够；将来要加 `import` 等来源，改约束比改 enum 类型方便 |
| `created_at` / 战绩时间 | `timestamptz` 而非 `timestamp` | 项目在 +08:00，`timestamp` 不带时区容易在跨时区/夏令时场景出错，带时区一次说清 |
| `date` | `date` 而非 `timestamptz` | 战绩按"哪一天闯的关"统计，用日期类型天然避免"UTC 切日"把凌晨的成绩算到前一天 |
| `card_ids` | `integer[]` 而非关联表 | 本轮只有 5 张卡、且是历史快照，数组够用且查询简单（`card_ids @> ARRAY[3]`）；等要做"逐题对错明细"时再拆明细表 |
| `id` | `serial` | 单机自用、单写入者，自增整数最短最省；不需要 UUID 的分布式唯一性 |

## 七、每日一问：

> **你的两张表分别存什么？它们靠哪个字段关联？**

`cards` 存**知识卡片**：科目、子分类、题面、答案，一张卡一行，是我长期维护的主对象（现在 24 张种子卡）。

`quiz_records` 存**每轮闯关的成绩**：对几题、共几题、抽了哪些卡、哪天做的，只增不改。

两张表靠 `cards.id` ← `quiz_records.card_ids` 关联：闯关结束就把抽中的卡 id 存成数组写进 `card_ids`，所以能反查「某张卡被考过几次」。

不做外键是刻意的——战绩是历史快照，删改卡片不该影响过去的成绩。

## 八、截图与文件索引

| 材料 | 文件 |
|---|---|
| 截图一（主图）· 数据库自检报告：建表 / 两遍种子 / 两条 select 结果 | `docs/screenshots/kq_day16_report.png` |
| 截图二 · 真库执行实录（`tcb db execute` 原始输出，框线对齐） | `docs/screenshots/kq_day16_terminal.png` |
| 截图三 · 本篇打卡全文渲染图（深色阅读主题，含每日一问） | `docs/screenshots/kq_day16_checkin.png` |
| 截图四 · 契约一致性核对报告全文渲染图（深色阅读主题） | `docs/screenshots/kq_day16_contract_check.png` |
| 建表脚本 | [db/schema.sql](https://github.com/XingHo-VibeCoding/knowledge-quest/blob/main/db/schema.sql) |
| 种子脚本 | [db/seed.sql](https://github.com/XingHo-VibeCoding/knowledge-quest/blob/main/db/seed.sql) |
| 自检 SQL | [db/verify.sql](https://github.com/XingHo-VibeCoding/knowledge-quest/blob/main/db/verify.sql) |
| 契约一致性核对报告 | [docs/day16-contract-check.md](https://github.com/XingHo-VibeCoding/knowledge-quest/blob/main/docs/day16-contract-check.md) |

## 九、commit

- **标题**：Day 16｜数据模型先行：建表和种子数据
- **改了什么**：`api-contract.md`（契约一致性核对后修订 6 处：补 `sub`、补 `card_ids`、加字段口径说明、补各接口字段清单、登记前端与接口的行为差异）
- **加了什么**：`db/schema.sql`（建表 + 注释 + 约束 + 索引）、`db/seed.sql`（24 卡 + 6 条战绩，可重复执行）、`db/verify.sql`、`docs/day16-contract-check.md`、`docs/day16-checkin.md`
