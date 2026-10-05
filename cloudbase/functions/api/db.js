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

/* ＝＝＝ 底层：向网关发一次请求（Day 17 只读；Day 18 起支持写入） ＝＝＝
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

/* ＝＝＝ 写入（Day 18 新增）＝＝＝
 * 写入比读取多两件事，都在这一层留位置：
 *   ① 防重复——先查（findXxx）再写（createXxx），判定标准写在 api-contract.md 里；
 *   ② 拿回新行——PostgREST 靠 `Prefer: return=representation` 才回传插入结果，
 *      这样接口可以把「库里真实生成的 id / created_at」原样返回给前端。
 * 注意：source 写死 'user'、created_at 由库默认值生成，请求体里不接受这两个字段（契约「字段口径说明」）。
 */

async function createCard(input) {
  const rows = await request('/v1/rdb/rest/cards?select=' + FIELDS.cards, {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      subject: input.subject,
      sub: input.sub || '',
      type: input.type,
      level: input.level,
      front: input.front,
      back: input.back,
      source: 'user',
    },
  });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

/* 防重复用：同科目 + 同题面视为同一张卡（题面去掉首尾空白后比较，见契约 4. 的判定标准） */
async function findCardBySubjectFront(subject, front) {
  const rows = await request('/v1/rdb/rest/cards?' + qs({
    select: 'id,subject,front',
    subject: 'eq.' + lit(subject),
    front: 'eq.' + lit(front),
    limit: '1',
  }));
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function createQuizRecord(input) {
  const rows = await request('/v1/rdb/rest/quiz_records?select=' + FIELDS.quiz_records, {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      score: input.score,
      total: input.total,
      card_ids: input.card_ids || [],
      date: input.date,
    },
  });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

/* 防重复用：同一天 + 同分数 + 同题数 + 同一批卡 = 同一条战绩。
 * card_ids 是数组，数组相等的过滤语法不够直观，这里先取当天候选（数量很小），再在内存里逐项比对，行为可控。 */
async function findDuplicateRecord(date, score, total, cardIds) {
  const rows = await request('/v1/rdb/rest/quiz_records?' + qs({
    select: 'id,score,total,card_ids,date',
    date: 'eq.' + lit(date),
    score: 'eq.' + score,
    total: 'eq.' + total,
    limit: '50',
  }));
  const want = Array.isArray(cardIds) ? cardIds : [];
  const sameIds = function (a, b) {
    if (!Array.isArray(a) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (Number(a[i]) !== Number(b[i])) return false;
    return true;
  };
  for (let i = 0; i < rows.length; i++) {
    if (sameIds(rows[i].card_ids, want)) return rows[i];
  }
  return null;
}

module.exports = {
  listCards: listCards,
  getCardById: getCardById,
  listQuizRecords: listQuizRecords,
  createCard: createCard,
  findCardBySubjectFront: findCardBySubjectFront,
  createQuizRecord: createQuizRecord,
  findDuplicateRecord: findDuplicateRecord,
};
