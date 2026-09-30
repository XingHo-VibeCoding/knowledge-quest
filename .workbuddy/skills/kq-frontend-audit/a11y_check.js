// 知识闯关 · 可访问性自检（CDP，无头 Edge）
// 用法：node a11y_check.js [url] [port]     默认 http://localhost:8080/ 与 9225
// 检查：可访问名 / 表单标签关联 / 焦点样式覆盖 / 动态区域播报 / aria-describedby 悬空 / html lang
// 输出：JSON（fails 为空即通过），退出码 0/1
const { spawn } = require('child_process');
const http = require('http');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = process.argv[2] || 'http://localhost:8080/';
const PORT = Number(process.argv[3] || 9225);

function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

// 在页面里执行的检查（返回结构化结果）
const PAGE_CHECK = `(() => {
  const fails = [];
  const info = {};
  const q = (s) => Array.from(document.querySelectorAll(s));

  // 1) html lang
  info.lang = document.documentElement.getAttribute('lang') || '';
  if (!info.lang) fails.push({ item: 'html-lang', detail: '<html> 缺少 lang 属性' });

  // 2) 可访问名（button / a[href] / 表单控件）
  const interactive = q('button, a[href], input:not([type="hidden"]), select, textarea');
  info.interactiveCount = interactive.length;
  const noName = [];
  interactive.forEach((el) => {
    const id = el.id || el.className || el.tagName;
    let name = (el.getAttribute('aria-label') || '').trim();
    if (!name) {
      const by = el.getAttribute('aria-labelledby');
      if (by) name = (document.getElementById(by) || {}).textContent || '';
    }
    if (!name && el.id) {
      const lb = document.querySelector('label[for="' + el.id + '"]');
      if (lb) name = lb.textContent || '';
    }
    if (!name) name = (el.textContent || '').trim();
    if (!name) name = (el.getAttribute('title') || '').trim();
    const onlyPlaceholder = !name && (el.getAttribute('placeholder') || '').trim();
    if (onlyPlaceholder) name = el.getAttribute('placeholder');
    if (!name) noName.push(id);
  });
  info.noAccessibleName = noName;
  if (noName.length) fails.push({ item: 'accessible-name', detail: '无可访问名：' + noName.join(', ') });

  // 3) 表单控件必须有 label[for] 或 aria-label（纯 placeholder 不算）
  const unlabeled = [];
  q('input:not([type="hidden"]), select, textarea').forEach((el) => {
    const hasAria = (el.getAttribute('aria-label') || '').trim();
    const hasLabelledby = el.getAttribute('aria-labelledby') &&
      document.getElementById(el.getAttribute('aria-labelledby'));
    const hasFor = el.id && document.querySelector('label[for="' + el.id + '"]');
    if (!hasAria && !hasLabelledby && !hasFor) unlabeled.push(el.id || el.tagName);
  });
  info.inputsWithoutLabel = unlabeled;
  if (unlabeled.length) fails.push({ item: 'form-label', detail: '表单控件缺 label/aria-label：' + unlabeled.join(', ') });

  // 4) 焦点样式覆盖：每个可交互元素应命中至少一条含 :focus 的 CSS 规则
  let focusSelectors = [];
  try {
    Array.from(document.styleSheets).forEach((ss) => {
      Array.from(ss.cssRules || []).forEach((r) => {
        if (r.selectorText && r.selectorText.indexOf(':focus') >= 0) {
          r.selectorText.split(',').forEach((s) => focusSelectors.push(s.trim()));
        }
      });
    });
  } catch (e) { fails.push({ item: 'focus-rule', detail: '读取 CSSOM 失败：' + e.message }); }
  const strip = (s) => s.replace(/::?focus(-visible|-within)?/g, '').replace(/\\s+/g, ' ').trim() || '*';
  const focusTargets = focusSelectors.map(strip);
  const noFocus = [];
  interactive.forEach((el) => {
    const hit = focusTargets.some((s) => { try { return el.matches(s); } catch (e) { return false; } });
    if (!hit) noFocus.push(el.id || el.className || el.tagName);
  });
  info.focusSelectors = focusSelectors;
  info.noFocusStyle = noFocus;
  if (noFocus.length) fails.push({ item: 'focus-style', detail: '无 :focus/:focus-visible 样式：' + noFocus.join(', ') });

  // 5) 动态区域播报
  info.liveRegions = q('[role="status"], [aria-live]').map((el) => el.id || el.className);
  if (!q('[role="status"], [aria-live]').length) fails.push({ item: 'live-region', detail: '页面没有任何 role=status / aria-live 动态播报区域' });

  // 6) aria-describedby / aria-labelledby 悬空引用
  const dangling = [];
  q('[aria-describedby]').forEach((el) => {
    el.getAttribute('aria-describedby').split(/\\s+/).forEach((id) => {
      if (id && !document.getElementById(id)) dangling.push((el.id || el.tagName) + ' -> ' + id);
    });
  });
  info.danglingRefs = dangling;
  if (dangling.length) fails.push({ item: 'aria-ref', detail: 'aria-describedby 指向不存在的 id：' + dangling.join(', ') });

  // 7) 可见文字是否横向溢出（页面级）
  const se = document.scrollingElement;
  info.scroll = { scrollWidth: se.scrollWidth, clientWidth: se.clientWidth };
  if (se.scrollWidth > se.clientWidth + 1) fails.push({ item: 'overflow', detail: '页面横向溢出 ' + (se.scrollWidth - se.clientWidth) + 'px' });

  return { fails, info };
})()`;

async function main() {
  const edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
    '--window-size=1100,900', '--no-first-run', 'about:blank',
  ], { stdio: 'ignore' });

  let targets = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try { targets = await getJson('/json'); if (targets && targets.length) break; } catch (e) {}
  }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = {};
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
  };
  const send = (method, params) => new Promise((res) => {
    const mid = ++id; pending[mid] = res;
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  await send('Page.enable', {});
  await send('Page.navigate', { url: URL });
  await new Promise((r) => setTimeout(r, 3000));
  const res = await send('Runtime.evaluate', { expression: PAGE_CHECK, returnByValue: true });
  const out = res.result.result.value;

  console.log(JSON.stringify({ url: URL, fails: out.fails, info: out.info }, null, 2));
  ws.close(); edge.kill();
  process.exit(out.fails.length ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
