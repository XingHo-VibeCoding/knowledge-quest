/**
 * db.js — 数据访问层（Day 17 建立，Day 19 会在此基础上前移成完整 repository）
 *
 * 【为什么不是「pg 直连」】
 *   按照教材与官方文档，云函数连 PostgreSQL 的标准做法是 pg 模块 + PGHOST/PGUSER/PGPASSWORD。
 *   但 Day 17 用探针函数实测：本环境（CloudBase 免费体验版）下，云函数到数据库内网地址
 *   TCP 直连超时（28.72.71.124:54325 → TIMEOUT），即「内网互联」这条路径在免费版走不通；
 *   数据库账号密码也只在控制台可见（平台不注入环境变量）。
 *   探测同时证明：网关域名可达（https://<envId>.api.tcloudbasegateway.com 返回 401 = 通、缺鉴权）。
 *
 *   因此改用官方为「服务端」提供的等价通道：**网关 HTTP API（PostgREST）+ 环境 API Key**。
 *   —— 同属官方「连接数据库」文档中列出的服务端访问方式，走平台内部链路，不需要数据库密码。
 *
 * 【参数化怎么保证】
 *   HTTP API 没有 SQL 字符串，查询条件全部作为 URL query 参数传递，由服务端解析并绑定，
 *   天然不存在字符串拼接注入；本文件是唯一出现查询语句的地方（接口层不许再写查询）。
 */

const https = require('https');

const ENV_ID = process.env.CLOUDBASE_ENV_ID || 'zgr202511108235qr-d2dkj33964b842';
const API_KEY = process.env.CLOUDBASE_API_KEY || '';
const GATEWAY = process.env.CLOUDBASE_GATEWAY || ('https://' + ENV_ID + '.api.tcloudbasegateway.com');

/* 对外暴露的字段清单（与 api-contract.md 第二/三章一致，避免 select=* 把内部列带出去） */
const FIELDS = {
  cards: 'id,subject,sub,type,level,front,back,source,created_at',
  quiz_records: 'id,score,total,card_ids,date,created_at',
};

/* ＝＝＝ 底层：向网关发一次 GET 请求 ＝＝＝ */

function request(path, timeout = 8000) {
  return new Promise(function (resolve, reject) {
    if (!API_KEY) {
      reject(new Error('缺少 CLOUDBASE_API_KEY 环境变量（部署时注入，见 docs/day17-checkin.md）'));
      return;
    }
    const u = new URL(GATEWAY + path);
    const req = https.request(
      {
        hostname: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        method: 'GET',
        headers: {
          Authorization: 'Bearer ' + API_KEY,
          Accept: 'application/json',
        },
        timeout: timeout,
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

/* ＝＝＝ 卡片（主对象） ＝＝＝ */

async function listCards(opt) {
  opt = opt || {};
  const params = { select: FIELDS.cards, order: 'id.asc', limit: String(opt.limit || 100) };
  if (opt.subject) params.subject = 'eq.' + lit(opt.subject);           // 精确匹配科目
  if (opt.q) {
    const pattern = lit('*' + opt.q + '*');                              // 对 front/back 做包含匹配
    params.or = '(front.ilike.' + pattern + ',back.ilike.' + pattern + ')';
  }
  return request('/v1/rdb/rest/cards?' + qs(params));
}

async function getCardById(id) {
  const rows = await request('/v1/rdb/rest/cards?' + qs({ select: FIELDS.cards, id: 'eq.' + id, limit: '1' }));
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

/* ＝＝＝ 闯关记录（按时间累积） ＝＝＝ */

async function listQuizRecords(opt) {
  opt = opt || {};
  const params = { select: FIELDS.quiz_records, order: 'date.desc,id.desc', limit: String(opt.limit || 10) };
  return request('/v1/rdb/rest/quiz_records?' + qs(params));
}

module.exports = {
  listCards: listCards,
  getCardById: getCardById,
  listQuizRecords: listQuizRecords,
};
