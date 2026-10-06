/**
 * services/validate.js — 业务层：输入校验的通用工具
 *
 * 职责边界（Day 19 分层）：
 *   ✅ 只管「这段输入合不合法、不合法时用中文说清楚缺了什么」
 *   ❌ 不碰数据库（→ repositories/）、不碰 HTTP 状态码（→ index.js）
 *
 * 所有错误提示刻意写成「人能看懂的一句话」——这是 Day 18 定下的标准：
 * 报错要说缺了哪个字段、超了多少，而不是笼统的 invalid input。
 */

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

/* query 里的整数参数：可缺省（缺省用默认值），给了就必须在范围内 */
function intParam(raw, def, min, max) {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: def };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return { ok: false };
  return { ok: true, value: n };
}

module.exports = {
  parseBody: parseBody,
  textField: textField,
  intField: intField,
  intParam: intParam,
};
