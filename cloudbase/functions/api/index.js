/**
 * knowledge-quest 云函数（CloudBase HTTP 云接入）
 *
 * Day 15：GET /api/health —— 不连数据库、不写业务，最小可部署。
 * Day 17：GET /api/cards、GET /api/cards/:id、GET /api/quiz-records —— 接真库的读接口。
 * 其余接口仍按 api-contract.md 登记占位，未实现的一律 501，证明「契约先于实现」。
 *
 * 分层：入口层（本文件）只负责「接请求 → 校验参数 → 调数据层 → 返响应」；
 *       所有查询都在 db.js 里（Day 19 会在此基础上正式拆成 repository 并跑回归）。
 *
 * 云接入 event 形状：{ path, httpMethod, headers, queryStringParameters, body, ... }
 * 返回形状：{ statusCode, headers, body }
 */

const db = require('./db.js');

const SERVICE = 'knowledge-quest';

/* 契约里已登记、尚未实现的路径 → 计划实现日（按 api-contract.md 第三章） */
const REGISTERED_BUT_NOT_IMPLEMENTED = new Map([
  ['POST /api/cards', 'Day 18'],
  ['POST /api/quiz-records', 'Day 18'],
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

/* ＝＝＝ 参数校验（不合法的输入一律 400，且提示是人话） ＝＝＝ */

function intParam(raw, def, min, max) {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: def };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return { ok: false };
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

/* ＝＝＝ 入口 ＝＝＝ */

exports.main = async function (event) {
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
    // 跨域预检：浏览器发起非简单请求前会先问一次，这里直接放行（白名单见 corsHeaders）
    if (method === 'OPTIONS') {
      out = { statusCode: 204, headers: {}, body: '' };
    } else if (path === '/api/health' && method === 'GET') {
      out = health();
    } else if (path === '/api/cards' && method === 'GET') {
      out = await getCards(event);
    } else if (path.match(/^\/api\/cards\/[^/]+$/) && method === 'GET') {
      out = await getCardById(path.match(/^\/api\/cards\/([^/]+)$/)[1]);
    } else if (path === '/api/quiz-records' && method === 'GET') {
      out = await getQuizRecords(event);
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
    out = fail(500, 'DB_ERROR', '数据暂时拿不到，请稍后再试（' + ((e && e.message) || '未知错误') + '）');
  }

  // 统一补跨域响应头（成功与失败都补，前端才读得到错误信息）
  out.headers = Object.assign({}, out.headers, corsHeaders(event));
  return out;
};
