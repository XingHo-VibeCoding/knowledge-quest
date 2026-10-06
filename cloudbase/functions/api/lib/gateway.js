/**
 * lib/gateway.js — 数据通道（传输层）：向 CloudBase 网关的数据库 HTTP API 发一次请求
 *
 * 【为什么不是「pg 直连」】
 *   教材与官方文档里，云函数连 PostgreSQL 的标准做法是 pg 模块 + PGHOST/PGUSER/PGPASSWORD。
 *   但 Day 17 用探针函数实测：本环境（CloudBase 免费体验版）下，云函数到数据库内网地址
 *   TCP 直连超时（28.72.71.124:54325 → TIMEOUT），即「内网互联」这条路径在免费版走不通；
 *   数据库账号密码也只在控制台可见（平台不注入环境变量）。
 *   探测同时证明：网关域名可达（https://<envId>.api.tcloudbasegateway.com 返回 401 = 通、缺鉴权）。
 *
 *   因此改用官方为「服务端」提供的等价通道：**网关 HTTP API（PostgREST）+ 环境 API Key**。
 *   —— 同属官方「连接数据库」文档中列出的服务端访问方式，走平台内部链路，不需要数据库密码。
 *
 * 【这一层管什么、不管什么】Day 19 分层
 *   管：HTTP 细节——域名、鉴权头、超时、请求体序列化、把非 2xx 转成异常
 *   不管：查哪张表、按什么条件查（→ repositories/）；该不该查、输入合不合法（→ services/）
 *
 * 【参数化怎么保证】
 *   HTTP API 没有 SQL 字符串，查询条件全部作为 URL query 参数或 JSON 请求体下发，
 *   由服务端解析并绑定，天然不存在字符串拼接注入。
 */

const https = require('https');

const ENV_ID = process.env.CLOUDBASE_ENV_ID || 'zgr202511108235qr-d2dkj33964b842';
const API_KEY = process.env.CLOUDBASE_API_KEY || '';
const GATEWAY = process.env.CLOUDBASE_GATEWAY || ('https://' + ENV_ID + '.api.tcloudbasegateway.com');

/* ＝＝＝ 向网关发一次请求 ＝＝＝
 * path 例：'/v1/rdb/rest/cards?select=id&limit=1'
 * opt = { method, body, prefer, timeout }
 *   method  默认 GET
 *   body    写入时的 JSON 请求体（对象），自动序列化并补 Content-Length
 *   prefer  写入后要拿回「刚插入的那一行」，靠 `Prefer: return=representation`
 */
function request(path, opt) {
  opt = opt || {};
  const method = opt.method || 'GET';
  const payload = (opt.body === undefined || opt.body === null) ? null : JSON.stringify(opt.body);

  return new Promise(function (resolve, reject) {
    if (!API_KEY) {
      reject(new Error('缺少 CLOUDBASE_API_KEY 环境变量（部署时注入，见 docs/day17-checkin.md）'));
      return;
    }
    const u = new URL(GATEWAY + path);
    const headers = {
      Authorization: 'Bearer ' + API_KEY,
      Accept: 'application/json',
    };
    if (payload !== null) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    if (opt.prefer) headers['Prefer'] = opt.prefer;

    const req = https.request(
      {
        hostname: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        method: method,
        headers: headers,
        timeout: opt.timeout || 8000,
      },
      function (res) {
        let data = '';
        res.on('data', function (c) { data += c; });
        res.on('end', function () {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(data ? JSON.parse(data) : []); }
            catch (e) { reject(new Error('数据库返回的内容不是合法 JSON')); }
          } else {
            reject(new Error('数据库接口返回 ' + res.statusCode + '：' + String(data).slice(0, 200)));
          }
        });
      }
    );
    req.on('timeout', function () { req.destroy(); reject(new Error('数据库请求超时')); });
    req.on('error', function (e) { reject(e); });
    if (payload !== null) req.write(payload);
    req.end();
  });
}

/* 把对象拼成 query（空值跳过；值统一 encodeURIComponent） */
function qs(obj) {
  return Object.keys(obj)
    .filter(function (k) { return obj[k] !== undefined && obj[k] !== null && obj[k] !== ''; })
    .map(function (k) { return k + '=' + encodeURIComponent(obj[k]); })
    .join('&');
}

/* PostgREST 值字面量：普通值直接传；含逗号/括号/引号等会破坏语法时，用双引号包住并转义内部引号 */
function lit(s) {
  const str = String(s);
  if (!/[",()\\]/.test(str)) return str;
  return '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

module.exports = {
  request: request,
  qs: qs,
  lit: lit,
};
