#!/usr/bin/env bash
# tools/backup-data.sh — 发布前数据备份（Day 26 产出）
#
# 用法：bash tools/backup-data.sh [输出目录]     默认 backups/
#
# 为什么必须有这一步：回滚只解决**代码**问题（退回上一版部署）；
# 数据一旦被误删/误改，回滚救不回来 —— 只能靠发布前导出的备份重新导入。
# 所以「发布前先导出」和「会回滚」是两件事，都要有。
#
# 原理：tcb db execute --json 导出 → 解析 Rows（每行是一个 JSON 字符串，要二次解析）
#       → 落成 {表名}.json（含导出时刻 + 行数，便于将来核对）。

set -u
cd "$(dirname "$0")/.." || exit 1

OUT_DIR="${1:-backups}"
mkdir -p "$OUT_DIR"

NODE="C:/Users/lenovo/.workbuddy/binaries/node/versions/22.22.2-2/node.exe"
CLI="C:/Users/lenovo/.workbuddy/binaries/node/workspace/node_modules/@cloudbase/cli/dist/standalone/cli.js"
ENV_ID="$(grep -oE "API_BASE: 'https://[^.]+" js/config.js | head -1 | sed 's#.*https://##')"

if [ -z "$ENV_ID" ] || [ ! -f "$CLI" ]; then
  echo "❌ 取不到环境 ID 或找不到 CloudBase CLI（检查 js/config.js 与 CLI 安装）" >&2
  exit 1
fi

STAMP="$(date '+%Y%m%d')"
echo "== 导出云端数据备份（环境 $ENV_ID）→ $OUT_DIR/ =="

for T in cards quiz_records; do
  MSYS_NO_PATHCONV=1 "$NODE" "$CLI" db execute -e "$ENV_ID" --json \
    --sql "SELECT * FROM $T ORDER BY id" > "$OUT_DIR/.raw_$T.json" 2>&1
  MSYS_NO_PATHCONV=1 OUT="$OUT_DIR/$T" STAMP="$STAMP" RAW="$OUT_DIR/.raw_$T.json" \
    /c/Users/lenovo/.workbuddy/binaries/python/versions/3.13.12/python.exe - <<'PY'
import json, os, datetime
raw = open(os.environ['RAW'], encoding='utf-8').read().lstrip()
try:
    obj, _ = json.JSONDecoder().raw_decode(raw)     # banner 跟在 JSON 后面，不能直接 loads
except Exception:
    print('  ❌ 解析失败：', raw[:200]); raise SystemExit(1)
if 'data' not in obj or 'Rows' not in obj['data']:
    print('  ❌ 返回里没有 Rows：', raw[:200]); raise SystemExit(1)
d = obj['data']
cols = d.get('Columns') or []
rows = [json.loads(r) for r in d['Rows']]           # Rows 里每行本身是 JSON 字符串
out = {
    'exported_at': datetime.datetime.now().isoformat(timespec='seconds'),
    'row_count': len(rows),
    'columns': cols,
    'rows': rows,
}
path = os.environ['OUT'] + '_' + os.environ['STAMP'] + '.json'
with open(path, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
print('  ✅ %s  %d 行  %d 字段  → %s' % (os.path.basename(os.environ['OUT']), len(rows), len(cols), path))
PY
  rm -f "$OUT_DIR/.raw_$T.json"
done

echo
echo "备份完成。文件清单："
ls -la "$OUT_DIR"/*_"$STAMP".json 2>/dev/null | sed 's/^/  /'
echo
echo "⚠️ 数据恢复只能用这些文件**重新导入**（见 docs/day26-rollback-manual.md 第三层）。"
