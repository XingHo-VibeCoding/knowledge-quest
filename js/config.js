/* 知识闯关 — 运行期配置（Day 20）
 * ＝＝＝ 全站唯一的接口地址定义点 ＝＝＝
 * 规矩：页面代码只准引用 KQ_CONFIG，不许再各自写死 http(s) 地址字符串。
 * 改这一个文件，首页 / 展览模式 / 闯关 / 检查台 会同时跟着变——
 * 这样"切换 mock→真库"就只有一个开关，不会出现"改了首页忘了检查台"。
 *
 * 为什么接口地址要写成常量而不是环境变量：前端是纯静态页面，构建时没有注入环节，
 * 运行时也没有 process.env。所以"唯一收敛点"就是一个 JS 常量文件——
 * 对静态站来说，这个文件等价于后端的 .env。
 */
const KQ_CONFIG = {
  /* 公网接口基址（CloudBase 云函数 HTTP 访问，Day 15 起可用，Day 19 完成分层重构）
     ⚠️ 末尾不带斜杠；路径由各调用点自己拼（如 '/cards?limit=200'）。 */
  API_BASE: 'https://zgr202511108235qr-d2dkj33964b842.service.tcloudbase.com/api',

  /* 本页所在站点 —— 留空 = 运行时自动取 location.origin。
     首页同时挂在 GitHub Pages 和 CloudBase 静态托管两个域名下，
     写死任何一个都会让另一个显示错，所以这里交给运行期判断。 */
  SITE_BASE: '',

  /* 一次读取的卡片上限，与 api-contract.md 的 limit 约定一致（服务端上限 200） */
  CARDS_LIMIT: 200,

  /* 云端数据检查台（相对路径，两个域名下都成立） */
  CHECKUP_PATH: 'tools/checkup.html',

  /* 构建标记：用来一眼确认"线上跑的到底是哪一版"，避免"改了没生效"这种假故障。
     每次重新构建上传前手动改一次（改了没改，看页脚的标记就知道）。 */
  BUILD: 'd20-2026-10-06'
};

/* 自检：配置本身写错（地址为空 / 末尾多了斜杠）时立刻喊出来，
   别等到 fetch 报一句看不懂的错——Day 20 要练的就是"一眼认出问题出在哪"。 */
if (!KQ_CONFIG.API_BASE) {
  throw new Error('[kq] KQ_CONFIG.API_BASE 为空：请检查 js/config.js');
}
if (/\/$/.test(KQ_CONFIG.API_BASE)) {
  throw new Error('[kq] KQ_CONFIG.API_BASE 末尾多了 "/"（应为 .../api），否则会拼出 //cards');
}
