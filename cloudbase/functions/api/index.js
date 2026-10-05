/**
 * knowledge-quest 云函数（CloudBase HTTP 云接入）
 *
 * Day 15：GET /api/health —— 不连数据库、不写业务，最小可部署。
 * Day 17：GET /api/cards、GET /api/cards/:id、GET /api/quiz-records —— 接真库的读接口。
 * Day 18：POST /api/cards、POST /api/quiz-records —— 第一个业务写入接口：校验 → 防重复 → 写库 → 读回。
 * 其余接口仍按 api-contract.md 登记占位，未实现的一律 501，证明「契约先于实现」。
 *
 * 分层：入口层（本文件）只负责「接请求 → 校验 → 调数据层 → 返响应」；
 *       所有查询与写入都在 db.js 里（Day 19 会在此基础上正式拆成 repository 并跑回归）。
 *
 * 云接入 event 形状：{ path, httpMethod, headers, queryStringParameters, body, isBase64Encoded, ... }
 * 返回形状：{ statusCode, headers, body }
 */

const db = require('./db.js');

const SERVICE = 'knowledge-quest';

/* 契约里已登记、尚未实现的路径 → 计划实现日（按 api-contract.md 第三章） */
const REGISTERED_BUT_NOT_IMPLEMENTED = new Map([
  ['DELETE /api/cards', 'Day 22'],
]);

function json(statusCode, obj) {
  return {
    statusCode,
    // ⚠️ Day 17 实测记录：CloudBase 网关会给**所有**响应硬加 content-disposition: attachment，
    //    函数侧返回的 Content-Disposition / Content-Type 都改不动它（试过 json 与内联 HTML 两种，
    //    也试过静态托管——全是 attachment）。后果：浏览器地址栏直接打开接口地址会变成「下载文件」，
    //    看不到 JSON。所以「公网可读视图」改为 GitHub Pages 上的 tools/api-live.html
    //    （地址栏是公网地址、页面里显示接口地址与原始返回），前端 fetch 不受影响。
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(obj),
  };
}

function fail(statusCode, code, message) {
  return json(statusCode, { ok: false, error: { code: code, message: message } });
}

/* ＝＝＝ CORS（跨域）＝＝＝
 * 本环境是免费体验版，控制台的「安全域名」列表不允许新增（CLI 实测：当前套餐无法执行此操作），
 * 所以由云函数自己按白名单回显 Origin——等价于控制台的跨域配置，且**不使用 * 通配符**。
 * Day 20 会再复核一遍这条链路。
 */
const ALLOWED_ORIGINS = [
  'https://xingho-vibecoding.github.io',                                              // GitHub Pages
  'https://zgr202511108235qr-d2dkj33964b842-1500012353.tcloudbaseapp.com',             // CloudBase 静态托管
];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;                     // 本机任意端口（调试）

function corsHeaders(event) {
  const h = {
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
  const headers = (event && event.headers) || {};
  const origin = headers.origin || headers.Origin || '';
  if (origin && (ALLOWED_ORIGINS.indexOf(origin) >= 0 || LOCAL_ORIGIN.test(origin))) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Vary'] = 'Origin';
  }
  return h;
}

/* ＝＝＝ 服务端日志（Day 18 余力加练）＝＝＝
 * 单行结构化日志，云函数控制台直接搜 `[KQ]` 就能捞出这个函数的所有请求。
 * 记「时间 / 方法 / 路径 / 状态码 / 耗时 / 结论」，刻意不记请求体全文：
 * 一是可能很长，二是日志里不该留下用户输入原文。
 */
function logLine(event, status, startedAt, note) {
  if (process.env.KQ_QUIET === '1') return;   // 本地回归时静默，避免日志淹没断言输出
  const method = (event && event.httpMethod) || 'GET';
  let p = (event && event.path) || '/';
  const i = p.indexOf('/api/');
  if (i >= 0) p = p.slice(i);
  console.log('[KQ] ' + new Date().toISOString() + ' ' + method + ' ' + p + ' ' +
    status + ' ' + (Date.now() - startedAt) + 'ms' + (note ? ' · ' + note : ''));
}

/* 从响应体里提炼一句「结论」，让日志一眼能看出这次请求干了什么 */
function noteOf(out) {
  try {
    const b = JSON.parse(out.body);
    if (b && b.ok === false && b.error) return b.error.code;
    if (b && b.ok === true && out.statusCode === 201 && b.data && b.data.id !== undefined) {
      return '写入 id=' + b.data.id;
    }
    if (b && b.ok === true && b.count !== undefined) return '返回 ' + b.count + ' 条';
    return '';
  } catch (e) {
    return '';
  }
}

/* ＝＝＝ 参数校验（不合法的输入一律 400，且提示是人话） ＝＝＝ */

function intParam(raw, def, min, max) {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: def };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return { ok: false };
  return { ok: true, value: n };
}

/* 请求体解析：云接入把 body 给成字符串，二进制场景会带 isBase64Encoded 标记 */
function parseBody(event) {
  let raw = event && event.body;
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: {} };
  if (typeof raw === 'object') return { ok: true, value: raw };   // 少数网关会直接解析好再给
  if (event.isBase64Encoded) {
    try { raw = Buffer.from(raw, 'base64').toString('utf8'); }
    catch (e) { return { ok: false }; }
  }
  try {
    const v = JSON.parse(raw);
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return { ok: false };
    return { ok: true, value: v };
  } catch (e) {
    return { ok: false };
  }
}

/* 文本字段：必填 + 长度上限。长度按 Unicode 码点算（中文一个字算 1），超长时把实际字数报出来 */
function textField(body, name, label, max, required) {
  const raw = body[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    if (required) return { ok: false, message: '缺少必填字段「' + label + '」' };
    return { ok: true, value: '' };
  }
  const v = String(raw).trim();
  const len = Array.from(v).length;
  if (len > max) {
    return { ok: false, message: '「' + label + '」太长了：最多 ' + max + ' 个字，现在有 ' + len + ' 个字' };
  }
  return { ok: true, value: v };
}

/* 整数字段：必填 + 范围 */
function intField(body, name, label, min, max) {
  const raw = body[name];
  if (raw === undefined || raw === null || raw === '') {
    return { ok: false, message: '缺少必填字段「' + label + '」' };
  }
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    return { ok: false, message: '「' + label + '」必须是整数，现在收到的是「' + String(raw) + '」' };
  }
  if (n < min || n > max) {
    return { ok: false, message: '「' + label + '」要在 ' + min + '~' + max + ' 之间，现在填的是 ' + n };
  }
  return { ok: true, value: n };
}

/* ＝＝＝ 处理器 ＝＝＝ */

function health() {
  return json(200, { ok: true, service: SERVICE, time: new Date().toISOString() });
}

/* GET /api/cards?subject=&q=&limit= */
async function getCards(event) {
  const qp = event.queryStringParameters || {};
  const limit = intParam(qp.limit, 100, 1, 1000);
  if (!limit.ok) return fail(400, 'BAD_LIMIT', 'limit 必须是 1~1000 之间的整数');

  const rows = await db.listCards({ subject: qp.subject, q: qp.q, limit: limit.value });
  return json(200, { ok: true, count: rows.length, data: rows });
}

/* GET /api/cards/:id */
async function getCardById(rawId) {
  const n = Number(rawId);
  if (!Number.isInteger(n) || n <= 0) return fail(400, 'BAD_ID', 'id 必须是正整数');

  const row = await db.getCardById(n);
  if (!row) return fail(404, 'CARD_NOT_FOUND', '卡片不存在');
  return json(200, { ok: true, data: row });
}

/* GET /api/quiz-records?limit= */
async function getQuizRecords(event) {
  const qp = event.queryStringParameters || {};
  const limit = intParam(qp.limit, 10, 1, 100);
  if (!limit.ok) return fail(400, 'BAD_LIMIT', 'limit 必须是 1~100 之间的整数');

  const rows = await db.listQuizRecords({ limit: limit.value });
  return json(200, { ok: true, count: rows.length, data: rows });
}

/* POST /api/cards —— 契约 4.
 * 请求体 { subject, sub?, type, level, front, back }；不含 id / source / created_at（服务端生成）。 */
async function postCard(event) {
  const parsed = parseBody(event);
  if (!parsed.ok) return fail(400, 'VALIDATION_ERROR', '请求体要是一个 JSON 对象，现在这段内容解析不出来');
  const b = parsed.value;

  const subject = textField(b, 'subject', '科目', 8, true);
  if (!subject.ok) return fail(400, 'VALIDATION_ERROR', subject.message);
  const type = textField(b, 'type', '类型', 8, true);
  if (!type.ok) return fail(400, 'VALIDATION_ERROR', type.message);
  const front = textField(b, 'front', '题面', 200, true);
  if (!front.ok) return fail(400, 'VALIDATION_ERROR', front.message);
  const back = textField(b, 'back', '答案', 500, true);
  if (!back.ok) return fail(400, 'VALIDATION_ERROR', back.message);
  const sub = textField(b, 'sub', '子分类', 12, false);          // 可选，缺省为空串
  if (!sub.ok) return fail(400, 'VALIDATION_ERROR', sub.message);
  const level = intField(b, 'level', '难度', 1, 3);
  if (!level.ok) return fail(400, 'VALIDATION_ERROR', level.message);

  // 防重复：同一科目下题面相同的卡只存一张（判定标准见 api-contract.md 4.）
  const dup = await db.findCardBySubjectFront(subject.value, front.value);
  if (dup) {
    return fail(409, 'DUPLICATE_CARD',
      '这张卡已经存在了（' + subject.value + ' · id ' + dup.id + '）：同一科目下题面相同的卡只存一张');
  }

  const row = await db.createCard({
    subject: subject.value,
    sub: sub.value,
    type: type.value,
    level: level.value,
    front: front.value,
    back: back.value,
  });
  if (!row) return fail(500, 'DB_ERROR', '写入失败：数据库没有把新记录返回回来');

  return json(201, { ok: true, data: row });
}

/* POST /api/quiz-records —— 契约 7.
 * 请求体 { score, total, card_ids?, date }。 */
async function postQuizRecord(event) {
  const parsed = parseBody(event);
  if (!parsed.ok) return fail(400, 'VALIDATION_ERROR', '请求体要是一个 JSON 对象，现在这段内容解析不出来');
  const b = parsed.value;

  const total = intField(b, 'total', '总题数', 1, 100);
  if (!total.ok) return fail(400, 'VALIDATION_ERROR', total.message);
  const score = intField(b, 'score', '答对数', 0, 100);
  if (!score.ok) return fail(400, 'VALIDATION_ERROR', score.message);
  if (score.value > total.value) {
    return fail(400, 'VALIDATION_ERROR',
      '答对数不能大于总题数（score=' + score.value + ' 大于 total=' + total.value + '）');
  }

  const date = textField(b, 'date', '日期', 10, true);
  if (!date.ok) return fail(400, 'VALIDATION_ERROR', date.message);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value)) {
    return fail(400, 'VALIDATION_ERROR',
      '「日期」要写成 YYYY-MM-DD 的样子，例如 2026-10-05，现在收到的是「' + date.value + '」');
  }

  // card_ids 可选：本轮抽中的卡片 id 数组
  const cardIds = [];
  if (b.card_ids !== undefined && b.card_ids !== null) {
    if (!Array.isArray(b.card_ids)) {
      return fail(400, 'VALIDATION_ERROR', '「抽中的卡 id」要写成数组，例如 [1,2,3]');
    }
    if (b.card_ids.length > 100) {
      return fail(400, 'VALIDATION_ERROR', '「抽中的卡 id」最多 100 个，现在有 ' + b.card_ids.length + ' 个');
    }
    for (let i = 0; i < b.card_ids.length; i++) {
      const n = Number(b.card_ids[i]);
      if (!Number.isInteger(n) || n <= 0) {
        return fail(400, 'VALIDATION_ERROR',
          '「抽中的卡 id」里出现了不是正整数的值：' + JSON.stringify(b.card_ids[i]));
      }
      cardIds.push(n);
    }
  }

  // 防重复：同一天 + 同分数 + 同题数 + 同一批卡 = 同一条战绩（判定标准见 api-contract.md 7.）
  const dup = await db.findDuplicateRecord(date.value, score.value, total.value, cardIds);
  if (dup) {
    return fail(409, 'DUPLICATE_RECORD',
      '这条战绩已经记过了（id ' + dup.id + '，' + date.value + ' · ' + score.value + '/' + total.value +
      '）：同一天、同一批卡、同样的分数不重复记');
  }

  const row = await db.createQuizRecord({
    score: score.value,
    total: total.value,
    card_ids: cardIds,
    date: date.value,
  });
  if (!row) return fail(500, 'DB_ERROR', '写入失败：数据库没有把新记录返回回来');

  return json(201, { ok: true, data: row });
}

/* ＝＝＝ 入口 ＝＝＝ */

exports.main = async function (event) {
  const startedAt = Date.now();
  const method = (event.httpMethod || 'GET').toUpperCase();
  let path = event.path || '/';

  // 云接入的 path 可能带环境前缀，只关心 /api 开头的部分
  const i = path.indexOf('/api/');
  path = i >= 0 ? path.slice(i) : path;
  // 少数网关会把查询串一起塞进 path，这里丢掉
  const qi = path.indexOf('?');
  if (qi >= 0) path = path.slice(0, qi);
  // 容忍结尾多余斜杠
  if (path.length > 1) path = path.replace(/\/+$/, '');

  let out;
  try {
    // 跨域预检：浏览器发起非简单请求（POST + application/json）前会先问一次，这里直接放行（白名单见 corsHeaders）
    if (method === 'OPTIONS') {
      out = { statusCode: 204, headers: {}, body: '' };
    } else if (path === '/api/health' && method === 'GET') {
      out = health();
    } else if (path === '/api/cards' && method === 'GET') {
      out = await getCards(event);
    } else if (path.match(/^\/api\/cards\/[^/]+$/) && method === 'GET') {
      out = await getCardById(path.match(/^\/api\/cards\/([^/]+)$/)[1]);
    } else if (path === '/api/cards' && method === 'POST') {
      out = await postCard(event);
    } else if (path === '/api/quiz-records' && method === 'GET') {
      out = await getQuizRecords(event);
    } else if (path === '/api/quiz-records' && method === 'POST') {
      out = await postQuizRecord(event);
    } else {
      // 已登记未实现：按契约返回 501（404 只留给谁都没登记的路径）
      let base = path;
      const withId = path.match(/^(\/api\/[^/]+)\/\d+$/);
      if (withId) base = withId[1];
      const planned = REGISTERED_BUT_NOT_IMPLEMENTED.get(method + ' ' + base);
      if (planned) {
        out = fail(501, 'NOT_IMPLEMENTED',
          '该接口已在 api-contract.md 登记，按计划在 ' + planned + ' 实现');
      } else {
        out = fail(404, 'ROUTE_NOT_FOUND', '未知路径：' + method + ' ' + path);
      }
    }
  } catch (e) {
    // 数据层/内部错误统一兜底；message 保留具体原因，方便前台直接看懂并排查
    out = fail(500, 'DB_ERROR', '数据没写进去或没拿出来，请稍后再试（' + ((e && e.message) || '未知错误') + '）');
  }

  // 统一补跨域响应头（成功与失败都补，前端才读得到错误信息）
  out.headers = Object.assign({}, out.headers, corsHeaders(event));
  logLine(event, out.statusCode, startedAt, noteOf(out));
  return out;
};
