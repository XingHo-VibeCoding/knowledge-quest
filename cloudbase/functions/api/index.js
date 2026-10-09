/**
 * knowledge-quest 云函数（CloudBase HTTP 云接入）— 入口层
 *
 * Day 15：GET /api/health —— 不连数据库、不写业务，最小可部署。
 * Day 17：GET /api/cards、GET /api/cards/:id、GET /api/quiz-records —— 接真库的读接口。
 * Day 18：POST /api/cards、POST /api/quiz-records —— 第一个业务写入接口：校验 → 防重复 → 写库 → 读回。
 * Day 19：分层重构——本文件瘦身为纯入口层，数据库代码拆进 repositories/，业务规则拆进 services/。
 *         重构只「搬家」不「添家具」：路由、状态码、响应形状、报错文案逐字节未变（31 条快照比对通过）。
 * Day 22：PATCH /api/cards/:id、DELETE /api/cards/:id —— 改一条、删一条，数据操作闭环补齐。
 *         入口层只做两件事：认出这两个方法（含 CORS 预检里放行 PATCH）、把结果翻成响应形状；
 *         「能不能改、能不能删」全在 services/cardsService.js 里判。
 * Day 23：错误处理与安全边界——服务端错改为「日志记全量 + 用户只见人话 + 追踪号」，
 *         不再把驱动/网关的原始英文报错甩给用户（详见下方 catch 里的注释）。
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

/* 契约里已登记、尚未实现的路径 → 计划实现日（按 api-contract.md 第三章）
 * Day 22 把这最后一条（DELETE /api/cards）实现掉了，所以映射表当前为空。
 * 保留这张表和下面的判断，是因为它表达的是契约纪律：路径一旦写进 api-contract.md，
 * 在实现之前也必须返回 501 NOT_IMPLEMENTED（说清「哪天做」），而不是 404 冒充「没这回事」。 */
const REGISTERED_BUT_NOT_IMPLEMENTED = new Map([]);

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

function fail(statusCode, code, message, extra) {
  const error = { code: code, message: message };
  if (extra) Object.assign(error, extra);   // 例：服务端错附 traceId（Day 23）
  /* Day 23：**任何** 5xx 都必须带追踪号，页面上的话和日志里的记录才对得上。
   * 入口层的 catch 会自己带 traceId（它另外记了详细日志，这里不重复记）；
   * 业务层主动返回的 500（如「数据库没把新行返回来」）在这里补号并记一行。 */
  if (statusCode >= 500 && !error.traceId) {
    error.traceId = newTraceId();
    console.error('[KQ][ERROR] trace=' + error.traceId + ' ' + code + ' · ' + message);
  }
  return json(statusCode, { ok: false, error: error });
}

/* 追踪号（Day 23）：让「用户看到的那句话」和「日志里的那条错误」能对上。
 * 故意做得短、可念可抄——用户报号，开发者直接 grep 日志。 */
function newTraceId() {
  return 'KQ-' + Date.now().toString(36).toUpperCase() +
    '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
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
    // ⚠️ Day 22 记一笔：这个头是「预检放行清单」。PATCH 是**非简单方法**，浏览器发它之前一定先发
    //    OPTIONS 预检；清单里没有 PATCH，浏览器就直接把请求掐在本地（页面报跨域错，请求根本到不了云函数）。
    //    症状很有迷惑性——接口用 curl 测一切正常，只有页面上不行。改方法就顺手改这里。
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
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
    } else if (path.match(/^\/api\/cards\/[^/]+$/) && method === 'PATCH') {
      // 改一条（Day 22）：id 从路径里取，改哪些字段从请求体里取
      const r = await cardsService.update(path.match(/^\/api\/cards\/([^/]+)$/)[1], event);
      out = respond(r, 200);
    } else if (path.match(/^\/api\/cards\/[^/]+$/) && method === 'DELETE') {
      // 删一条（Day 22）：成功回 200 + 被删掉的那一行（不是 204 空体，理由见 repository 注释）
      const r = await cardsService.remove(path.match(/^\/api\/cards\/([^/]+)$/)[1]);
      out = respond(r, 200);
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
    /* ＝＝＝ 服务端错（Day 23 改造）＝＝＝
     * 改之前：把 e.message 直接拼进给用户看的提示里——
     *   `数据没写进去或没拿出来，请稍后再试（数据库接口返回 404：{"message":"relation \"cards\" does not exist"}）`
     *   两个毛病：① 用户看不懂（英文 + SQL 片段）；② 真正的排查信息**没有进日志**
     *   （logLine 只记了状态码和 code，出错时控制台翻不到原因）。
     * 改之后分两条路走：
     *   给用户：一句人话 + 一个追踪号（不泄露表名、SQL、堆栈这类内部信息）；
     *   给日志：完整错误 + stack，用同一个追踪号标记，`grep KQ-xxxx` 直接定位。 */
    const traceId = newTraceId();
    const detail = (e && e.message) || '未知错误';
    console.error('[KQ][ERROR] trace=' + traceId + ' ' + method + ' ' + path + ' · ' + detail);
    if (e && e.stack) console.error('[KQ][ERROR] trace=' + traceId + ' stack:\n' + e.stack);
    out = fail(500, 'INTERNAL_ERROR',
      '服务器开小差了，请稍后再试。若反复出现，请把追踪号 ' + traceId + ' 报给开发者。',
      { traceId: traceId });
  }

  // 统一补跨域响应头（成功与失败都补，前端才读得到错误信息）
  out.headers = Object.assign({}, out.headers, corsHeaders(event));
  logLine(event, out.statusCode, startedAt, noteOf(out));
  return out;
};
