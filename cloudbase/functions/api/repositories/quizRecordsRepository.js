/**
 * repositories/quizRecordsRepository.js — 数据访问层：quiz_records 表（每轮闯关的战绩）
 *
 * 职责边界（Day 19 分层）：
 *   ✅ 只管「这张表怎么读写」：字段清单、排序、去重候选的取法、写入后把新行拿回来
 *   ❌ 不管输入合不合法（→ services/validate.js）、不管该不该写（→ services/quizRecordsService.js）、
 *      不管 HTTP 状态码（→ index.js）
 *
 * 本文件是 quiz_records 表查询语句的唯一落点。
 */

const gateway = require('../lib/gateway.js');

/* 对外暴露的字段清单（与 api-contract.md 第二/三章一致） */
const FIELDS = 'id,score,total,card_ids,date,created_at';

/* 列表：战绩是历史快照，按「日期倒序 + 同一天内 id 倒序」展示最新的在最上面 */
async function list(opt) {
  opt = opt || {};
  const params = { select: FIELDS, order: 'date.desc,id.desc', limit: String(opt.limit || 10) };
  return gateway.request('/v1/rdb/rest/quiz_records?' + gateway.qs(params));
}

/* 写入：card_ids 缺省写空数组；created_at 由库默认值生成 */
async function create(input) {
  const rows = await gateway.request('/v1/rdb/rest/quiz_records?select=' + FIELDS, {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      score: input.score,
      total: input.total,
      card_ids: input.card_ids || [],
      date: input.date,
    },
  });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

/* 防重复用：同一天 + 同分数 + 同题数 + 同一批卡 = 同一条战绩。
 * card_ids 是数组，数组相等的过滤语法不够直观，这里先取当天候选（数量很小），再在内存里逐项比对，行为可控。 */
async function findDuplicate(date, score, total, cardIds) {
  const rows = await gateway.request('/v1/rdb/rest/quiz_records?' + gateway.qs({
    select: 'id,score,total,card_ids,date',
    date: 'eq.' + gateway.lit(date),
    score: 'eq.' + score,
    total: 'eq.' + total,
    limit: '50',
  }));
  const want = Array.isArray(cardIds) ? cardIds : [];
  const sameIds = function (a, b) {
    if (!Array.isArray(a) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (Number(a[i]) !== Number(b[i])) return false;
    return true;
  };
  for (let i = 0; i < rows.length; i++) {
    if (sameIds(rows[i].card_ids, want)) return rows[i];
  }
  return null;
}

module.exports = {
  FIELDS: FIELDS,
  list: list,
  create: create,
  findDuplicate: findDuplicate,
};
