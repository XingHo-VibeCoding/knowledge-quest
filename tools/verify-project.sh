#!/usr/bin/env bash
# tools/verify-project.sh — 发布前检查（Day 25 产出，配套 Skill：.workbuddy/skills/verify-project/SKILL.md）
#
# 用法：
#   bash tools/verify-project.sh              # 全量（本地 + 公网 + 数据库）
#   bash tools/verify-project.sh --offline    # 只跑本地组（A 组），不碰网络
#
# 判定：每项打印 [PASS] / [FAIL] / [SKIP]，末尾给总数与结论；有 FAIL 时退出码为 1。
#   三态之外不许出现「看起来正常」「基本没问题」——判据必须写成「怎么算通过」。
#   命令不存在、请求失败、证据缺失 → 一律 FAIL（或明示 SKIP 并说明原因），不许默认通过。
#
# 检查项全部来自本项目真实踩过的坑（对应 docs/day25-checklist.md 的「来源」列），不是通用模板。
#
# ⚠️ 本脚本自己不得含可被密钥扫描命中的字面量 → 特征词向 tools/security-check.sh 现取（单一真源）。

set -u
cd "$(dirname "$0")/.." || exit 1
PROJ="$(pwd)"

PASS=0; FAIL=0; SKIP=0
ok()   { echo "  [PASS] $1"; PASS=$((PASS+1)); }
bad()  { echo "  [FAIL] $1"; FAIL=$((FAIL+1)); echo "         ↳ $2"; }
skip() { echo "  [SKIP] $1"; SKIP=$((SKIP+1)); }

OFFLINE=0
[ "${1:-}" = "--offline" ] && OFFLINE=1

# ---- 配置：地址只从 js/config.js 解析（单一真源，脚本里不写死）----
API="$(grep -oE "API_BASE: '[^']+'" js/config.js | head -1 | sed "s/API_BASE: '//; s/'//")"
BUILD="$(grep -oE "BUILD: '[^']*'" js/config.js | head -1 | sed "s/BUILD: '//; s/'//")"

# 静态站地址：GitHub Pages（不加 content-disposition 头，浏览器能直接看）
SITE="https://xingho-vibecoding.github.io/knowledge-quest"
PROBE_ID="99999999999999999999"   # 超大 id：必在 DB 层抛错，用来打「新版专有行为」

NODE="C:/Users/lenovo/.workbuddy/binaries/node/versions/22.22.2-2/node.exe"
CLI="C:/Users/lenovo/.workbuddy/binaries/node/workspace/node_modules/@cloudbase/cli/dist/standalone/cli.js"
ENV_ID="$(echo "$API" | sed -E 's#https://([^.]+)\..*#\1#')"

echo "=========================================================="
echo " 发布前检查（verify-project · Day 25）"
echo " 项目：$PROJ"
echo " 接口：${API:-<未解析到>}"
echo " 站点：$SITE"
echo " 版本：BUILD=${BUILD:-<空>}"
echo " 环境：${ENV_ID:-<未解析到>}"
echo " 时间：$(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================================="

# ==========================================================
echo
echo "A 组｜本地工作区（不碰网络）"

# A1/A2/A3：密钥与凭据 —— 直接复用 security-check.sh 的判据，避免同一件事两套标准
if [ -f tools/security-check.sh ]; then
  SEC_OUT="$(bash tools/security-check.sh --offline 2>&1)"
  for k in A1 A2 A3; do
    line="$(echo "$SEC_OUT" | grep -E "^\s+\[(PASS|FAIL)\] $k " | head -1)"
    if echo "$line" | grep -q '\[PASS\]'; then
      ok "$(echo "$line" | sed -E 's/^\s+\[(PASS|FAIL)\]\s*//')"
    else
      bad "$(echo "$line" | sed -E 's/^\s+\[(PASS|FAIL)\]\s*//')" "bash tools/security-check.sh --offline 查看明细"
    fi
  done
else
  skip "A1/A2/A3/A5 未找到 tools/security-check.sh"
fi
# A4：.env.example 存在且密钥类字段为空
if [ -f .env.example ]; then
  n=$(grep -E "^CLOUDBASE_[A-Z_]*=" .env.example | grep -vE "^[A-Z_]+=$" | wc -l | tr -d ' ')
  [ "$n" = "0" ] && ok "A4 .env.example 存在，密钥类字段均为空（只留字段名）" \
                 || bad "A4 .env.example 有 $n 个字段带了值" "把真实值删掉，只留字段名"
else
  bad "A4 .env.example 不存在" "按附录 L 建一份（只写字段名）"
fi

# A5：.env 已被忽略（从 security-check 取同一条判据与证据）
if [ -n "${SEC_OUT:-}" ]; then
  line="$(echo "$SEC_OUT" | grep -E "^\s+\[(PASS|FAIL)\] A5 " | head -1)"
  if echo "$line" | grep -q '\[PASS\]'; then
    ok "$(echo "$line" | sed -E 's/^\s+\[(PASS|FAIL)\]\s*//')"
  else
    bad "$(echo "$line" | sed -E 's/^\s+\[(PASS|FAIL)\]\s*//')" "在 .gitignore 里补一行 .env"
  fi
fi

# A6：Build 标记 —— 抓「改了前端忘了改 BUILD」（Day 24 真实遗留：前端改到 10-10，BUILD 还写 d23-10-09）
# 合法格式两种：正式发布版 vX.Y-YYYY-MM-DD / 日常迭代版 dNN-YYYY-MM-DD（Day 26 起 v1.0 走前者）
FRONT_DATE="$(git log -1 --format=%cs -- js/ index.html tools/ 2>/dev/null)"
if [ -z "$BUILD" ]; then
  bad "A6 BUILD 标记为空" "js/config.js 的 BUILD 必须是 vX.Y-YYYY-MM-DD 或 dNN-YYYY-MM-DD；空值等于『不知道线上跑哪版』"
elif ! echo "$BUILD" | grep -qE '^(v[0-9]+\.[0-9]+|d[0-9]+)-[0-9]{4}-[0-9]{2}-[0-9]{2}$'; then
  bad "A6 BUILD 格式不合法：$BUILD" "期望 vX.Y-YYYY-MM-DD（正式发布）或 dNN-YYYY-MM-DD（日常）"
else
  BUILD_DATE="$(echo "$BUILD" | sed -E 's/^(v[0-9]+\.[0-9]+|d[0-9]+)-//')"
  if [ -n "$FRONT_DATE" ] && [ "$BUILD_DATE" \< "$FRONT_DATE" ]; then
    bad "A6 BUILD 过期：${BUILD} < 前端最后改动 ${FRONT_DATE}" \
        "前端改了但 BUILD 没跟着改 → 页脚会显示旧版本号，制造『改了没生效』的假故障"
  else
    ok "A6 BUILD 标记有效：${BUILD}（前端最后改动 ${FRONT_DATE:-未知}）"
  fi
fi

# ==========================================================
if [ "$OFFLINE" = "1" ]; then
  echo
  echo "（--offline：跳过 B/C/D 组）"
else
  echo
  echo "B 组｜公网（静态站 + 接口）"
  code() { curl -s --noproxy '*' --max-time 25 -o /dev/null -w '%{http_code}' "$@"; }

  # B1：静态站首页可访问，且是真页面（不是空壳 / 错误页）
  if [ -z "$SITE" ]; then
    skip "B1 未配置静态站地址"
  else
    BODY="$(curl -s --noproxy '*' --max-time 30 "$SITE/" 2>/dev/null || true)"
    NBYTES="$(printf '%s' "$BODY" | wc -c | tr -d ' ')"
    if printf '%s' "$BODY" | grep -q '<title>' && [ "$NBYTES" -gt 5000 ]; then
      ok "B1 首页可访问且是真页面（${NBYTES} 字节，含 <title>）"
    else
      bad "B1 首页异常（${NBYTES} 字节）" "curl -s $SITE/ | head -3 看返回了什么"
    fi
  fi

  # B2：线上前端指向的接口 = 本地 js/config.js 声明的接口（防「本地改了没部署」）
  LIVE_API="$(curl -s --noproxy '*' --max-time 30 "$SITE/js/config.js" 2>/dev/null \
              | grep -oE "API_BASE: '[^']+'" | head -1 | sed "s/API_BASE: '//; s/'//")"
  if [ -z "$LIVE_API" ]; then
    bad "B2 线上 config.js 取不到 API_BASE" "curl $SITE/js/config.js"
  elif [ "$LIVE_API" = "$API" ]; then
    ok "B2 线上前端接口地址与本地一致（$LIVE_API）"
  else
    bad "B2 线上接口地址与本地不一致" "线上=$LIVE_API / 本地=$API → 前端改了没重新部署"
  fi

  # B3：健康接口
  H="$(curl -s --noproxy '*' --max-time 25 "$API/health" 2>/dev/null || true)"
  if printf '%s' "$H" | grep -q '"ok":true'; then
    ok "B3 健康接口正常（$H）"
  else
    bad "B3 健康接口异常" "GET $API/health → ${H:-<无响应>}"
  fi

  # B4：读接口
  R="$(curl -s --noproxy '*' --max-time 25 "$API/cards?limit=5" 2>/dev/null || true)"
  RCNT="$(printf '%s' "$R" | grep -oE '"count":[0-9]+' | head -1 | grep -oE '[0-9]+')"
  if printf '%s' "$R" | grep -q '"ok":true' && [ -n "$RCNT" ] && [ "$RCNT" -ge 1 ]; then
    ok "B4 读接口正常（GET /cards?limit=5 → count=$RCNT）"
  else
    bad "B4 读接口异常或返回空" "GET $API/cards?limit=5 → ${R:0:180}"
  fi

  # B5：写接口闭环 + 零残留（教材要求「读写接口各调用一次且结果正确」）
  NEW="$(curl -s --noproxy '*' --max-time 25 -X POST -H 'Content-Type: application/json' \
        -d '{"subject":"发布自检","type":"测试","front":"verify-project 写入自检（脚本自动创建）","back":"这条由发布前检查脚本创建，测完立即删除；看到它就说明残留了","level":1}' \
        "$API/cards" 2>/dev/null || true)"
  NEW_ID="$(printf '%s' "$NEW" | grep -oE '"id":[0-9]+' | head -1 | grep -oE '[0-9]+')"
  if [ -z "$NEW_ID" ]; then
    bad "B5 写入失败（没拿到新行 id）" "POST $API/cards → ${NEW:0:200}"
  else
    c1=$(code "$API/cards/$NEW_ID")
    DEL_BODY="$(curl -s --noproxy '*' --max-time 25 -X DELETE "$API/cards/$NEW_ID" 2>/dev/null || true)"
    c2=$(code "$API/cards/$NEW_ID")
    if [ "$c1" = "200" ] && [ "$c2" = "404" ]; then
      ok "B5 写→读→删闭环正确且零残留（写 id=$NEW_ID／读回 200／删后 404）"
    else
      bad "B5 写接口闭环异常（读回 $c1 期望 200／删后 $c2 期望 404）" \
          "残留 id=$NEW_ID，请手工 DELETE $API/cards/$NEW_ID"
    fi
  fi

  # B6：部署生效判据 —— 只在新版才成立的行为（Day 24 踩坑：拿时间戳当证据会误判）
  P="$(curl -s --noproxy '*' --max-time 25 "$API/cards/$PROBE_ID" 2>/dev/null || true)"
  if printf '%s' "$P" | grep -q 'INTERNAL_ERROR' && printf '%s' "$P" | grep -q 'traceId'; then
    ok "B6 线上跑的是新版（5xx 走统一出口：INTERNAL_ERROR + traceId）"
  else
    bad "B6 线上不像新版（5xx 未统一口径）" "GET $API/cards/$PROBE_ID → ${P:0:200}"$'\n'"           先确认部署真的生效：bash cloudbase/deploy.sh <envId> 看第 5 步自证"
  fi

  echo
  echo "C 组｜数据库"
  if [ ! -f "$CLI" ] || [ -z "$ENV_ID" ]; then
    skip "C1 未找到 CloudBase CLI 或环境 ID（跳过数据库检查）"
  else
    # ⚠️ 必须带 --json：不带时 CLI 只打印一张人看的表格（┌──┬──┐），grep 不到任何结构化字段
    #    —— 第一次实跑就因为漏了 --json 误报过一次 FAIL（判据有病，不是数据库有病）。
    DB_RAW="$(MSYS_NO_PATHCONV=1 "$NODE" "$CLI" db execute -e "$ENV_ID" --json --sql \
      "SELECT (SELECT count(*) FROM cards) AS cards, (SELECT count(*) FROM quiz_records) AS quiz" 2>&1 || true)"
    if printf '%s' "$DB_RAW" | grep -qE '"Rows"'; then
      # Rows 里每行是一个 JSON 字符串，形如 "[\"26\",\"6\"]"，取最后一个 [..] 数组
      ROW="$(printf '%s' "$DB_RAW" | grep -oE '\[\\"[0-9]+\\"(,\\"[0-9]+\\")*\]' | tail -1)"
      CARDS_N="$(printf '%s' "$ROW" | grep -oE '[0-9]+' | head -1)"
      QUIZ_N="$(printf '%s' "$ROW" | grep -oE '[0-9]+' | tail -1)"
      if [ -n "$CARDS_N" ] && [ -n "$QUIZ_N" ]; then
        ok "C1 数据库可连接，核心表都在（cards=$CARDS_N 行 / quiz_records=$QUIZ_N 行）"
      else
        bad "C1 数据库能连但结果解析不出来" "原始输出：$(printf '%s' "$DB_RAW" | tr '\n' ' ' | cut -c1-200)"
      fi
    else
      bad "C1 数据库查询失败或核心表缺失" "tcb db execute -e $ENV_ID --json --sql \"SELECT count(*) FROM cards\""
    fi
  fi

  echo
  echo "D 组｜人工项（脚本查不了，必须人看）"
  skip "D1 剩余额度与到期时间 —— 控制台看，脚本拿不到（本环境：体验版，到期 2027-04-03）"
fi

echo
echo "----------------------------------------------------------"
echo " 结果：PASS $PASS · FAIL $FAIL · SKIP $SKIP"
if [ "$FAIL" = "0" ]; then
  echo " 结论：全组通过，可以发布。"
else
  echo " 结论：有 $FAIL 项 FAIL，先修再重跑；红线项（密钥 / 线上不通）优先。"
fi
echo "----------------------------------------------------------"
exit $([ "$FAIL" = "0" ] && echo 0 || echo 1)
