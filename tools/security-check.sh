#!/usr/bin/env bash
# tools/security-check.sh — 安全自查清单的一键执行版（Day 23 产出）
#
# 用法：bash tools/security-check.sh [API地址]
#   不给 API 地址时，从 js/config.js 里解析线上地址；只想跑 git 相关的 A/D 组时可传 --offline
#
# 判定：每项打印 [PASS] / [FAIL] / [SKIP]，末尾给总数。
# 判定标准与 docs/security-checklist.md 一字对应——两边不一致时以清单为准并回来改脚本。
#
# 注意：所有 curl 都带 --noproxy '*'（本机 shell 可能配了代理，会把 localhost 请求也拦掉）。

set -u
cd "$(dirname "$0")/.." || exit 1
PROJ="$(pwd)"

# 特征词用「分段拼接」写出来 —— 脚本自己也不能出现可被匹配的完整字面量，
# 否则 A1/A2 会命中本文件，形成「审计工具自己污染审计结果」。
PG_Q='post''gres'
PEM='-----''BEGIN'
PAT="${PG_Q}://|${PG_Q}ql://|sk-[A-Za-z0-9]{10,}|AKID[A-Za-z0-9]{10,}|${PEM}|gho_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}"

# 清单文档里不重复抄一遍特征词，改成向本脚本要（单一真源，两边永不失同步）
if [ "${1:-}" = "--print-pattern" ]; then echo "$PAT"; exit 0; fi

PASS=0; FAIL=0; SKIP=0

ok()   { echo "  [PASS] $1"; PASS=$((PASS+1)); }
bad()  { echo "  [FAIL] $1"; FAIL=$((FAIL+1)); echo "         ↳ $2"; }
skip() { echo "  [SKIP] $1"; SKIP=$((SKIP+1)); }

API="${1:-}"
if [ "$API" = "--offline" ]; then API=""; fi
if [ -z "$API" ]; then
  API="$(grep -oE "API_BASE: '[^']+'" js/config.js | head -1 | sed "s/API_BASE: '//; s/'//")"
fi

echo "=========================================================="
echo " 安全自查（Day 23 清单 · 一键执行版）"
echo " 项目：$PROJ"
echo " 接口：${API:-<未指定，跳过网络组>}"
echo " 时间：$(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================================="

echo
echo "A 组｜密钥与凭据（红线）"
n=$(git grep -I -i -E "$PAT" -- . 2>/dev/null | wc -l | tr -d ' ')
[ "$n" = "0" ] && ok "A1 工作区代码无密钥特征词（0 命中）" || bad "A1 工作区命中 $n 行" "git grep -I -i -n -E \"\$(bash tools/security-check.sh --print-pattern)\" -- ."

# 历史不可改写：旧提交里已含「特征词的定义本身」（清单/打卡/本脚本），所以这两条排除这三份定义处文件。
# 除它们之外，任何文件命中即红线。—— 排除名单是明示的，不是「忽略命中」。
DEFS=(":(exclude)docs/security-checklist.md" ":(exclude)docs/day23-checkin.md" ":(exclude)tools/security-check.sh")
n=$(git grep -I -i -E "$PAT" $(git rev-list --all) -- . "${DEFS[@]}" 2>/dev/null | wc -l | tr -d ' ')
tot=$(git rev-list --all --count)
[ "$n" = "0" ] && ok "A2 全部 $tot 个提交历史无密钥（0 命中，已排除 3 份特征词定义处）" || bad "A2 历史命中 $n 行" "git grep -I -i -n -E \"\$(bash tools/security-check.sh --print-pattern)\" \$(git rev-list --all)"

n=$(git log --all --oneline -- .env | wc -l | tr -d ' ')
[ "$n" = "0" ] && ok "A3 .env 从未被提交（0 条记录）" || bad "A3 .env 出现在 $n 个提交里" "git log --all --oneline -- .env"

n=$(git log --all --pretty=format: --name-only --diff-filter=A | sort -u \
    | grep -iE "\.env$|\.env\.[a-z]+$|secret|cred|\.pem$|\.key$|\.p12$" \
    | grep -viE "^\.env\.example$|^docs/screenshots/" | wc -l | tr -d ' ')
[ "$n" = "0" ] && ok "A4 历史中无敏感文件名" || bad "A4 历史里有 $n 个敏感文件名" "见清单 A4 命令"
# 例外两项：.env.example 是模板（附录 L 要求入库）；docs/screenshots/ 是自查证据图，文件名带 secret 属正常。

if git check-ignore .env >/dev/null 2>&1; then ok "A5 .env 已被忽略（$(git check-ignore -v .env | head -1)）"; else bad "A5 .env 没被忽略" "在 .gitignore 里加 .env"; fi

if [ -f .env.example ]; then
  n=$(grep -E "^CLOUDBASE_[A-Z_]*=" .env.example | grep -vE "^[A-Z_]+=$" | wc -l | tr -d ' ')
  [ "$n" = "0" ] && ok "A6 .env.example 存在且密钥类字段均为空" || bad "A6 .env.example 有 $n 个字段带了值" "把真实值删掉，只留字段名"
else
  bad "A6 .env.example 不存在" "按附录 L 建一份（只写字段名）"
fi

if [ -f .env.example ]; then
  git check-ignore .env.example >/dev/null 2>&1
  [ "$?" = "1" ] && ok "A7 .env.example 不会被忽略（能入库）" || bad "A7 .env.example 被忽略了" "检查 .gitignore 是否写了过宽的规则"
fi

n=$(grep -rnE "process\.env\.[A-Z_]+ *\|\| *['\"][^'\"]+['\"]" cloudbase/functions/ 2>/dev/null | wc -l | tr -d ' ')
[ "$n" = "0" ] && ok "A8 后端无「环境变量缺省就顶上字面量」的兜底" || bad "A8 后端有 $n 处硬编码兜底值" "缺配置就该报错，别静默用写死的值顶上"
# 判据只抓「字面量兜底」这种真隐患；CORS 白名单里的公开域名（含环境 ID）属于必须写死的业务数据，不算。

n=$(grep -rn "CLOUDBASE_API_KEY\|Authorization: Bearer" js/ tools/ index.html 2>/dev/null | grep -v "security-check.sh" | wc -l | tr -d ' ')
[ "$n" = "0" ] && ok "A9 前端不含密钥" || bad "A9 前端出现 $n 处密钥痕迹" "服务端 Key 绝不能进前端"

echo
echo "D 组｜仓库与部署卫生"
n=$(git ls-files | grep -iE "(^|/)\.env$|local\.json|(^|/)cred" | wc -l | tr -d ' ')
[ "$n" = "0" ] && ok "D1 仓库未跟踪本地私密文件" || bad "D1 仓库跟踪了 $n 个私密文件" "git rm --cached 后加进 .gitignore"
# 判据只抓 .env 本身 / cloudbaserc.local.json / cred* ；.env.example 是模板，应该在库里。

if grep -q "^\.env$" .gitignore 2>/dev/null; then ok "D2 .gitignore 覆盖 .env"; else bad "D2 .gitignore 未覆盖 .env" "补一行 .env"; fi

n=$(grep -rn "127\.0\.0\.1:879\|localhost:879" js/ index.html 2>/dev/null | wc -l | tr -d ' ')
[ "$n" = "0" ] && ok "D3 前端无本地地址残留" || bad "D3 前端有 $n 处本地地址" "接口地址只应出现在 js/config.js"

n=$(grep -n "Access-Control-Allow-Origin" cloudbase/functions/api/index.js | grep -c '\*' || true)
[ "$n" = "0" ] && ok "D4 跨域未使用通配符 *" || bad "D4 CORS 用了 *" "改回白名单回显"

echo
echo "B / C 组｜错误提示与非法输入边界（打真实接口）"
if [ -z "$API" ]; then
  skip "B1/C1~C6 未给接口地址（传参或去掉 --offline 可跑）"
else
  code() { curl -s --noproxy '*' --max-time 20 -o /dev/null -w '%{http_code}' "$@"; }

  c=$(code "$API/cards/abc");            [ "$c" = "400" ] && ok "B1/C1 非法 id → 400"     || bad "B1/C1 期望 400，实际 $c" "接口：$API/cards/abc"
  c=$(code "$API/cards/0");              [ "$c" = "400" ] && ok "C1b id=0 → 400"          || bad "C1b 期望 400，实际 $c" "接口：$API/cards/0"
  c=$(code -X PATCH -H "Content-Type: application/json" -d '{}' "$API/cards/1");            [ "$c" = "400" ] && ok "C2 空 patch → 400" || bad "C2 期望 400，实际 $c" "空请求体应报 EMPTY_PATCH"
  c=$(code -X PATCH -H "Content-Type: application/json" -d '{"id":9}' "$API/cards/1");      [ "$c" = "400" ] && ok "C3 夹带不可改字段 → 400" || bad "C3 期望 400，实际 $c" "不许静默忽略"
  c=$(code "$API/nope");                 [ "$c" = "404" ] && ok "C5 未知路由 → 404"        || bad "C5 期望 404，实际 $c" "未知路径不该是 500"
  c=$(code -X DELETE "$API/cards/5");    [ "$c" = "403" ] && ok "C6 删除内置卡 → 403"      || bad "C6 期望 403，实际 $c" "护栏应在服务端"

  resp=$(curl -s --noproxy '*' --max-time 25 "$API/cards/99999999999999999999")
  if echo "$resp" | grep -q '"code":"INTERNAL_ERROR"'; then
    tid=$(echo "$resp" | grep -oE '"traceId":"[^"]+"' | head -1)
    if echo "$resp" | grep -qE 'relation|SQL|Error:|stack|\.js:[0-9]'; then
      bad "B4 5xx 提示泄漏了内部细节" "$resp"
    else
      ok "B4 5xx 只给人话 + 追踪号（$tid）"
    fi
    c=$(code "$API/cards/99999999999999999999"); [ "$c" = "500" ] && ok "B3 服务端错 → 500 INTERNAL_ERROR" || bad "B3 期望 500，实际 $c" "$resp"
  else
    bad "B3 服务端错未按新口径返回" "$resp"
  fi
fi

echo
echo "----------------------------------------------------------"
echo " 结果：PASS $PASS · FAIL $FAIL · SKIP $SKIP"
[ "$FAIL" = "0" ] && echo " 结论：全组通过，可发布。" || echo " 结论：有 FAIL，先修再重跑（红线项 A2/A5 优先）。"
echo "----------------------------------------------------------"
exit $([ "$FAIL" = "0" ] && echo 0 || echo 1)
