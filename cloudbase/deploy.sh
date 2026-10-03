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
PROJ="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$PROJ/.cloudbase-dist"

echo "== 1/4 检查登录状态 =="
"$TCB" env list >/dev/null || { echo "未登录，请先执行: $TCB login"; exit 1; }
echo "已登录"

echo "== 2/4 部署云函数 api（HTTP 触发 + /api 路由）=="
"$TCB" fn deploy api \
  --dir "$PROJ/cloudbase/functions/api" \
  --httpFn \
  --path /api \
  --runtime Nodejs16.13 \
  --force \
  -e "$ENV_ID"

echo "== 3/4 上传前端静态文件 =="
rm -rf "$DIST"
mkdir -p "$DIST"
cp "$PROJ/index.html" "$DIST/"
cp -r "$PROJ/css" "$PROJ/js" "$PROJ/data" "$DIST/"
"$TCB" hosting deploy "$DIST" / -e "$ENV_ID" --verify

echo "== 4/4 公网地址 =="
"$TCB" hosting detail -e "$ENV_ID" | head -20
"$TCB" routes list -e "$ENV_ID" | head -30
echo
echo "自检："
echo "  curl <上面的 /api 公网地址>/api/health   # 应返回 {\"ok\":true,...}"
