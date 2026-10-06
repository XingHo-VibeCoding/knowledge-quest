/**
 * repositories/cardsRepository.js — 数据访问层：cards 表（知识卡片，主对象）
 *
 * 职责边界（Day 19 分层）：
 *   ✅ 只管「这张表怎么读写」：查什么字段、按什么条件、排什么序、怎么把新行拿回来
 *   ❌ 不管输入合不合法（→ services/validate.js）、不管该不该写（→ services/cardsService.js）、
 *      不管 HTTP 状态码（→ index.js）
 *
 * 本文件是 cards 表查询语句的唯一落点：要改字段、改排序、改去重口径，只改这里。
 */

const gateway = require('../lib/gateway.js');

/* 对外暴露的字段清单（与 api-contract.md 第二/三章一致，避免 select=* 把内部列带出去） */
const FIELDS = 'id,subject,sub,type,level,front,back,source,created_at';

/* 列表：默认按 id 升序；支持按科目精确筛选、按题面/答案关键词模糊搜索 */
async function list(opt) {
  opt = opt || {};
  const params = { select: FIELDS, order: 'id.asc', limit: String(opt.limit || 100) };
  if (opt.subject) params.subject = 'eq.' + gateway.lit(opt.subject);        // 精确匹配科目
  if (opt.q) {
    const pattern = gateway.lit('*' + opt.q + '*');                          // 对 front/back 做包含匹配
    params.or = '(front.ilike.' + pattern + ',back.ilike.' + pattern + ')';
  }
  return gateway.request('/v1/rdb/rest/cards?' + gateway.qs(params));
}

/* 单条：查不到返回 null（是不是 404 由上层决定） */
async function getById(id) {
  const rows = await gateway.request(
    '/v1/rdb/rest/cards?' + gateway.qs({ select: FIELDS, id: 'eq.' + id, limit: '1' })
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

/* 写入：source 写死 'user'、created_at 由库默认值生成（请求体里不接受这两个字段，见契约「字段口径说明」）。
 * 靠 `Prefer: return=representation` 把「库里真实生成的那一行」拿回来，接口才能把真实 id 返给前端。 */
async function create(input) {
  const rows = await gateway.request('/v1/rdb/rest/cards?select=' + FIELDS, {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      subject: input.subject,
      sub: input.sub || '',
      type: input.type,
      level: input.level,
      front: input.front,
      back: input.back,
      source: 'user',
    },
  });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

/* 防重复用：同科目 + 同题面视为同一张卡（判定标准见 api-contract.md 4.） */
async function findBySubjectFront(subject, front) {
  const rows = await gateway.request('/v1/rdb/rest/cards?' + gateway.qs({
    select: 'id,subject,front',
    subject: 'eq.' + gateway.lit(subject),
    front: 'eq.' + gateway.lit(front),
    limit: '1',
  }));
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

module.exports = {
  FIELDS: FIELDS,
  list: list,
  getById: getById,
  create: create,
  findBySubjectFront: findBySubjectFront,
};
