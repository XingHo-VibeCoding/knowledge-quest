/* js/errors.js — 三类错误的统一翻译层（Day 23 新增）
 *
 * 【为什么单独开一个文件】
 *   Day 23 的错误审计发现：同一个失败，在首页、检查台、各个小面板里**各写各的话**。
 *   最难看的一处是「网络断掉」——有的地方直接把浏览器原话端上去：`Failed to fetch`。
 *   把「怎么把一次失败翻译成人话」收敛到这一个文件，页面上才敢说三类错误口径一致；
 *   以后要改话术也只改这里，不用满仓库找字符串。
 *
 * 【三类怎么分】（教材口径）
 *   input    用户输入错   HTTP 4xx —— 接口按规则拒绝：告诉他改什么
 *   network  网络 / 接口错 fetch 抛错、状态码 0 —— 连不上：提示稍后再试，并说清连的是谁
 *   server   服务端错     HTTP 5xx —— 服务器开小差：通用提示 + 追踪号（细节在服务端日志里）
 *
 * 【用法】
 *   1) 请求成功拿到响应：const info = KQ_ERROR.fromResponse(res.status, body, url);
 *   2) fetch 直接抛错：  const info = KQ_ERROR.fromThrow(e, url);
 *   3) 不确定是什么错：  const info = KQ_ERROR.describe(e, { status, body, url });
 *   4) 拼成一行给用户看：KQ_ERROR.line(info)
 *
 * 【不做什么】
 *   不吞错误、不改状态码、不重试——只负责「把失败说的话变成人话」。
 *   真正的判断（要不要回退、要不要禁用按钮）仍归调用方。
 */
(function (global) {
  'use strict';

  var KIND = { INPUT: 'input', NETWORK: 'network', SERVER: 'server' };

  function hint(url) {
    return url ? ('请求地址：' + url + '。') : '';
  }

  /* fetch 抛错 = 请求连响应都没拿到：断网 / DNS 失败 / 被浏览器跨域拦下 / 后端没启动 */
  function fromThrow(err, url) {
    var offline = (typeof navigator !== 'undefined' && navigator.onLine === false);
    return {
      kind: KIND.NETWORK,
      title: offline ? '网络已断开' : '连不上服务器',
      detail: (offline
        ? '设备当前处于离线状态，请恢复网络后重试。'
        : '网络断了，或者服务暂时不可用。请稍后重试。') + hint(url),
      raw: (err && err.message) || String(err || ''),
      traceId: null
    };
  }

  /* 拿到了响应，按状态码分流 */
  function fromResponse(status, body, url) {
    var err = (body && body.error) || {};
    var msg = err.message || '';
    var traceId = err.traceId || null;
    var code = err.code || '';

    if (status >= 500) {
      return {
        kind: KIND.SERVER,
        title: '服务器开小差了',
        detail: (msg || '请稍后再试。') + hint(url),
        raw: 'HTTP ' + status + (code ? ' ' + code : ''),
        traceId: traceId
      };
    }
    if (status >= 400) {
      return {
        kind: KIND.INPUT,
        title: '这次请求被接口拒绝了',
        detail: (msg || ('HTTP ' + status)) + '（接口按规则拒绝，不是故障）',
        raw: 'HTTP ' + status + (code ? ' ' + code : ''),
        traceId: traceId
      };
    }
    /* 2xx/3xx 走到这里说明调用方用错了地方——如实说明，不假装成功 */
    return {
      kind: KIND.SERVER,
      title: '返回不符合预期',
      detail: '接口返回了 HTTP ' + status + '，但调用方期待一次业务响应。' + hint(url),
      raw: 'HTTP ' + status,
      traceId: null
    };
  }

  /* 一次调用把两种来源都兜住：给了 status 走 fromResponse，否则按「连不上」处理 */
  function describe(e, opt) {
    opt = opt || {};
    if (typeof opt.status === 'number' && opt.status > 0) {
      return fromResponse(opt.status, opt.body, opt.url);
    }
    return fromThrow(e, opt.url);
  }

  /* 拼一行文本：标题 + 说明（页面上的提示位、toast 都用它，保证口径一致） */
  function line(info) {
    if (!info) return '';
    var t = info.title || '', d = info.detail || '';
    if (!d) return t;
    // detail 自己已经以标题开头时不再重复（例：服务端返回的 message 就是「服务器开小差了，请稍后再试」）
    if (t && d.indexOf(t) === 0) return d;
    return t + '：' + d;
  }

  /* 开发排查用：保留原始错误，别让「翻译成人话」把线索抹掉 */
  function rawOf(info) {
    return (info && info.raw) || '';
  }

  global.KQ_ERROR = {
    KIND: KIND,
    fromThrow: fromThrow,
    fromResponse: fromResponse,
    describe: describe,
    line: line,
    rawOf: rawOf
  };
})(typeof window !== 'undefined' ? window : this);
