/**
 * 本地 HTTP 预演壳（开发用，不部署）
 *
 * 把 CloudBase 的 HTTP 云接入请求翻译成云函数 event，直接调用 exports.main，
 * 再把 { statusCode, headers, body } 写回 HTTP 响应。
 * 用途：在没登录/没部署之前，用 curl 预演 /api/health 的真实 HTTP 行为。
 *
 * 用法：node cloudbase/local-http.js   （默认端口 8790）
 *       curl -i http://127.0.0.1:8790/api/health
 */

const http = require('http');
const fn = require('./functions/api/index.js');

const PORT = process.env.PORT || 8790;

http.createServer(function (req, res) {
  const u = new URL(req.url, 'http://localhost');
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', function () {
    const event = {
      path: u.pathname,
      httpMethod: req.method,
      headers: req.headers,
      queryStringParameters: Object.fromEntries(u.searchParams),
      body: body,
      isBase64Encoded: false,
    };
    let out;
    try {
      out = fn.main(event);
    } catch (e) {
      out = { statusCode: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' },
              body: JSON.stringify({ ok: false, error: { code: 'INTERNAL_ERROR', message: String(e && e.message) } }) };
    }
    res.writeHead(out.statusCode, out.headers);
    res.end(out.body);
  });
}).listen(PORT, function () {
  console.log('local cloud function http://127.0.0.1:' + PORT + '/api/health');
});
