# Day 15 部署实录：CloudBase 环境打通过程与卡点

> 环境：`zgr202511108235qr-d2dkj33964b842`（体验版免费，地域 ap-shanghai，到期 2027-04-03）
> 记录时间：2026-10-04 凌晨

## 一、已打通的部分 ✅

| 步骤 | 结果 | 证据 |
|---|---|---|
| 腾讯云账号 + 实名 | 用户本人完成 | 控制台可建环境 |
| 创建云开发环境 | ✅ | `tcb env list` → Status `NORMAL`，体验版，2027-04-03 到期 |
| CLI 设备码授权登录 | ✅ | `tcb login` 输出 `login succeeded`；`tcb env list` 可列出环境 |
| 云函数 `api` 部署 | ✅ | `tcb fn list` → `lam-r6gig26n`，Runtime Nodejs16.13，Status `Deployment completed`，`fn detail` 里 `Type = HTTP` |
| 静态托管开通 + 前端上传 | ✅ | 15 个文件，`hosting detail` → Status `[Online]` |
| 线上前端可访问 | ✅ | https://zgr202511108235qr-d2dkj33964b842-1500012353.tcloudbaseapp.com （index.html 200，含展览模式与亮色令牌） |

## 二、卡点与修复全过程 ✅：云函数 HTTP 访问（`/api`）

中间态现象：`GET https://zgr202511108235qr-d2dkj33964b842.service.tcloudbase.com/api/health`
先返回 `{"code":"FUNCTIONS_PARAM_INVALID",...}`，改路由后变成 `{"code":"INVALID_PATH",...}`。**最终已打通（200）**。

排查与修复：

1. **函数本身没问题**：本地 `node server.js` 壳实测 `GET /api/health` → 200 `{"ok":true,...}`、未知路径 → 404。
2. **根因：CLI 自动建的路由把上游类型登记错了**。`tcb routes list` 显示 `/api` 路由上游是 **`SCF`**（事件函数），而我们的函数是 **HTTP（Web）函数** → 网关报 `FUNCTIONS_PARAM_INVALID`。
   - 修复命令：
     ```bash
     tcb routes edit -e $ENV --yes --data '{"domain":"*","routes":[{"path":"/api","upstreamResourceType":"WEB_SCF","upstreamResourceName":"api","enablePathTransmission":true}]}'
     ```
   - 改完 `routes list` 显示 `WEB_SCF / Enable`，但**不是立刻生效**——网关侧还要几分钟收敛（期间一直 `INVALID_PATH`）。等待后重试即通。
3. **系统内部域名不允许手动建/改路由**：`tcb routes add` 对 `*.service.tcloudbase.com` 直接拒绝（`system internal domain`），所以能做的就是把类型改对 + 等收敛，或改用自定义域名。
4. **该新环境后端确实不稳**：同一命令短时间内结果不一致（`fn list` 一次有函数、一次为空；环境创建后长时间 `UNAVAILABLE` 才变 `NORMAL`）。与官方社区近期多起报告一致（新建免费环境初始化/网关链路有波动）。**遇到 "函数不存在" 先重试，别急着改代码。**

### 线上自检结果（2026-10-04 01:02 实测）

```bash
GET  /api/health      -> 200  {"ok":true,"service":"knowledge-quest","time":"2026-10-03T17:02:05.625Z"}
GET  /api/cards       -> 501  已登记未实现（按 api-contract.md）
GET  /api/cards/3     -> 501  带 id 路径归一后命中登记表
GET  /api/quiz-records-> 501
POST /api/cards       -> 501
GET  /api/nothing     -> 404  未知路径
```

> 注意：浏览器直接打开 CloudBase 默认测试域名（`*.service.tcloudbase.com` / `*.tcloudbaseapp.com`）会先看到腾讯云「页面访问提示（风险提醒）」拦截页，这是默认域名的既有行为，**机器访问（curl / 前端 fetch）不受影响**；想彻底去掉需绑定自定义域名，本项目暂不需要。

## 三、复现命令

```bash
TCB="C:/Users/lenovo/.workbuddy/binaries/node/workspace/node_modules/.bin/cloudbase.cmd"
ENV=zgr202511108235qr-d2dkj33964b842

"$TCB" env list -e $ENV                  # 环境状态
"$TCB" fn list  -e $ENV                  # 函数是否存在
"$TCB" routes list -e $ENV               # 路由上游类型应为 WEB_SCF
curl -s "https://$ENV.service.tcloudbase.com/api/health"
```

## 四、踩到的三个坑（已修进脚本）

1. **Git Bash 路径坑**：`pwd` 给的是 `/d/knowledge-quest`，Windows 版 CLI 读不了 → `deploy.sh` 改用 `pwd -W` 得到 `D:/knowledge-quest`。
2. **`scf_bootstrap` 检查看的是当前目录**：CLI 报「Web function requires scf_bootstrap startup file」并弹交互问题导致挂起（非交互环境直接卡死）。实际文件在函数目录里也有，但 CLI 只看 cwd → 脚本改成先 `cd` 进函数目录再部署。
3. **`--verify` 一致性校验对新环境误报**：上传报 `一致性校验失败 missing=<全部文件>`，但 `hosting list` 显示 15 个文件都在、站点 200。→ 脚本去掉 `--verify`，改用 `hosting list` 自查。

## 五、下一步

- 等平台网关收敛后再跑一次 `curl .../api/health`（脚本已就绪，一条命令）。
- 若仍不通：控制台 → 云函数 → api → HTTP 访问服务，看路由是否显示；必要时提工单（附 envId + requestId）。
- 前端已可用（GitHub Pages + CloudBase 静态托管双线），Day 15 的「前端 mock 版部署」目标已达成；`/api` 属于加分/后续接口。
