/**
 * services/cardsService.js — 业务层：知识卡片的读 / 写 / 改 / 删规则
 *
 * 职责边界（Day 19 分层）：
 *   ✅ 管「业务规则」——字段必填与长度上限、防重复怎么判定、查不到算不算错
 *   ❌ 不管 HTTP（状态码、响应头、CORS → index.js）、不管查询语句（→ repositories/cardsRepository.js）
 *
 * 返回值约定（三个 service 一致，便于入口层统一翻译成响应）：
 *   成功 { ok: true, data }       失败 { ok: false, status, code, message }
 *   —— status 由业务判断（404 卡片不存在 / 409 重复 / 403 不可删 / 400 输入不合法），
 *      入口层只负责把它和 code/message 一起包成 { ok:false, error:{code,message} }。
 *
 * Day 22 增补：update（PATCH 一条）与 remove（DELETE 一条）——
 *   「改」和「删」各有各的防呆，见各自函数上方的注释。
 */

const repo = require('../repositories/cardsRepository.js');
const v = require('./validate.js');

function bad(status, code, message) {
  return { ok: false, status: status, code: code, message: message };
}

/* PATCH 允许改的字段（Day 22 定）：题面 / 答案 / 子分类 / 难度。
 * 为什么只放这四个：它们是「这张卡的内容」，改错了再改回来就行；
 * 而 id / source / created_at 是服务端生成的记账字段，subject / type 是这张卡的归属与分类骨架——
 * 改掉它们等于换了一张卡（历史战绩、筛选口径都会跟着飘），所以列为不可改。 */
const PATCHABLE = ['front', 'back', 'sub', 'level'];

/* 不可改字段 → 中文说法。请求里出现它们时**明确报错**，而不是静默丢掉：
 * 静默丢掉的后果是「前端以为改了，其实一个字没动」，这种沉默失败最难查。 */
const IMMUTABLE = {
  id: 'id（数据库主键）',
  subject: '科目（改它等于换了张卡）',
  type: '类型（分类骨架）',
  source: '来源（服务端记账字段）',
  created_at: '创建时间（服务端生成）',
};

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

/* PATCH /api/cards/:id —— 契约 5.（Day 22）
 * 「改」要防的呆（按检查顺序，先便宜后昂贵）：
 *   ① id 是不是正整数 → 不是就没必要往下走
 *   ② 请求体里有没有东西可改 → 空 patch 直接报错，不要静默成功（最容易被误当成「改好了」）
 *   ③ 有没有夹带不可改字段 / 不认识的字段 → 明确报错，绝不静默忽略
 *   ④ 每个字段的取值范围 → 复用 POST 同一套 textField/intField，口径两条路必须一致
 *   ⑤ 这张卡在不在 → 不在就 404（先查再改，错误信息能说清「不是改失败，是没这张卡」）
 *   ⑥ 改了题面会不会跟同科目别的卡撞车 → 撞了 409，唯一性口径与 POST 完全一致
 * 注意这里**不加** source 限制：改是可逆的（再改回来即可），护栏留给不可逆的操作（见 remove）。
 */
async function update(rawId, event) {
  const n = Number(rawId);
  if (!Number.isInteger(n) || n <= 0) return bad(400, 'BAD_ID', 'id 必须是正整数');

  const parsed = v.parseBody(event);
  if (!parsed.ok) return bad(400, 'VALIDATION_ERROR', '请求体要是一个 JSON 对象，现在这段内容解析不出来');
  const b = parsed.value;

  const keys = Object.keys(b);
  if (!keys.length) {
    return bad(400, 'EMPTY_PATCH',
      '没有要修改的内容：可改字段只有「题面 / 答案 / 子分类 / 难度」（front / back / sub / level），请至少给一个');
  }
  const frozen = keys.filter(function (k) { return IMMUTABLE[k]; });
  if (frozen.length) {
    return bad(400, 'IMMUTABLE_FIELD',
      '字段「' + frozen.map(function (k) { return IMMUTABLE[k]; }).join('」「') + '」不能修改，请去掉后再提交');
  }
  const unknown = keys.filter(function (k) { return PATCHABLE.indexOf(k) < 0; });
  if (unknown.length) {
    return bad(400, 'UNKNOWN_FIELD',
      '不认识字段「' + unknown.join('」「') + '」：这张卡能改的只有「题面 / 答案 / 子分类 / 难度」（front / back / sub / level）');
  }

  const patch = {};
  if (Object.prototype.hasOwnProperty.call(b, 'front')) {
    const r = v.textField(b, 'front', '题面', 200, true);
    if (!r.ok) return bad(400, 'VALIDATION_ERROR', r.message);
    patch.front = r.value;
  }
  if (Object.prototype.hasOwnProperty.call(b, 'back')) {
    const r = v.textField(b, 'back', '答案', 500, true);
    if (!r.ok) return bad(400, 'VALIDATION_ERROR', r.message);
    patch.back = r.value;
  }
  if (Object.prototype.hasOwnProperty.call(b, 'sub')) {
    const r = v.textField(b, 'sub', '子分类', 12, false);
    if (!r.ok) return bad(400, 'VALIDATION_ERROR', r.message);
    patch.sub = r.value;
  }
  if (Object.prototype.hasOwnProperty.call(b, 'level')) {
    const r = v.intField(b, 'level', '难度', 1, 3);
    if (!r.ok) return bad(400, 'VALIDATION_ERROR', r.message);
    patch.level = r.value;
  }

  const row = await repo.getById(n);
  if (!row) return bad(404, 'CARD_NOT_FOUND', '卡片不存在，没有可改的记录（id=' + n + '）');

  // 题面是 uniqueness 的一半，改它要重跑一次防重复（同科目 + 新题面）
  if (patch.front !== undefined && patch.front !== row.front) {
    const dup = await repo.findBySubjectFront(row.subject, patch.front);
    if (dup && Number(dup.id) !== n) {
      return bad(409, 'DUPLICATE_CARD',
        '改不了：同一科目下已经有一张题面相同的卡（' + row.subject + ' · id ' + dup.id + '），先处理那张再改');
    }
  }

  const updated = await repo.updateById(n, patch);
  if (!updated) return bad(500, 'DB_ERROR', '修改失败：数据库没有把改完的记录返回回来');
  return { ok: true, data: updated };
}

/* DELETE /api/cards/:id —— 契约 6.（Day 22）
 * 「删」为什么要比「增」多两道岗：
 *   · 新增只是「多一行」，最坏是多了一条垃圾；删除是**不可逆**的——数据没了就是没了。
 *   · 删除还会牵动别处：quiz_records.card_ids 是弱关联（历史战绩里可能就记着这张卡的 id），
 *     删掉后历史成绩不该跟着变，这正是当初选弱关联的原因。
 * 三层护栏（各管一段，缺一不可）：
 *   ① 服务端只读卡保护：source !== 'user' 的卡（种子卡 mock）一律 403 —— 护栏放在最里面，绕不过去；
 *   ② 存在性：查不到直接 404，**绝不返回「成功」**（删不存在的 id 却报成功 = 防呆缺失）；
 *   ③ 前端二次确认：不可逆操作要用户点头两次（见 tools/checkup.html 的两步按钮）。
 */
async function remove(rawId) {
  const n = Number(rawId);
  if (!Number.isInteger(n) || n <= 0) return bad(400, 'BAD_ID', 'id 必须是正整数');

  const row = await repo.getById(n);
  if (!row) return bad(404, 'CARD_NOT_FOUND', '卡片不存在，没有可删的记录（id=' + n + '）');
  if (row.source !== 'user') {
    return bad(403, 'NOT_DELETABLE',
      '「' + (row.source || '未知来源') + '」卡不能删：只有你自己添加的卡（source=user）才可删，' +
      '内置卡删掉就得重灌种子数据才能回来');
  }

  const gone = await repo.removeById(n);
  if (!gone) return bad(500, 'DB_ERROR', '删除失败：数据库没有把删掉的记录返回回来');
  return { ok: true, data: gone };
}

module.exports = {
  list: list,
  getById: getById,
  create: create,
  update: update,
  remove: remove,
};
