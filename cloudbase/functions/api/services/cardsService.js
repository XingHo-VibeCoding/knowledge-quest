/**
 * services/cardsService.js — 业务层：知识卡片的读 / 写规则
 *
 * 职责边界（Day 19 分层）：
 *   ✅ 管「业务规则」——字段必填与长度上限、防重复怎么判定、查不到算不算错
 *   ❌ 不管 HTTP（状态码、响应头、CORS → index.js）、不管查询语句（→ repositories/cardsRepository.js）
 *
 * 返回值约定（三个 service 一致，便于入口层统一翻译成响应）：
 *   成功 { ok: true, data }       失败 { ok: false, status, code, message }
 *   —— status 由业务判断（404 卡片不存在 / 409 重复 / 400 输入不合法），
 *      入口层只负责把它和 code/message 一起包成 { ok:false, error:{code,message} }。
 */

const repo = require('../repositories/cardsRepository.js');
const v = require('./validate.js');

function bad(status, code, message) {
  return { ok: false, status: status, code: code, message: message };
}

/* GET /api/cards?subject=&q=&limit= */
async function list(event) {
  const qp = (event && event.queryStringParameters) || {};
  const limit = v.intParam(qp.limit, 100, 1, 1000);
  if (!limit.ok) return bad(400, 'BAD_LIMIT', 'limit 必须是 1~1000 之间的整数');

  const rows = await repo.list({ subject: qp.subject, q: qp.q, limit: limit.value });
  return { ok: true, data: rows };
}

/* GET /api/cards/:id */
async function getById(rawId) {
  const n = Number(rawId);
  if (!Number.isInteger(n) || n <= 0) return bad(400, 'BAD_ID', 'id 必须是正整数');

  const row = await repo.getById(n);
  if (!row) return bad(404, 'CARD_NOT_FOUND', '卡片不存在');
  return { ok: true, data: row };
}

/* POST /api/cards —— 契约 4.
 * 请求体 { subject, sub?, type, level, front, back }；不含 id / source / created_at（服务端生成）。
 * 校验顺序与 Day 18 完全一致（subject → type → front → back → sub → level），报错文案也未改动。 */
async function create(event) {
  const parsed = v.parseBody(event);
  if (!parsed.ok) return bad(400, 'VALIDATION_ERROR', '请求体要是一个 JSON 对象，现在这段内容解析不出来');
  const b = parsed.value;

  const subject = v.textField(b, 'subject', '科目', 8, true);
  if (!subject.ok) return bad(400, 'VALIDATION_ERROR', subject.message);
  const type = v.textField(b, 'type', '类型', 8, true);
  if (!type.ok) return bad(400, 'VALIDATION_ERROR', type.message);
  const front = v.textField(b, 'front', '题面', 200, true);
  if (!front.ok) return bad(400, 'VALIDATION_ERROR', front.message);
  const back = v.textField(b, 'back', '答案', 500, true);
  if (!back.ok) return bad(400, 'VALIDATION_ERROR', back.message);
  const sub = v.textField(b, 'sub', '子分类', 12, false);          // 可选，缺省为空串
  if (!sub.ok) return bad(400, 'VALIDATION_ERROR', sub.message);
  const level = v.intField(b, 'level', '难度', 1, 3);
  if (!level.ok) return bad(400, 'VALIDATION_ERROR', level.message);

  // 防重复：同一科目下题面相同的卡只存一张（判定标准见 api-contract.md 4.）
  const dup = await repo.findBySubjectFront(subject.value, front.value);
  if (dup) {
    return bad(409, 'DUPLICATE_CARD',
      '这张卡已经存在了（' + subject.value + ' · id ' + dup.id + '）：同一科目下题面相同的卡只存一张');
  }

  const row = await repo.create({
    subject: subject.value,
    sub: sub.value,
    type: type.value,
    level: level.value,
    front: front.value,
    back: back.value,
  });
  if (!row) return bad(500, 'DB_ERROR', '写入失败：数据库没有把新记录返回回来');

  return { ok: true, data: row };
}

module.exports = {
  list: list,
  getById: getById,
  create: create,
};
