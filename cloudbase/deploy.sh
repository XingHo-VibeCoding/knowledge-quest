#!/usr/bin/env bash
# Day 15 一键部署：CloudBase 云函数 api（HTTP /api）+ 前端静态托管
#
# 用法：bash cloudbase/deploy.sh <环境ID>
# 前置：已 `tcb login`（浏览器授权一次，见 docs/day15-cloudbase-setup.md）
#
# 本脚本只做「上传部署」，不改数据库、不开通任何计费项。
#
# Day 24 修正（真实事故）：函数重发不再带 `--path /api`（它会让整次部署中止、代码没上传），
# 重发失败一律 fail-fast；末尾新增「部署生效自证」——打一个只在新版才成立的行为来判定，
# 而不是拿 `tcb fn detail` 的 Modification time 当证据（那个时间戳会被配置更新 touch 到）。

set -euo pipefail

ENV_ID="${1:-}"
if [ -z "$ENV_ID" ]; then
  echo "用法: bash cloudbase/deploy.sh <环境ID>" >&2
  echo "（环境 ID 在 CloudBase 控制台「环境-设置」里，形如 kq-xxxx）" >&2
  exit 1
fi

TCB="C:/Users/lenovo/.workbuddy/binaries/node/workspace/node_modules/.bin/cloudbase.cmd"
# Git Bash 下 pwd 给的是 POSIX 路径（/d/...），Windows 版 CLI 读不了，必须转成 D:/... 形式
PROJ="$(cd "$(dirname "$0")/.." && pwd -W 2>/dev/null || pwd)"
DIST="$PROJ/.cloudbase-dist"
# 函数重发元数据（CLI 写出的 deployedAt/deployedRef，用来证明「这次真的部署了」）。
# ⚠️ 不能放 $DIST 里 —— 第 3 步会 `rm -rf "$DIST"` 把前端产物目录整个重建。
FN_META="$PROJ/.cloudbase-fn-meta.json"

echo "== 1/5 检查登录状态 =="
"$TCB" env list >/dev/null || { echo "未登录，请先执行: $TCB login"; exit 1; }
echo "已登录"

echo "== 2/5 部署云函数 api（HTTP 触发）=="
# Day 20 起：这一步默认是「幂等复核」，不是每天都必须重发。
# 真正需要重发函数的场合（改了后端代码）用 FORCE_FN=1 显式打开。
#
# ⚠️⚠️ Day 24 修的真实事故：重发时**绝不能带 `--path /api`**。
#    `/api` 路由在 Day 15 已建好，CLI 会在这条链路的 `[CreateCloudBaseGWAPI]` 步骤
#    报 `Path '/api' is used, please try again in another path.` 并**中止整次部署**（exit 3）。
#    危险之处：中止前函数配置已被 touch —— `tcb fn detail` 的 Modification time 会变、
#    看起来"刚部署过"，但**函数代码根本没上传**，线上仍是旧版（Day 23 因此白跑一趟，
#    线上长期是「新配置 + 旧代码」的混合态，直到 Day 24 打并发路径才暴露）。
#    正确做法：重发只更新**代码**，路由沿用 Day 15 已建好的那套。
#    实测证据（2026-10-11）：带 --path → rc=3 且 --metadata-file 不生成；
#                           去掉 --path → rc=0 且打印 `Cloud function deployed successfully!`。
#    另：`--runtime` 只在**首次**部署生效（CLI 帮助原文），这里不再传，避免误导。
if [ "${FORCE_FN:-0}" = "1" ]; then
  # ⚠️ CLI 检查 scf_bootstrap 是看「当前工作目录」而不是 --dir，
  #    所以必须先 cd 进函数目录，否则会误报"缺少启动文件"并弹交互问题导致挂起
  cd "$PROJ/cloudbase/functions/api"
  set +e
  "$TCB" fn deploy api \
    --httpFn \
    --force \
    --metadata-file "$FN_META" \
    -e "$ENV_ID"
  FN_RC=$?
  set -e
  cd "$PROJ"
  # ⚠️ 这里**不允许容忍失败**：代码没上传上去就是没部署，必须让整条命令挂掉，
  #    否则又会回到「以为部署了、其实没部署」的老路。
  if [ "$FN_RC" != "0" ]; then
    echo "❌ 云函数重发失败（rc=$FN_RC）—— 代码没有上传，线上仍是旧版。" >&2
    echo "   常见原因：又带了 --path（报 Path '/api' is used）或登录过期。" >&2
    exit 1
  fi
  [ -f "$FN_META" ] || { echo "❌ 云函数重发 rc=0 但没写出部署元数据（$FN_META），可疑，请人工确认。" >&2; exit 1; }
  echo "云函数已重发（rc=0，元数据：$FN_META）"
else
  echo "跳过函数重发（未设 FORCE_FN=1）；函数与 /api 路由沿用 Day 15 建立的那套，末尾用行为判据复核。"
fi

echo "== 3/5 上传前端静态文件 =="
# Day 20：前端已切换到真实接口（地址唯一定义在 js/config.js），这次构建就是把线上那版换成"读真库"的版本。
# tools/ 一并上传：云端数据检查台也要能在静态托管域名下打开。
rm -rf "$DIST"
mkdir -p "$DIST"
cp "$PROJ/index.html" "$DIST/"
cp -r "$PROJ/css" "$PROJ/js" "$PROJ/data" "$PROJ/tools" "$DIST/"
echo "构建产物文件数：$(find "$DIST" -type f | wc -l)"
"$TCB" hosting deploy "$DIST" / -e "$ENV_ID" || echo "⚠️ 托管上传返回非零（--verify 一致性校验对新环境常误报），用 hosting list 自查即可"
echo "线上文件数：$("$TCB" hosting list -e "$ENV_ID" 2>/dev/null | grep -c 'index.html\|\.js\|\.css\|\.json\|\.html')"

echo "== 4/5 公网地址 =="
"$TCB" hosting detail -e "$ENV_ID" | head -20
"$TCB" routes list -e "$ENV_ID" | head -30

echo
echo "== 5/5 部署生效自证（行为判据，不看时间戳）=="
API="https://${ENV_ID}.service.tcloudbase.com/api"
SELFCHECK_FAIL=0

# ① 后端活着（注意：这一条**不能**证明是新版 —— 旧版也活着）
H="$(curl -s --noproxy '*' "$API/health" 2>/dev/null || true)"
if printf '%s' "$H" | grep -q '"ok":true'; then
  echo "  [health]     OK   后端活着"
else
  echo "  [health]     ❌   后端没响应：$H"
  SELFCHECK_FAIL=1
fi

# ② 只在新版才成立的行为：超大 id 必然在 DB 层抛错 → Day 23 起统一出口返回
#    INTERNAL_ERROR + traceId；旧版返回 DB_ERROR 且不带 traceId。
#    用它判定「部署是否真的生效」——这正是 Day 23 漏掉的那一步。
B="$(curl -s --noproxy '*' "$API/cards/99999999999999999999" 2>/dev/null || true)"
if printf '%s' "$B" | grep -q 'INTERNAL_ERROR' && printf '%s' "$B" | grep -q 'traceId'; then
  echo "  [新版行为]   OK   5xx 走统一出口（INTERNAL_ERROR + traceId）→ 线上代码确实是新版"
else
  echo "  [新版行为]   ❌   线上表现像旧版：$B"
  echo "                    → 函数代码很可能没上传成功（回看第 2 步有没有被 --path 坑掉）"
  SELFCHECK_FAIL=1
fi

echo
if [ "$SELFCHECK_FAIL" = "0" ]; then
  echo "部署生效自证：全部通过"
else
  echo "部署生效自证：未通过（上面有 ❌）—— 别当它部署成功了" >&2
  exit 1
fi
