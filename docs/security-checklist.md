# 安全自查清单（Day 23 产出）

> **这份清单的用途**：每次改完代码、每次发布之前，照着跑一遍。也可以整份交给同伴——
> **每项都写了「怎么算通过」，只照清单执行就能得出和我一样的结论**。
> 判定只用三态：**PASS / FAIL / 未执行**；不允许「看起来正常」这类说法。
>
> 时间：2026-10-09 · 项目：knowledge-quest（CloudBase 云函数 + PostgreSQL + 静态托管）
> 一键跑：`bash tools/security-check.sh`（把下面 A~D 组的命令串起来，逐项打印 PASS/FAIL）

---

## A 组｜密钥与凭据（红线，先做这一组）

| # | 检查项 | 执行命令 | 怎么算通过 |
|---|---|---|---|
| A1 | 工作区代码里没有密钥 | `git grep -I -i -n -E "$(bash tools/security-check.sh --print-pattern)" -- .` | **输出 0 行** |
| A2 | **全部提交历史**里没有密钥 | `git grep -I -i -n -E "$(bash tools/security-check.sh --print-pattern)" $(git rev-list --all) -- . ':(exclude)docs/security-checklist.md' ':(exclude)docs/day23-checkin.md' ':(exclude)tools/security-check.sh'` | **输出 0 行**（排除的 3 份是特征词**定义处**，历史不可改写、排除名单明示；除它们外任何文件命中即红线，按「作废密钥 → 重新生成 → 换环境变量」处理，不是改代码了事） |
| A3 | `.env` 从未被提交过 | `git log --all --oneline -- .env` | **无输出** |
| A4 | 历史里没有敏感文件名 | `git log --all --pretty=format: --name-only --diff-filter=A \| sort -u \| grep -iE "\.env$\|\.env\.[a-z]+$\|secret\|cred\|\.pem$\|\.key$" \| grep -viE "^\.env\.example$\|^docs/screenshots/"` | **无输出**（例外两项：`.env.example` 是模板、本就该入库；`docs/screenshots/` 是自查证据图，文件名带 secret 属正常） |
| A5 | `.env` 已被忽略 | `git check-ignore -v .env` | **有输出**且形如 `.gitignore:N:.env`（无输出 = 没被忽略，必须修 .gitignore） |
| A6 | `.env.example` 存在且**不含真实值** | `grep -E "^[A-Z_]+=" .env.example` | 每个变量等号后为**空**（`PORT`/`KQ_QUIET` 这类可选项允许有非敏感默认值） |
| A7 | `.env.example` 能正常入库 | `git check-ignore .env.example; echo $?` | 退出码 **1**（= 不被忽略；若为 0 说明被误忽略，示例文件上传不上去） |
| A8 | 代码里没有「配置缺失就顶上字面量」的兜底 | `grep -rnE "process\.env\.[A-Z_]+ *\|\| *['\"][^'\"]+['\"]" cloudbase/functions/` | **0 命中**（缺哪个环境变量就报错，不静默用写死的值顶上；CORS 白名单里的公开域名属必须写死的业务数据，不算） |
| A9 | 前端不含任何密钥 | `grep -rn "CLOUDBASE_API_KEY\|Authorization: Bearer" js/ tools/ index.html` | **0 命中**（页面能拿到 Key 就等于把数据库交出去了） |

> **A1/A2 的特征词从哪来？** 不在这份文档里抄一遍——文档里写了字面量，扫描就会命中文档自己（我第一次跑就栽在这里：
> 清单、打卡文档、脚本三处各命中 1 行，全是「特征词的定义」本身）。所以特征词只定义在 `tools/security-check.sh` 的 `PAT`
> 变量里，且用**分段拼接**写法（`'post''gres'`、`'-----''BEGIN'`），让脚本自己也不含可匹配的完整字面量。
> 文档要引用就执行 `bash tools/security-check.sh --print-pattern` 现取。**这条对任何审计脚本都成立：先证明审计工具自己干净，再用它去审别人。**

## B 组｜三类错误提示

| # | 检查项 | 怎么触发 | 怎么算通过 |
|---|---|---|---|
| B1 | 用户输入错 → 中文、告诉他改什么 | `curl -s <API>/cards/abc` | HTTP **400** + `message` 是中文（如「id 必须是正整数」），不是英文/堆栈 |
| B2 | 网络错 → 人话 | 页面加载后断网（F12 → Network → Offline）再点重试 | 页面显示「网络已断开：设备当前处于离线状态，请恢复网络后重试。」**不出现 `Failed to fetch`** |
| B3 | 服务端错 → 通用提示 + 追踪号 | 把表名临时写错后请求（见附录 D 的做法，别在线上改） | HTTP **500** + `code:"INTERNAL_ERROR"` + `message` 是人话 + **带 `traceId`** |
| B4 | 5xx **不泄漏内部细节** | 看 B3 的 `message` | 文案里**不含**表名、SQL 片段、英文异常名、堆栈 |
| B5 | 追踪号能在日志里对上 | 云函数日志里搜 B3 返回的那个 `traceId` | 能搜到同号的 `[KQ][ERROR] trace=<同一个号> …`，且**含真实原因**（表名/错误码/stack） |
| B6 | 排查线索没被「翻译」抹掉 | 页面出错时看 F12 Console | 仍有原始错误（`Failed to fetch` / `HTTP 500 …`）可查——给人话 ≠ 给开发者也只留人话 |

## C 组｜非法输入边界

| # | 检查项 | 命令 | 怎么算通过 |
|---|---|---|---|
| C1 | id 非正整数 | `curl <API>/cards/0` | 400 `BAD_ID` |
| C2 | 空请求体 | `curl -X PATCH -d '{}' <API>/cards/1` | 400 `EMPTY_PATCH` |
| C3 | 夹带不可改字段 | `curl -X PATCH -d '{"id":9}' <API>/cards/1` | 400 `IMMUTABLE_FIELD`（**不静默忽略**） |
| C4 | 超长字段 | `curl -X POST -d '{"front":"<201 字>"…}' <API>/cards` | 400 `VALIDATION_ERROR` |
| C5 | 不存在的路由 | `curl <API>/nope` | 404 `ROUTE_NOT_FOUND`（**不是 500**） |
| C6 | 删除内置卡 | `curl -X DELETE <API>/cards/5` | 403 `NOT_DELETABLE`（护栏在服务端，绕过页面也拦得住） |

## D 组｜仓库与部署卫生

| # | 检查项 | 命令 | 怎么算通过 |
|---|---|---|---|
| D1 | 仓库里没有本地私密文件 | `git ls-files \| grep -iE "(^\|/)\.env$\|local\.json\|(^\|/)cred"` | **0 行**（判据只抓 `.env` 本身 / `cloudbaserc.local.json` / `cred*`；`.env.example` 是模板，应该在库里） |
| D2 | `.gitignore` 覆盖到位 | `cat .gitignore` | 至少含 `.env`、`*.log`、部署临时目录、`cloudbaserc.local.json` |
| D3 | 前端没有本地地址残留 | `grep -rn "localhost:8790\|127.0.0.1:8790" js/ index.html tools/` | **0 命中**（接口地址只在 `js/config.js` 一处定义） |
| D4 | 跨域没用通配符 | `grep -rn "Access-Control-Allow-Origin" cloudbase/functions/api/index.js` | **不含 `*`**；只有白名单回显 |
| D5 | 线上跑的是新版 | 回读线上 `js/config.js` 的 `BUILD`；再对公网打一个只在新版成立的行为 | BUILD 是当天标记；新行为符合预期（例：Day 23 用 `GET /cards/99999999999999999999` → `INTERNAL_ERROR`） |

---

## 附｜C 组「服务端错」怎么安全地测（不碰线上数据）

1. 复制一份函数代码到工作区，把 `repositories/cardsRepository.js` 里的表名 `cards` 改成 `cards_broken`；
2. 用本地壳起在 `127.0.0.1:8791`（注意：仓库自带的 `cloudbase/local-http.js` 有 Bug——它没 `await` 异步的 `main()`，见「Day 24 待修」）；
3. 页面副本把 `API_BASE` 指到本地那个端口，打开就复现服务端错；
4. **测完什么都不用改回来**——线上代码没动过。这正是「用副本造故障」比「在生产上改一行」安全的地方。

## 判定与留痕

- 全组 PASS 才允许发布；任何一条 FAIL：**先修，再重跑本组**。
- 每次跑完把输出贴到当天打卡文档里（含命令与真实输出），日期 + 结论。
- 这份清单本身要能被同伴执行：**同伴看不懂哪一项，就是那一项写得不合格，回炉重写**。
