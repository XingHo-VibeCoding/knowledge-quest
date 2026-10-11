# Day 23 云函数部署为什么没生效 —— 根因定位与修复

> 2026-10-11 补记。Day 24 只写清了「现象」和「判据」，这次把「为什么」钉死了，并修掉了脚本。
> 关联：`AGENTS.md` 第 23 条、`TECH_DESIGN.md` 14.5 / 14.5.1。

## 一句话结论

**`tcb fn deploy ... --path /api` 在 `/api` 路由已存在时会中止整次部署（exit 3）**，
而「函数配置」在中止前已被更新 —— 于是 `tcb fn detail` 的时间戳变了、看起来部署过，
**但函数代码根本没上传**。老版 `deploy.sh` 又把这个失败当"正常"容忍掉，最终以 0 退出。

## 现象（Day 23 → Day 24 的观测）

- Day 23：`FORCE_FN=1 bash cloudbase/deploy.sh` → 输出 `rc=3`，`tcb fn detail` 的
  Modification time = `2026-10-09 22:00:04`（就是那次）。
  当时打了 `GET /api/cards/99999999999999999999` → `INTERNAL_ERROR + traceId` → 判定"线上是新版"。
- Day 24：排查并发删除的 500 时发现错误码是 `DB_ERROR` 且**不带 traceId**（Day 23 已统一为
  `INTERNAL_ERROR + traceId`）→ 线上是「新配置 + 旧代码」的**混合态**。

## 探测（两条对照实验，2026-10-11 实测）

| 实验 | 命令 | 结果 | 说明 |
|---|---|---|---|
| A｜复刻 Day 23 | `fn deploy api --httpFn --path /api --runtime Nodejs16.13 --force` | `EXIT=3`；报 `× [CreateCloudBaseGWAPI] Path '/api' is used, please try again in another path.`；**`--metadata-file` 指定的文件没生成** | 流程**中途夭折** |
| B｜去掉 `--path` | `fn deploy api --httpFn --force` | `EXIT=0`；`✔ [api] Cloud function deployed successfully!` | 代码**真的上传了** |

实验 A 的原始输出关键几行：

```
i ✓ Function exists, will update with the following merged config:
i   Type: HTTP / Runtime: Nodejs16.13 / Handler: index.main
- Cloud function deploying...
[api] 部署方式: COS 上传
× [CreateCloudBaseGWAPI] Path '/api' is used, please try again in another path.
```

> **`--metadata-file` 没生成**是最关键的一条：CLI 只在部署**走完**时才写元数据。
> 它不生成 ⇒ 这次部署没有完成 ⇒ 代码没上传。

## 根因链

1. `--path /api` 的语义是「**创建** HTTP 访问服务路由」，而 `/api` 路由在 Day 15 就建好了
   （`tcb routes list` 显示它 Update Time 一直是 `2026-10-04T00:58:32`，从没变过）。
2. CLI 在 `[CreateCloudBaseGWAPI]` 撞到重复路由 → **中止整次部署**。
3. 中止点**在「配置已更新、代码未上传」之间**：`fn detail` 的 Modification time 被 touch，
   制造了"刚部署过"的假象。
4. `deploy.sh` 老版本把 `rc≠0` 注释成「`/api` 路由已存在时属正常」并**继续执行**，
   末尾只 `curl /api/health`（旧版也活着）—— 脚本以 0 退出。

## 修复（`cloudbase/deploy.sh`）

| 改动 | 改前 | 改后 |
|---|---|---|
| 重发参数 | `--path /api --runtime Nodejs16.13` | 两者都去掉（路由不需要重建；`--runtime` 只在首次部署生效） |
| 失败处理 | `rc≠0` → 打警告、继续跑 | `rc≠0` → **`exit 1`**，且校验元数据文件是否生成 |
| 生效判据 | 无（只 curl health） | 新增 **5/5 步**：`/api/health` 活着 + 超大 id 走 `INTERNAL_ERROR + traceId` |

## 验证（2026-10-11 实跑）

```
== 2/5 部署云函数 api（HTTP 触发）==
✔ [api] Cloud function deployed successfully!
云函数已重发（rc=0，元数据：D:/knowledge-quest/.cloudbase-fn-meta.json）
...
== 5/5 部署生效自证（行为判据，不看时间戳）==
  [health]     OK   后端活着
  [新版行为]   OK   5xx 走统一出口（INTERNAL_ERROR + traceId）→ 线上代码确实是新版

部署生效自证：全部通过
```

脚本退出码 `0`。同样一条 `FORCE_FN=1 bash cloudbase/deploy.sh <envId>`，
改造前是"假成功"、改造后是"真成功 + 自证"。

## 教训（已写进 AGENTS 第 23 条）

1. **重发函数只更新代码，绝不再带 `--path`。**
2. **「容忍失败」的部署脚本 = 会撒谎的部署脚本**：脚本说成功、日志说警告、线上说旧版。
3. **判定生效只认「只在新版才成立的行为」**，时间戳是会被配置更新 touch 到的假证据。
4. **验收抽样没覆盖到的分支等于没验**（Day 23 只验了 `GET` 那一层）。
