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

/* 修改（Day 22）：只改 patch 里带来的字段，其余字段原样不动。
 * 两个关键点：
 *   · `id=eq.N` 是**条件**不是「先查再改」——条件写在 URL 上，由服务端原子匹配，只可能命中一行；
 *   · `Prefer: return=representation` 让我们拿回**改完之后的那一行**（而不是「改了 N 行」这种自述），
 *     接口把真实结果返给前端，「改的到底是不是真数据」一眼可见。
 * 传进来的 patch 由业务层把关过（白名单 + 校验），本层不再判断该不该改。 */
async function updateById(id, patch) {
  const rows = await gateway.request('/v1/rdb/rest/cards?id=eq.' + id + '&select=' + FIELDS, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: patch,
  });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

/* 删除（Day 22）：同样要求把**被删掉的那一行**返回来。
 * 为什么非要它：不要求返回时，网关对「删掉了」和「id 不存在」都给 204 空体，
 * 上层就分不清「删成功」和「白删一场」——这正是「删不存在的 id 却报成功」这种防呆漏洞的来源。
 * 返回整行还有个副产品：接口能告诉调用方「刚删掉的是哪张卡」，前端可以据此提示与撤销。 */
async function removeById(id) {
  const rows = await gateway.request('/v1/rdb/rest/cards?id=eq.' + id + '&select=' + FIELDS, {
    method: 'DELETE',
    prefer: 'return=representation',
  });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

/* 防重复用：同科目 + 同题面视为同一张卡（判定标准见 api-contract.md 4.）
 * Day 22 起 PATCH 改题面时也要用它——唯一性口径在「写」和「改」两条路上必须一致。 */
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
  updateById: updateById,
  removeById: removeById,
  findBySubjectFront: findBySubjectFront,
};
