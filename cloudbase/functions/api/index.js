/**
 * knowledge-quest 云函数（CloudBase HTTP 云接入）— 入口层
 *
 * Day 15：GET /api/health —— 不连数据库、不写业务，最小可部署。
 * Day 17：GET /api/cards、GET /api/cards/:id、GET /api/quiz-records —— 接真库的读接口。
 * Day 18：POST /api/cards、POST /api/quiz-records —— 第一个业务写入接口：校验 → 防重复 → 写库 → 读回。
 * Day 19：分层重构——本文件瘦身为纯入口层，数据库代码拆进 repositories/，业务规则拆进 services/。
 *         重构只「搬家」不「添家具」：路由、状态码、响应形状、报错文案逐字节未变（31 条快照比对通过）。
 *
 * 【三层各管什么】Day 19
 *   入口层（本文件）        HTTP：路由分发、path 归一化、状态码与响应形状、CORS、服务端日志
 *   业务层（services/）     规则：必填与长度、分数与题数的关系、防重复怎么判、查不到算不算错
 *   数据访问层（repositories/） 数据：查哪张表、按什么条件、怎么写入并拿回新行
 *   另有 lib/gateway.js 作为传输层（唯一发 HTTP 的地方）。
 *
 * 【为什么接口里不许写查询】
 *   查询散在接口里，加一个接口就抄一遍；改表字段要改 N 处，漏一处就静默出错。
 *   收进 repository 后：改字段只改一个文件，接口只表达「我调用了什么业务能力」。
 *
 * 云接入 event 形状：{ path, httpMethod, headers, queryStringParameters, body, isBase64Encoded, ... }
 * 返回形状：{ statusCode, headers, body }
 */

const cardsService = require('./services/cardsService.js');
const quizRecordsService = require('./services/quizRecordsService.js');

const SERVICE = 'knowledge-quest';

/* 契约里已登记、尚未实现的路径 → 计划实现日（按 api-contract.md 第三章） */
const REGISTERED_BUT_NOT_IMPLEMENTED = new Map([
  ['DELETE /api/cards', 'Day 22'],
]);

/* ＝＝＝ 响应形状（统一 { ok, data, error }）＝＝＝ */

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

/* 把业务层的返回翻译成 HTTP 响应：
 *   成功 { ok:true, data } → 由调用方给定成功状态码（200/201）与附加字段（如 count）
 *   失败 { ok:false, status, code, message } → 统一包成 { ok:false, error:{code,message} }
 */
function respond(r, successStatus, extra) {
  if (!r.ok) return fail(r.status, r.code, r.message);
  return json(successStatus, Object.assign({ ok: true }, extra || {}, { data: r.data }));
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
      out = json(200, { ok: true, service: SERVICE, time: new Date().toISOString() });
    } else if (path === '/api/cards' && method === 'GET') {
      const r = await cardsService.list(event);
      out = respond(r, 200, r.ok ? { count: r.data.length } : null);
    } else if (path.match(/^\/api\/cards\/[^/]+$/) && method === 'GET') {
      const r = await cardsService.getById(path.match(/^\/api\/cards\/([^/]+)$/)[1]);
      out = respond(r, 200);
    } else if (path === '/api/cards' && method === 'POST') {
      out = respond(await cardsService.create(event), 201);
    } else if (path === '/api/quiz-records' && method === 'GET') {
      const r = await quizRecordsService.list(event);
      out = respond(r, 200, r.ok ? { count: r.data.length } : null);
    } else if (path === '/api/quiz-records' && method === 'POST') {
      out = respond(await quizRecordsService.create(event), 201);
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
