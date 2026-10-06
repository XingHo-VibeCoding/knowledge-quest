/**
 * services/quizRecordsService.js — 业务层：闯关战绩的读 / 写规则
 *
 * 职责边界（Day 19 分层）：
 *   ✅ 管「业务规则」——分数与题数的关系、日期格式、抽中卡 id 的形态、防重复怎么判定
 *   ❌ 不管 HTTP（→ index.js）、不管查询语句（→ repositories/quizRecordsRepository.js）
 *
 * 返回值约定与 cardsService 一致：成功 { ok:true, data }，失败 { ok:false, status, code, message }。
 */

const repo = require('../repositories/quizRecordsRepository.js');
const v = require('./validate.js');

function bad(status, code, message) {
  return { ok: false, status: status, code: code, message: message };
}

/* GET /api/quiz-records?limit= */
async function list(event) {
  const qp = (event && event.queryStringParameters) || {};
  const limit = v.intParam(qp.limit, 10, 1, 100);
  if (!limit.ok) return bad(400, 'BAD_LIMIT', 'limit 必须是 1~100 之间的整数');

  const rows = await repo.list({ limit: limit.value });
  return { ok: true, data: rows };
}

/* POST /api/quiz-records —— 契约 7.
 * 请求体 { score, total, card_ids?, date }。
 * 校验顺序与 Day 18 完全一致（total → score → score≤total → date → 日期格式 → card_ids），报错文案未改动。 */
async function create(event) {
  const parsed = v.parseBody(event);
  if (!parsed.ok) return bad(400, 'VALIDATION_ERROR', '请求体要是一个 JSON 对象，现在这段内容解析不出来');
  const b = parsed.value;

  const total = v.intField(b, 'total', '总题数', 1, 100);
  if (!total.ok) return bad(400, 'VALIDATION_ERROR', total.message);
  const score = v.intField(b, 'score', '答对数', 0, 100);
  if (!score.ok) return bad(400, 'VALIDATION_ERROR', score.message);
  if (score.value > total.value) {
    return bad(400, 'VALIDATION_ERROR',
      '答对数不能大于总题数（score=' + score.value + ' 大于 total=' + total.value + '）');
  }

  const date = v.textField(b, 'date', '日期', 10, true);
  if (!date.ok) return bad(400, 'VALIDATION_ERROR', date.message);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value)) {
    return bad(400, 'VALIDATION_ERROR',
      '「日期」要写成 YYYY-MM-DD 的样子，例如 2026-10-05，现在收到的是「' + date.value + '」');
  }

  // card_ids 可选：本轮抽中的卡片 id 数组
  const cardIds = [];
  if (b.card_ids !== undefined && b.card_ids !== null) {
    if (!Array.isArray(b.card_ids)) {
      return bad(400, 'VALIDATION_ERROR', '「抽中的卡 id」要写成数组，例如 [1,2,3]');
    }
    if (b.card_ids.length > 100) {
      return bad(400, 'VALIDATION_ERROR', '「抽中的卡 id」最多 100 个，现在有 ' + b.card_ids.length + ' 个');
    }
    for (let i = 0; i < b.card_ids.length; i++) {
      const n = Number(b.card_ids[i]);
      if (!Number.isInteger(n) || n <= 0) {
        return bad(400, 'VALIDATION_ERROR',
          '「抽中的卡 id」里出现了不是正整数的值：' + JSON.stringify(b.card_ids[i]));
      }
      cardIds.push(n);
    }
  }

  // 防重复：同一天 + 同分数 + 同题数 + 同一批卡 = 同一条战绩（判定标准见 api-contract.md 7.）
  const dup = await repo.findDuplicate(date.value, score.value, total.value, cardIds);
  if (dup) {
    return bad(409, 'DUPLICATE_RECORD',
      '这条战绩已经记过了（id ' + dup.id + '，' + date.value + ' · ' + score.value + '/' + total.value +
      '）：同一天、同一批卡、同样的分数不重复记');
  }

  const row = await repo.create({
    score: score.value,
    total: total.value,
    card_ids: cardIds,
    date: date.value,
  });
  if (!row) return bad(500, 'DB_ERROR', '写入失败：数据库没有把新记录返回回来');

  return { ok: true, data: row };
}

module.exports = {
  list: list,
  create: create,
};
