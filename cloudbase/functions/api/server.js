/**
 * Web 函数 HTTP 服务壳（scf_bootstrap 拉起）
 *
 * CloudBase 网关把请求转发到本进程监听的端口（约定 9000）。
 * 这里把 HTTP 请求翻译成 index.main 期望的「云接入 event」形状，
 * 复用同一个路由表，本地与线上一套逻辑。
 */

const http = require('http');
const handler = require('./index.js');

const PORT = Number(process.env.PORT || 9000);

const server = http.createServer(function (req, res) {
  const u = new URL(req.url, 'http://localhost');

  // 拼出与云接入一致的 event 形状（见 index.js 头注释）
  const chunks = [];
  req.on('data', function (c) { chunks.push(c); });
  req.on('end', function () {
    const rawBody = Buffer.concat(chunks);
    const event = {
      path: u.pathname,
      httpMethod: req.method,
      headers: Object.assign({}, req.headers),
      queryStringParameters: Object.fromEntries(u.searchParams),
      body: rawBody.toString('utf8'),
      isBase64Encoded: false,
    };

    let out;
    // handler.main 从 Day 17 起是 async（读接口要访问数据层），统一用 Promise 承接
    Promise.resolve()
      .then(function () { return handler.main(event); })
      .then(function (r) {
        out = r;
        res.writeHead(out.statusCode || 200, out.headers || {});
        res.end(out.body || '');
        console.log('[api]', req.method, u.pathname, '->', out.statusCode);
      })
      .catch(function (e) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          ok: false,
          error: { code: 'BOOTSTRAP_ERROR', message: String(e && e.message) },
        }));
        console.log('[api]', req.method, u.pathname, '-> 500 (壳层异常)');
      });
  });
});

server.listen(PORT, '0.0.0.0', function () {
  console.log('knowledge-quest api listening on ' + PORT);
});
