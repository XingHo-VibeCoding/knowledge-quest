---
name: verify-project
description: 知识闯关发布前检查 —— 每次改完代码、每次发布前，跑一遍覆盖公网访问、接口读写、密钥红线、仓库卫生、数据库连接、部署生效判据、托管站白名单的 14 项检查，逐项给 PASS/FAIL/未执行 + 证据。当用户说「发布前检查」「上线前过一遍」「跑一下 verify-project」「检查能不能发布」「发布前帮我看一眼」时使用。
agent_created: true
---

# 知识闯关 · 发布前检查（verify-project）

一句话：**把前两周攒下的检查经验变成一条命令** —— 人会忘（密钥有没有漏、接口通不通、部署有没有真生效），脚本不会。

## 文件位置与调用方式

| 项 | 值 |
|---|---|
| Skill 文件 | 项目内 `.workbuddy/skills/verify-project/SKILL.md`（本文件） |
| 检查脚本 | `tools/verify-project.sh`（唯一入口，逐项三态输出） |
| 复用判据 | `tools/security-check.sh`（密钥 / 仓库卫生；特征词只在那边定义一次，本 Skill 不抄第二遍） |
| 检查项来源表 | `docs/day25-checkin.md`（每项对应本项目哪一次真实踩坑） |
| 调用方式 | 对话里输入 `/verify-project`；或说「发布前检查一下」；也可直接 `bash tools/verify-project.sh` |
| 只跑本地 | `bash tools/verify-project.sh --offline`（不碰网络，秒级） |

### 怎么算跑成功（3 个可观察标准）

1. **退出码 0，且末行是 `结果：PASS 14 · FAIL 0`**（SKIP 只允许出现在 D1 人工项）。
2. **每项都带证据**：状态码 / 字节数 / 行数 / 提交号 / 接口原文片段 —— 没有「看起来正常」这类词。
3. **故意弄坏时必须 FAIL**：Day 25 实测往 `README.md` 注入一个假密钥 → A1 立刻 FAIL、退出码 1；移除后复跑回全绿。

---

## 检查项

### A 组｜本地工作区（不碰网络）

| # | 检查项 | 执行命令 | 怎么算通过 | 来源（本项目真实踩过的坑） |
|---|---|---|---|---|
| A1 | 工作区无硬编码密钥 | `bash tools/security-check.sh --offline` | 该行报 `[PASS]`，0 命中 | Day 23 密钥排查 |
| A2 | 全部提交历史无密钥 | 同上 | 该行报 `[PASS]`，0 命中 | Day 23（历史不可改写 → 3 份定义处明示排除） |
| A3 | `.env` 从未被提交 | 同上 | 该行报 `[PASS]`，0 条记录 | Day 23 |
| A4 | `.env.example` 只留字段名 | `grep -E "^CLOUDBASE_[A-Z_]*=" .env.example` | 带值的字段数 = 0 | 附录 L |
| A5 | `.env` 已被忽略 | `git check-ignore -v .env` | 有输出（打印命中的 .gitignore 行） | 附录 L |
| A6 | **BUILD 标记不过期** | 由本脚本内联计算 | 非空 + 形如 `vX.Y-YYYY-MM-DD`（正式发布）或 `dNN-YYYY-MM-DD`（日常），且日期 ≥ `js/ index.html tools/` 最后一次提交日期 | **Day 24 真实遗留**：前端改到 10-10，BUILD 还写 `d23-2026-10-09` |

### B 组｜公网（静态站 + 接口）

| # | 检查项 | 执行命令 | 怎么算通过 | 来源 |
|---|---|---|---|---|
| B1 | 首页可访问且是真页面 | `curl -s <SITE>/`（SITE 见下） | HTTP 200 + 含 `<title>` + 内容 > 5000 字节 | Day 20 上线 |
| B2 | 线上前端指向本地声明的接口 | `curl <SITE>/js/config.js \| grep API_BASE` | 与本地 `js/config.js` 的 `API_BASE` 完全一致 | Day 20（防「本地改了没部署」） |
| B3 | 健康接口 | `curl <API>/health` | 响应含 `"ok":true` | Day 15 |
| B4 | 读接口 | `curl <API>/cards?limit=5` | `"ok":true` 且 `count >= 1` | Day 17 |
| B5 | **写接口闭环 + 零残留** | POST 造一行 → GET 读回 → DELETE → 再 GET | 四步依次 201 / 200 / 200 / 404 | Day 18 + Day 22 |
| B6 | **部署是否真的生效** | `curl <API>/cards/99999999999999999999` | 返回 `INTERNAL_ERROR` **且带** `traceId` —— 这是**只在新版才成立**的行为 | **Day 24 事故**：`tcb fn detail` 的时间戳会被配置更新 touch，拿它当证据会误判 |
| B7 | **托管站只能有站点内容** | `tcb hosting list -e <ENV> --json` 的 key 集合 | 全部落在白名单正则 `^(index\.html\|css/\|js/\|data/\|tools/[^/]+\.html$\|__auth/\|cloud-admin/)` 内 | **Day 27 事故**：回滚时 `git archive` 整仓上传，源码/文档/schema 102 个文件公网可下载 |

### C 组｜数据库

| # | 检查项 | 执行命令 | 怎么算通过 | 来源 |
|---|---|---|---|---|
| C1 | 可连接 + 核心表存在 | `tcb db execute -e <ENV> --json --sql "SELECT (SELECT count(*) FROM cards) AS cards, (SELECT count(*) FROM quiz_records) AS quiz"` | 返回里有 `"Rows"`，且两个计数都解析成功 | Day 16 |

### D 组｜人工项（脚本查不了，必须人看）

| # | 检查项 | 怎么算通过 | 来源 |
|---|---|---|---|
| D1 | 剩余额度与到期时间 | 进 CloudBase 控制台看；把日期记到本文件下方「额度记录」 | 附录 H |

**地址来源（脚本里不写死，全部从 `js/config.js` 解析）**

| 变量 | 值 |
|---|---|
| `API` | `https://zgr202511108235qr-d2dkj33964b842.service.tcloudbase.com/api` |
| `SITE` | `https://xingho-vibecoding.github.io/knowledge-quest`（GitHub Pages；CloudBase 静态托管域名带 `content-disposition: attachment`，浏览器打开会下载文件） |
| `ENV_ID` | `zgr202511108235qr-d2dkj33964b842`（从 `API` 域名反解，不另外写死） |

---

## 输出格式

- 逐项 `[PASS]` / `[FAIL]` / `[SKIP]`，`FAIL` 必须跟一行 `↳` 给出「怎么复核」。
- 末尾固定三行：分隔线 + `结果：PASS n · FAIL n · SKIP n` + `结论：…`。
- **不允许**出现「看起来正常」「基本没问题」「应该可以」这类模糊表述。

## 失败规则

- 命令不存在、请求失败、证据缺失 → 一律 **FAIL**（或明示 `[SKIP]` 并写清原因），**不许默认通过**。
- 有 FAIL 时脚本退出码 = `1`；红线项（A 组密钥 / B 组线上不通）优先处理。
- **⚠️ 报 FAIL 不一定是有病，也可能是判据有病**（Day 23 教训）：先复核判据本身，再动代码。

## 已知判例（避免重复踩）

| 判例 | 现象 | 结论 |
|---|---|---|
| 漏 `--json`（Day 25 第一次跑） | C1 误报 FAIL，数据库其实是通的 | `tcb db execute` 不带 `--json` 只打印**人看的表格**（`┌──┬──┐`），grep 不到任何结构化字段；结构化判据必须带 `--json` |
| 拿时间戳当部署证据（Day 24） | 报「部署成功」，线上却是旧代码 | `fn detail` 的 Modification time 会被配置更新 touch；只认「只在新版才成立的行为」 |
| 网关强制 `content-disposition: attachment` | `curl -w '%{size_download}'` 显示 `0`，看着像空响应 | 判首页要用 `wc -c` 数内容字节，别信 `size_download` |
| 只覆盖不删除（Day 27） | 站点根目录出现 `AGENTS.md` / `cloudbase/deploy.sh` / `db/schema.sql`，`curl` 全部 200 | `tcb hosting deploy` **只覆盖不删除** → 传错一次就永久留在公网。必须主动清理 + 用 B7 白名单判据兜住 |

## 边界（今天不做什么）

- 本 Skill 只管「**能不能发布**」（部署后、发布前）。
- 改 UI 的规则自检 → `kq-frontend-audit`（改前改后各跑一次，判据是数值不是肉眼）。
- **不做**自动化流水线（CI/CD、定时跑、失败自动回滚）——留到以后。

## 额度记录（D1 人工项，每次发布前更新）

| 日期 | 剩余额度 | 到期时间 | 记录人 |
|---|---|---|---|
| 2026-10-11 | 体验版（未计量） | 2027-04-03 | AI（据 Day 16 建环境记录） |
| 2026-10-11 | 本计费周期 `6.21 / 3000` 资源点（云函数 4.88 / API 调用 1.18 / HTTP 网关 0.14 / 存储 0.01）；计费周期 2026-10-03 ~ 2026-11-03；到期 **2027-04-03 23:59:59** | → | AI（Day 27 用 `tcb env usage` + `tcb env list` 实测，非控制台截图） |
