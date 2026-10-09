# 第 3 周｜周验证日（Day 21）

> 按训练营**附录 A 第三张卡「周验证日模板」**&#x586B;写。第 3 周产出为「云端数据服务 v1」，故数据库 / 云函数 / 公网相关项全部适用。  
> 提交前已隐藏密码、Cookie、Token、数据库连接串与环境变量值。

---

**姓名 / 校区 / 项目名称**：张光如 /昆明 / 知识闯关 knowledge-quest

**本周主题**：云端数据服务 v1（从「前端只读本地文件」到「公网可读写的真库链路」）

---

## 一、本周完成的主要任务

| 天      | 任务            | 交付                                                                                                                        |
| ------ | ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Day 15 | 打通云端链路        | CloudBase 云函数 `api` + HTTP 访问服务 + 静态托管；`GET /api/health` 公网可用                                                             |
| Day 16 | 建表与种子         | `db/schema.sql`（cards / quiz_records）+ `db/seed.sql`（24 张种子卡 + 6 条战绩）+ `db/verify.sql`；契约一致性核对修订 6 处                      |
| Day 17 | 读接口上线         | `GET /api/cards`、`GET /api/cards/:id`、`GET /api/quiz-records` 公网可用；实测确定「网关 HTTP API + API Key」为唯一可行数据通道（pg 直连在免费版 TCP 超时） |
| Day 18 | 写接口 + 写入闭环    | `POST /api/cards`、`POST /api/quiz-records`；页面「＋ 添加卡片」真写进库并读回                                                              |
| Day 19 | 数据访问层重构       | `index.js` 348→176 行；拆出 `services/`（业务）+ `repositories/`（数据）+ `lib/gateway.js`（传输）；删除混杂层 `db.js`                          |
| Day 20 | 前端接真库 + 公网检查台 | 接口地址收敛到 `js/config.js` 唯一定义点；拆掉「接口失败静默退回 mock」；上线数据来源条 + `tools/checkup.html`                                             |
| Day 21 | 第三周验收         | 周验收表（10 项）+ 演示提纲（四段）+ 同伴交叉验证卡；本文为周验证日材料                                                                                   |

---

## 二、本周检测执行结果

**① 验收表**：10 项 —— **PASS 9 / FAIL 0 / 未执行 1**（同伴交叉验证待回执）

**② 关键检测明细**：

| 检测             | 结果                                                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 数据库现场          | cards **29** 行 / 5 个科目；quiz_records **6** 行（`SELECT count(*)` 实测）                                                                                     |
| GET 公网真数据      | `/api/cards?limit=3` → 200，`id=1`「提高效率」与库内逐条一致                                                                                                        |
| POST 真实写入 + 读回 | 新增 id=40 → **201**（`source=user`）→ `GET /cards/40` 读回一致 → 已清理（库回到 29 行）                                                                               |
| 分层重构行为不变       | 云函数目录自 Day 19 起 `git log` **零改动**；31 用例快照四份（重构前 / 重构后 / 今日本地 / 今日公网）状态码分布同为 `{200×11, 204×1, 400×14, 404×3, 501×2}`、**无 5xx**、同算法 MD5 `7dfb490…` 完全一致 |
| 响应形状 vs 契约     | `/cards`、`/cards/:id`、`/quiz-records`、`/health` 顶层 + 条目字段**全对**                                                                                       |
| 错误形状           | 400 `BAD_LIMIT`/`BAD_ID`；404 `CARD_NOT_FOUND`/`ROUTE_NOT_FOUND`；501 `NOT_IMPLEMENTED`                                                                 |
| 公网可达           | Pages 与静态托管的首页、检查台 **4/4 HTTP 200**                                                                                                                   |
| 请求去向           | 页面请求全为 https 公网，`localhost`/`127.0.0.1` **0 条**                                                                                                       |
| CORS 三向        | 白名单内回显 `Access-Control-Allow-Origin`；名单外**无该头**；`OPTIONS` 预检 204                                                                                      |
| 关键路径耗时         | `/api/health` 0.27s、`/api/cards?limit=200` 0.37s、Pages `index.html` 0.58s                                                                             |

**③ 反假检测（抽查 2 项现场重做）**：抽中 ③GET 公网真数据、④POST 写入读回 —— **2/2 现场重做对得上**。

---

## 三、证据链接（页面 / API / 云函数 / 数据库）

- **公网首页**：<https://xingho-vibecoding.github.io/knowledge-quest/> （HTTP 200）
- **公网检查台**：<https://xingho-vibecoding.github.io/knowledge-quest/tools/checkup.html> （HTTP 200）
- **静态托管镜像**：<https://zgr202511108235qr-d2dkj33964b842-1500012353.tcloudbaseapp.com/> （HTTP 200）
- **接口基址**：`https://zgr202511108235qr-d2dkj33964b842.service.tcloudbase.com/api`  
  （`/health`、`/cards`、`/cards/:id`、`/quiz-records` 只读；`POST /cards`、`POST /quiz-records` 写入；`DELETE` 已登记、返回 501 待 Day 22）
- **代码仓库**：<https://github.com/XingHo-VibeCoding/knowledge-quest>
- **数据库脚本**：`db/schema.sql`、`db/seed.sql`、`db/verify.sql`
- **契约**：`api-contract.md`（7 个接口登记 + 字段口径 + 变更记录 6 行）
- **本周截图（28 张，`docs/screenshots/`）**：
  - Day15 `kq_cb_api_health.png` / `kq_cb_console.png` / `kq_cb_console2.png` / `kq_cb_site.png`
  - Day16 `kq_day16_terminal.png` / `kq_day16_report.png` / `kq_day16_contract_check.png` / `kq_day16_checkin.png`
  - Day17 `kq_day17_page_after_db.png` / `kq_day17_page_live.png` / `kq_day17_api_live.png` / `kq_day17_api_public.png` / `kq_day17_api_error.png`
  - Day18 `kq_day18_ui_add.png` / `kq_day18_write.png` / `kq_day18_db.png`
  - Day19 `kq_day19_structure.png` / `kq_day19_regression.png` / `kq_day19_search_1_interface.png` / `kq_day19_search_2_repository.png` / `kq_day19_api_ok.png` / `kq_day19_page_ok.png`
  - Day20 `kq_day20_public_home.png` / `kq_day20_f12_console.png` / `kq_day20_f12_network.png` / `kq_day20_checkup.png` / `kq_day20_checkup_write.png` / `kq_day20_realdb_change.png`
- **本日截图（3 张）**：`kq_day21_acceptance.png`（验收表 + 抽查）、`kq_day21_peer_card.png`（交叉验证卡）、`kq_day21_demo_outline.png`（演示提纲）

---

## 四、完成标准

**部分完成** —— 计划内 10 项中 9 项 PASS、0 项 FAIL、1 项未执行。

未执行项为「同伴交叉验证」（需真人用自己的设备独立完成，AI 不能代造），其余全部有可复核证据。待同伴回执后即可判「已完成」。

---

## 五、同伴交叉验证

- 可打开 ☐（**待同伴回执**）
- 可真实读写 ☐（**待同伴回执**）
- 无报错 ☐（**待同伴回执**）

> 邀请话术与三行结论模板见 `docs/day21-checkin.md` 第四节 / 截图 `kq_day21_peer_card.png`。  
> 回执截图收到后存 `kq_day21_peer_confirm.png`，本栏三项勾选并改判「已完成」。  
> 红线：同伴若报「打不开」＝最高优先级问题，立即排查并把验收表第 ⑩ 项改 FAIL。

---

## 六、遇到的问题 + 报错原文与已尝试动作

**1. 云函数直连数据库走不通（Day 17）**

- 报错：`connect ETIMEDOUT 28.72.71.124:54325`（数据库内网地址 TCP 超时）
- 已尝试：按官方文档走 pg 模块 + `PGHOST/PGUSER/PGPASSWORD`；探针函数实测确认平台**不注入** `PG*` 环境变量、免费体验版无「内网互联 / 公网直连」
- 处置：改用官方服务端通道**网关 HTTP API（PostgREST）+ 环境 API Key**；结论已写入 `api-contract.md`「服务端如何访问数据库」小节

**2. 浏览器地址栏直接打开接口会「下载」而不是显示（Day 17）**

- 现象：网关对所有响应硬加 `content-disposition: attachment`，函数侧设置被覆盖
- 处置：公网可读入口改由 Pages 上的 `tools/api-live.html` 承担（Pages 不加该头）；已在契约登记说明

**3. 工作区目录整体消失（Day 19，已恢复）**

- 现象：执行 `git rm` 单个文件后，`cloudbase/` **整个目录**从工作区消失（git 记录 7 个文件被删，仅 1 个是主动删除）
- 处置：`git reset -q HEAD <目录>` + `git checkout -- <目录>` 恢复 7 个已追踪文件；6 个未追踪新文件重写；**写完立刻 `git add`**
- 固化：已写入长期记忆与项目 Skill（预防：任何删除/移动后立刻 `find <目录> -type f` 验证）

**4. 验收时的「虚惊」（Day 21，非缺陷）**

- 现象：`q=口语`、`q=周验收自检` 关键词搜索均返回 `count=0`，疑似中文搜索失效
- 排查：`q=英语`(3) / `q=提高效率`(1) / `q=验收`(1) 均正常；`口语` 是**科目名**、`周验收自检` 只出现在 `subject`
- 结论：契约写明 `q` 只搜 **front/back**，返回 0 是**符合契约的正确行为**；不修，记录方法收获（「测出来的异常，先回头读契约再下判断」）

**5. GitHub Pages 构建延迟（Day 21）**

- 现象：推送后 Pages 未立即更新，CloudBase 静态托管上传后**立刻**生效，Pages 慢约 2.4 分钟
- 处置：轮询比对版本标记（新版 `answerInput` 出现 / 老版 `showAnswerBtn` 归零）后再判成败，避免误判推送失败

**6. 新增的已知待办（登记到下周）**

- `DELETE /api/cards/:id` 未实现（返回 501），计划 **Day 22** 完成
- 库内 3 条「检查台自检」测试卡（id 37/38/39）会进闯关抽签池，待确认后清理
- 导航 / 筛选块部分点击目标 31–34px，未达 44px（沿用第 2 周遗留记录）

---

## 七、额度 / 到期 / 备份（附录要求项）

- **环境**：CloudBase 免费体验版，环境 ID `zgr202511108235qr-d2dkj33964b842`（已在文档中脱敏处理，不写 Key）
- **额度**：体验版按官方额度执行（函数调用 / 数据库存储 / 静态托管流量），本周用量远低于上限
- **到期与计费**：控制台可查；体验版到期后数据库与静态托管会停止服务，需升级或迁移
- **数据导出**：`tcb db execute --sql "SELECT ..."` 可导出；另建议定期用 `pg_dump` 或控制台导出做离线备份（本周未做，登记为待办）
- **备份现状**：schema/seed 脚本已入库版本管理（`db/`），**结构可随时重建**；数据本身无自动备份

---

## 八、本周能力底线对应（自评）

| 能力底线               | 本项目对应                                                             | 状态          |
| ------------------ | ----------------------------------------------------------------- | ----------- |
| 至少 3 个页面 / 视图      | `#/wall` 卡片墙、`#/quiz` 闯关、`#/card/:id` 详情、`tools/checkup.html` 检查台 | ✅           |
| 至少 1 个有反馈的交互       | 添加卡片（处理中禁用 → 201 成功 / 409 防重复）、闯关作答与判定                            | ✅           |
| 至少 1 类数据真实写入并读取    | `POST /api/cards` 写入 → `GET /api/cards/:id` 读回 → 刷新持久             | ✅           |
| 前端 + 云函数 + 数据库完整链路 | 前端 fetch → 云函数 `api` → 网关 HTTP API → PostgreSQL                   | ✅           |
| 一次公网发布             | Pages + CloudBase 静态托管双地址                                         | ✅           |
| 刷新后数据仍存在           | 卡片写入后刷新仍在（真库，非 localStorage）                                      | ✅           |
| 额度、到期、备份已记录        | 见第七节                                                              | ⚠️ 部分（备份待补） |
| 能解释提示词和验证方式        | 见 `docs/day21-checkin.md` 第五节演示提纲                                 | ✅           |
