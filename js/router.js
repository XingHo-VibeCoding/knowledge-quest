/* 知识闯关 — 极简哈希路由（Day 13）
 *
 * 为什么不用路由库：项目只有 3 个视图、没有嵌套参数、也不需要服务端配合，
 * 浏览器原生的 hashchange + history 就够（Day 13「路由库进阶用法不做，够用就好」）。
 *
 * 路由表（全部可独立访问、可分享、可刷新）：
 *   #/wall               卡片墙（可带筛选参数 ?q=关键词&subject=科目）
 *   #/quiz               闯关
 *   #/card/<id>          卡片详情（多级页面的第二级：卡片墙 → 详情）
 *
 * 状态演示参数（Day 13 验收用，只在地址栏给参数时生效，不影响真实数据）：
 *   #/wall?demo=loading  常驻「加载中」骨架屏
 *   #/wall?demo=empty    常驻「空」状态
 *   #/wall?demo=error    常驻「错误」状态
 *
 * 旧地址兼容（Day 9 / Day 12 分享出去的链接不失效）：
 *   #quiz      → 闯关
 *   #q=干涉    → 卡片墙 + 关键词「干涉」
 */
const Router = {
  /** 解析当前地址栏 → { name, params, query, raw }，不改任何状态 */
  parse() {
    const raw = location.hash.replace(/^#/, '');
    let name = 'wall';
    let params = [];
    let queryStr = '';
    if (raw.charAt(0) === '/') {
      const cut = raw.indexOf('?');
      const pathPart = cut >= 0 ? raw.slice(0, cut) : raw;
      queryStr = cut >= 0 ? raw.slice(cut + 1) : '';
      params = pathPart.split('/').filter(function (s) { return s !== ''; });
      name = params.shift() || 'wall';
    } else if (raw === 'quiz') {
      name = 'quiz';          // 旧地址 #quiz
    } else if (raw) {
      queryStr = raw;         // 旧地址 #q=干涉&subject=…
    }
    return { name: name, params: params, query: new URLSearchParams(queryStr), raw: raw };
  },

  /** 生成 hash 字符串（不含 #），query 传对象或 URLSearchParams */
  build(name, params, query) {
    let hash = '#/' + name;
    if (params && params.length) hash += '/' + params.join('/');
    const p = query instanceof URLSearchParams ? query : new URLSearchParams(query || {});
    const qs = p.toString();
    return qs ? hash + '?' + qs : hash;
  },

  /** 切换视图：入栈（用户按浏览器后退键能回来） */
  go(hash) {
    if (location.hash === hash) { Router._emit(); return; }
    Router._inApp = true;      // 记一笔：本次跳转是页面内部发起的，可以安全后退
    location.hash = hash;
  },

  /** 只改参数不进历史（筛选条件、搜索关键词这类高频变化用这个） */
  replace(hash) {
    if (location.hash === hash) return;
    history.replaceState(null, '', location.pathname + location.search + hash);
  },

  /** 返回上一页：站内跳转过来就用浏览器历史，直接输地址进来的就回列表 */
  back(fallback) {
    if (Router._inApp) { history.back(); }
    else Router.go(fallback || '#/wall');
  },

  _inApp: false,
  _handlers: [],
  onChange(fn) { Router._handlers.push(fn); },
  _emit() { Router._handlers.forEach(function (fn) { fn(Router.parse()); }); }
};

/* 地址一变就是"页面内跳过一次"，记下来，详情页的「返回上一页」才敢用浏览器历史 */
window.addEventListener('hashchange', function () {
  Router._inApp = true;
  Router._emit();
});
