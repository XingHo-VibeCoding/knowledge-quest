# Day 15 自检留档（今天怎么检测 · 4 项）

> 日期：2026-10-03 ｜ 状态：2 项全过，2 项等 CloudBase 注册后 5 分钟内补完

## 检测 1：部署链路（等注册后补）

- 目标：浏览器打开 `<云函数公网地址>/api/health` 看到 `{"ok":true,...}`。
- **本地已预演通过**（把云函数跑在真实 HTTP 层上，用 curl 打，见 `cloudbase/local-http.js`）：
  - `GET /api/health` → `HTTP/1.1 200` + `{"ok":true,"service":"knowledge-quest","time":"2026-10-03T03:31:26.525Z"}`
  - `GET /api/cards`（契约已登记未实现）→ `HTTP/1.1 501` + 契约错误形状
  - `GET /api/unknown`（谁都没登记）→ `HTTP/1.1 404`
- 结论：函数逻辑 + HTTP 契约这一段已被真实 HTTP 请求验证；剩下的只是把同一段代码放上 CloudBase（一条 `cloudbase/deploy.sh` 命令）。**注册 + 授权后即可补此截图。**

## 检测 2：契约完整性 ✅ 全过

核对命令（可复跑）：

```bash
python - <<'EOF'   # 逐接口核对 6 项：方法/路径/请求参数/响应形状/错误形状/状态标注
# ... 见打卡记录，逐项 PASS
EOF
```

结果：**7 个接口 × 6 项 = 42 项检查，FAIL 0 项**。每个接口都写全了路径、方法、请求参数（query/路径参数/请求体）、成功响应 JSON 形状、错误形状（统一 `{ok:false,error:{code,message}}`）和实现日程标注。

## 检测 3：召回三问 ✅（不看文档口述）

1. **我的项目用哪几张表？** 两张：`cards`（主对象：知识卡片，字段 id/subject/type/level/front/back/source/created_at）和 `quiz_records`（按时间累积的闯关记录：id/score/total/date/created_at）——对应教材"主对象 + 记录"两张表模式，种子数据就是 `data/quest-cards.json` 的 24 张卡。
2. **第一个要实现的接口是什么？** 已实现的是 `GET /api/health`（Day 15，链路验证）；第一个业务接口是 `GET /api/cards`（Day 17 读接口）。
3. **接口出错时返回什么形状？** `{ "ok": false, "error": { "code": "<错误码>", "message": "<人话描述>" } }`，HTTP 状态码 4xx/5xx；未实现的已登记接口返回 501 `NOT_IMPLEMENTED`，没登记的路径返回 404。

## 检测 4：前端公网 ✅（已有公网托管，CloudBase 版等注册）

- GitHub Pages（第 2 周起一直在用）当前 `HTTP 200`，截图 `day15_pages_live.png`：地址栏为 `https://xingho-vibecoding.github.io/knowledge-quest/`，页面正常渲染 24 张卡。
- CloudBase 静态托管版：注册后跑 `bash cloudbase/deploy.sh <环境ID>` 即补上，届时换它当主站（Day 20 要接真实接口，静态托管和云函数同域省跨域配置）。

## 待办（全部卡在"注册"这一步之后）

| 事项 | 补法 |
|---|---|
| /api/health 公网截图 | 注册 → `tcb login` → `bash cloudbase/deploy.sh <envId>` |
| CloudBase 前端截图 | 同上（脚本自动传） |
| 控制台环境信息截图（环境 ID/额度/到期） | 注册完当天抄三个值填进 `docs/day15-cloudbase-setup.md` 第 1 节 |
