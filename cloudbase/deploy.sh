#!/usr/bin/env bash
# Day 15 一键部署：CloudBase 云函数 api（HTTP /api）+ 前端静态托管
#
# 用法：bash cloudbase/deploy.sh <环境ID>
# 前置：已 `tcb login`（浏览器授权一次，见 docs/day15-cloudbase-setup.md）
#
# 本脚本只做「上传部署」，不改数据库、不开通任何计费项。

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

echo "== 1/4 检查登录状态 =="
"$TCB" env list >/dev/null || { echo "未登录，请先执行: $TCB login"; exit 1; }
echo "已登录"

echo "== 2/4 部署云函数 api（HTTP 触发 + /api 路由）=="
# ⚠️ CLI 检查 scf_bootstrap 是看「当前工作目录」而不是 --dir，
#    所以必须先 cd 进函数目录，否则会误报"缺少启动文件"并弹交互问题导致挂起
cd "$PROJ/cloudbase/functions/api"
"$TCB" fn deploy api \
  --httpFn \
  --path /api \
  --runtime Nodejs16.13 \
  --force \
  -e "$ENV_ID"
cd "$PROJ"

echo "== 3/4 上传前端静态文件 =="
rm -rf "$DIST"
mkdir -p "$DIST"
cp "$PROJ/index.html" "$DIST/"
cp -r "$PROJ/css" "$PROJ/js" "$PROJ/data" "$DIST/"
"$TCB" hosting deploy "$DIST" / -e "$ENV_ID" || echo "⚠️ 托管上传返回非零（--verify 一致性校验对新环境常误报），用 hosting list 自查即可"

echo "== 4/4 公网地址 =="
"$TCB" hosting detail -e "$ENV_ID" | head -20
"$TCB" routes list -e "$ENV_ID" | head -30
echo
echo "自检："
echo "  curl <上面的 /api 公网地址>/api/health   # 应返回 {\"ok\":true,...}"
