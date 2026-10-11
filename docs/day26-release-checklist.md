# 发布清单 · v1.0

> 项目：knowledge-quest ｜ 发布日：2026-10-11 ｜ 版本标记：`git tag v1.0`
> 配套：回滚手册 `docs/day26-rollback-manual.md` ｜ 演练记录 `docs/day26-drill-log.md`

---

## 一、版本号与发布内容

| 项 | 值 |
|---|---|
| 版本号 | **v1.0** |
| 构建标记（页脚可见） | `v1.0-2026-10-11` |
| 发布提交 | 见 `git log --oneline -1`（tag `v1.0` 指向它） |
| 上一稳定版 | `d7b4224`（Day 25，BUILD=`d25-2026-10-11`）——**回滚目标** |

**v1.0 包含什么**（第 3 周成果 + 第 4 周打磨）：

| 模块 | 内容 |
|---|---|
| 数据层 | CloudBase PostgreSQL：`cards`（9 字段）/ `quiz_records`（6 字段）；走网关 HTTP API（PostgREST）读写 |
| 接口 | `GET/POST /api/cards`、`GET/PATCH/DELETE /api/cards/:id`、`GET/POST /api/quiz-records`、`GET /api/health` |
| 前端 | 卡片墙读真库 / 闯关模式 / 添加卡片 / 修改 / 删除 / 四态视图 / 375px 适配 |
| 错误处理 | 三类错误口径（input / network / server）+ 5xx 统一出口带 `traceId` |
| 安全 | 密钥 0 命中（工作区 + 全部历史）、CORS 白名单回显（非 `*`）、服务端三层护栏 |
| 工具 | 云端数据检查台 `tools/checkup.html`、安全自查 `tools/security-check.sh`、发布前检查 `tools/verify-project.sh` |

---

## 二、发布前必须通过的验证项

**直接引用 `verify-project` Skill 的输出**（13 项自动 + 1 项人工）：

```bash
bash tools/verify-project.sh
```

| 组 | 项 | 通过标准 |
|---|---|---|
| A 本地 | A1~A3 | 工作区/全部历史无密钥、`.env` 从未被提交 |
| A 本地 | A4~A5 | `.env.example` 只留字段名、`.env` 已被忽略 |
| A 本地 | A6 | BUILD 非空 + 格式合法 + 日期不早于前端最后提交日 |
| B 公网 | B1~B2 | 首页是真页面、线上接口地址与本地一致 |
| B 公网 | B3~B5 | health / 读 / 写闭环（零残留） |
| B 公网 | B6 | 5xx 走统一出口（`INTERNAL_ERROR` + `traceId`）——**只在新版才成立** |
| C 数据库 | C1 | 可连接、核心表存在 |
| D 人工 | D1 | 剩余额度与到期时间（控制台看） |

**判据**：`FAIL 0` 才算通过；有任何 FAIL 不许发布。

---

## 三、发布方式

> ⚠️ 本项目静态托管用 `tcb hosting deploy`（CLI 帮助原文：**file upload only, no version management**）
> ——即**平台侧没有版本层**。所以"版本"由 **git tag + BUILD 标记**共同定义，回退靠"重新上传旧版产物"实现。

```bash
# 1) 确认发布前检查全 PASS
bash tools/verify-project.sh

# 2) 上传前端（不改云函数时不必带 FORCE_FN=1）
bash cloudbase/deploy.sh <envId>

# 3) 若后端也改了，才带 FORCE_FN=1 重发云函数（Day 24 起脚本会自证是否真生效）
#    FORCE_FN=1 bash cloudbase/deploy.sh <envId>
```

**另外要同步的第二个域名**：GitHub Pages 走 `git push` 自动发布，**推送后约 2.5 分钟**才变新（CloudBase 静态托管是立刻生效）——两个地址的生效时间不一样，别默认同步。

---

## 四、发布后逐项验证步骤

| # | 验证项 | 命令 | 期望 |
|---|---|---|---|
| 1 | 线上构建标记已更新 | `curl -s <SITE>/js/config.js \| grep BUILD` | `v1.0-2026-10-11` |
| 2 | 页脚显示版本 | 浏览器打开首页看页脚 | `构建 v1.0-2026-10-11` |
| 3 | 发布前检查复跑 | `bash tools/verify-project.sh` | `PASS 13 · FAIL 0` |
| 4 | 核心流程走一遍 | 浏览器：翻面 → 闯关 → 添加卡片 → 刷新仍在 → 修改 → 删除 | 全部正常，无报错 |
| 5 | 后端是同一版 | `curl <API>/cards/99999999999999999999` | `INTERNAL_ERROR` + `traceId` |

> **发布是否成立，以 Skill 输出和亲手走流程为准，不以「我部署了」为准。**

---

## 五、备份方式

| 类型 | 方式 | 怎么取回 |
|---|---|---|
| 代码 | **`git tag v1.0`**（注解 tag，推送到远端） | `git archive v1.0 \| tar -x -C <目录>` 导出该版全部文件；`git show v1.0` 看版本说明 |
| 数据 | `tcb db execute --json --sql "SELECT * FROM cards"` 导出 JSON → `backups/cards_<日期>.json` | 见回滚手册「数据恢复」一节（`INSERT` 回灌） |

> **上一版本是哪一版、怎么取回**：上一稳定版 = `d7b4224`（Day 25）；取回方式 =
> `git archive d7b4224 | tar -x -C <临时目录>` 得到那一版的前端产物，再 `tcb hosting deploy` 上传。
> **这就是本项目的"回退"** —— 因为平台没有版本层，能回退的前提是 **git 里有完整历史**。

---

## 六、Day 26 收尾对照表

| 清单项 | 状态 | 证据 |
|---|---|---|
| ① 确认可回退历史 | ✅ | `git log` 近 12 条提交；上一稳定版 `d7b4224` |
| ② 发布 v1.0 | ✅ | 线上 BUILD=`v1.0-2026-10-11`；`verify-project` 全 PASS |
| ③ 静态托管回退演练 | ✅ | `docs/day26-drill-log.md`（含三个硬数据） |
| ④ 恢复 v1.0 | ✅ | 线上 BUILD 回到 `v1.0-2026-10-11`，页面正常 |
| 今日不做：云函数回退 / 数据恢复实操 | 🛡️ 守住了 | 只写进回滚手册，标注「手册内容，不实操」+ 原因 |
| 完成标准：v1.0 公网可访问且检查全过 | ✅ | 见第四节 |
| 完成标准：回滚演练有耗时记录 | ✅ | 演练记录三个硬数据 |
| 完成标准：恢复后公网正常 | ✅ | 恢复后页面 + Skill 复跑 |
| 余力加练：判断表 | ✅ | 回滚手册第二节 |
| 备份与版本标记存在 | ✅ | `git tag v1.0` + `backups/cards_20261011.json` |
