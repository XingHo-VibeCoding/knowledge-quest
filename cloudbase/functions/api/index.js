/**
 * knowledge-quest 云函数（CloudBase HTTP 云接入）
 *
 * Day 15：只实现 GET /api/health —— 不连数据库、不写业务，最小可部署。
 * Day 16-22 的接口已在 api-contract.md 登记占位，这里统一返回 501 +
 * 契约里的错误形状，证明「契约先于实现」。
 *
 * 云接入 event 形状：{ path, httpMethod, headers, queryStringParameters, body, ... }
 * 返回形状：{ statusCode, headers, body }
 */

const SERVICE = 'knowledge-quest';

/* 契约里已登记、尚未实现的路径（按 api-contract.md） */
const REGISTERED_BUT_NOT_IMPLEMENTED = new Set([
  'GET /api/cards',
  'GET /api/quiz-records',
  'POST /api/quiz-records',
  'POST /api/cards',
  'DELETE /api/cards', // + /:id
]);

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(obj),
  };
}

function fail(statusCode, code, message) {
  return json(statusCode, { ok: false, error: { code, message } });
}

/* ＝＝＝ 路由表：每个处理器收到 (event, path, method) ＝＝＝ */

function health() {
  return json(200, { ok: true, service: SERVICE, time: new Date().toISOString() });
}

/* ＝＝＝ 入口 ＝＝＝ */

exports.main = function (event) {
  const method = (event.httpMethod || 'GET').toUpperCase();
  let path = event.path || '/';

  // 云接入的 path 可能带环境前缀，这里只关心 /api 开头的部分
  const i = path.indexOf('/api/');
  path = i >= 0 ? path.slice(i) : path;

  try {
    if (path === '/api/health' && method === 'GET') return health();

    // 已登记未实现：按契约返回 501（不是 404 —— 404 只留给谁都没登记的路径）
    // 先把 /api/cards/3 这类带 id 的路径归一成 /api/cards 再比对登记表
    let base = path;
    const withId = path.match(/^(\/api\/[^/]+)\/\d+$/);
    if (withId) base = withId[1];
    if (REGISTERED_BUT_NOT_IMPLEMENTED.has(`${method} ${base}`)) {
      return fail(501, 'NOT_IMPLEMENTED',
        '该接口已在 api-contract.md 登记占位，按计划在 Day 16-22 实现');
    }

    return fail(404, 'ROUTE_NOT_FOUND', `未知路径：${method} ${path}`);
  } catch (e) {
    return fail(500, 'INTERNAL_ERROR', '服务器内部错误：' + (e && e.message));
  }
};
