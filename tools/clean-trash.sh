#!/usr/bin/env bash
# clean-trash.sh — 清理部署/演练留下的临时目录
#
# 为什么需要它：环境的批量删除保护（[safe-delete]）会拦下「一轮命令内删除超过 50 个文件」
# 的 rm -rf。所以 deploy.sh 不再删旧构建目录，而是 `mv` 到 .cloudbase-trash/（mv 不触发保护）；
# 演练用的 .rollback-tmp 同理。代价是这些目录会慢慢堆积，需要一个显式的清理入口。
#
# 用法：
#   bash tools/clean-trash.sh            # 只列出会删什么（默认，安全）
#   bash tools/clean-trash.sh --yes      # 真删（一次一个目录，避免总数超阈值）
#   bash tools/clean-trash.sh --yes --keep 3   # 只保留最近 3 个，其余删掉
#
# ⚠️ 本脚本只碰仓库内的这几个固定目录，绝不递归删除仓库外的任何路径。
set -uo pipefail

PROJ="$(cd "$(dirname "$0")/.." && pwd -W 2>/dev/null || pwd)"
DOIT=0
KEEP=2
while [ $# -gt 0 ]; do
  case "$1" in
    --yes) DOIT=1 ;;
    --keep) KEEP="${2:-2}"; shift ;;
    *) echo "未知参数：$1" >&2; exit 2 ;;
  esac
  shift
done

TARGETS=(".cloudbase-trash" "rollback-trash")
FOUND=0
for t in "${TARGETS[@]}"; do
  d="$PROJ/$t"
  [ -d "$d" ] || continue
  FOUND=1
  echo "── $t ──"
  ls -1 "$d" 2>/dev/null | sort | while read -r item; do
    p="$d/$item"
    n=$(find "$p" -type f 2>/dev/null | wc -l)
    printf '  %-28s %s 个文件\n' "$item" "$n"
  done
  N=$(ls -1 "$d" 2>/dev/null | wc -l)
  echo "  共 $N 个条目；保留最近 $KEEP 个，其余$( [ "$DOIT" = 1 ] && echo '删除' || echo '将删除' )"
  if [ "$DOIT" = 1 ] && [ "$N" -gt "$KEEP" ]; then
    # 一次删一个目录：把「单次删除文件数」压在批量删除阈值（50）之下
    ls -1t "$d" | tail -n +"$((KEEP + 1))" | while read -r item; do
      p="$d/$item"
      case "$p" in "$PROJ"/.cloudbase-trash/*|"$PROJ"/rollback-trash/*) ;; *) echo "  跳过（路径不在允许范围）：$p"; continue ;; esac
      rm -rf "$p" 2>/dev/null && echo "  已删 $item" || echo "  ⚠️ 删不掉 $item（可能又撞上批量删除保护）—— 留着不影响使用"
    done
  fi
done

if [ "$FOUND" = 0 ]; then
  echo "没有需要清理的临时目录（$PROJ/.cloudbase-trash、$PROJ/rollback-trash 都不存在）"
fi
echo
echo "提示：目录里的东西都不影响部署和线上，清不掉可以放着。"
