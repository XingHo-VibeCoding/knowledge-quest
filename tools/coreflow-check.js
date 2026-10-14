// kq28_coreflow.js — Day 28 核心流程重复检测：两遍「写入→刷新→持久化→修改→删除」
// 用法: node kq28_coreflow.js <站点URL> <API_BASE> <轮次>
const http = require('http');
const [, , SITE, API, ROUND] = process.argv;
const R = ROUND || '1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TAG = '验收演练' + R + '-' + Date.now();
const FRONT_NEW = '【' + TAG + '】写入测试：光栅衍射条纹间距公式';
const FRONT_EDIT = '【' + TAG + '】已修改：dsinθ=kλ 的适用条件';
function getJson(path) {
  return new Promise((res, rej) => http.get({ host: '127.0.0.1', port: 9360, path }, r => {
    let s = ''; r.on('data', d => s += d); r.on('end', () => res(JSON.parse(s)));
  }).on('error', rej));
}
(async () => {
  const t = await getJson('/json/list');
  const ws = new WebSocket(t.find(x => x.type === 'page').webSocketDebuggerUrl);
  let i = 0; const pend = {};
  const send = (m, p = {}) => new Promise((res, rej) => { const k = ++i; pend[k] = { res, rej }; ws.send(JSON.stringify({ id: k, method: m, params: p })); });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend[m.id]) { m.error ? pend[m.id].rej(new Error(JSON.stringify(m.error))) : pend[m.id].res(m.result); delete pend[m.id]; }
  };
  await new Promise(r => ws.onopen = r);
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1240, height: 900, deviceScaleFactor: 1, mobile: false });
  const ev = async (expr, aw = true) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: aw, returnByValue: true });
    if (r.exceptionDetails) throw new Error('EVAL_ERROR: ' + JSON.stringify((r.exceptionDetails.exception || {}).description));
    return r.result.value;
  };
  const steps = [];
  await send('Page.navigate', { url: SITE });
  await sleep(4500); await ev('location.reload()'); await sleep(4500);
  const loaded = await ev("document.getElementById('srcBadge')?document.getElementById('srcBadge').textContent:''");
  const before = await ev(`(async()=>{const r=await fetch('${API}/cards?limit=500');const d=await r.json();return (d.data||d).length})()`);
  steps.push({ step: '0 打开线上首页（真数据）', ok: /已加载/.test(loaded), detail: loaded + ' · 起始行数 ' + before });

  await ev("document.getElementById('addBtn').click()"); await sleep(700);
  await ev(`document.getElementById('fFront').value=${JSON.stringify(FRONT_NEW)};document.getElementById('fBack').value='条纹间距 Δx = λD/d，缺一不可';document.getElementById('saveCardBtn').click()`);
  await sleep(3800);
  const formMsg = await ev("document.getElementById('formMsg').textContent");
  const afterWrite = await ev(`(async()=>{const r=await fetch('${API}/cards?limit=500');const d=await r.json();return (d.data||d).length})()`);
  const newId = await ev(`(async()=>{const r=await fetch('${API}/cards?limit=500');const d=await r.json();const rows=(d.data||d);const m=rows.filter(function(x){return x.front.indexOf('${TAG}')>=0});return m.length?m[0].id:0})()`);
  steps.push({ step: '1 写入（页面表单 → 云端）', ok: !!newId && afterWrite === before + 1, detail: '提示「' + formMsg + '」· 新行 id=' + newId + ' · 行数 ' + before + '→' + afterWrite });

  await ev('location.reload()'); await sleep(4500);
  const seen = await ev(`document.body.innerText.indexOf('${TAG}')>=0`);
  await ev('location.reload()'); await sleep(4500);
  const seen2 = await ev(`document.body.innerText.indexOf('${TAG}')>=0`);
  steps.push({ step: '2 刷新后仍在', ok: seen === true, detail: '页面文本命中 ' + seen });
  steps.push({ step: '3 再刷新仍在（持久化）', ok: seen2 === true, detail: '页面文本命中 ' + seen2 });

  const patch = await ev(`(async()=>{const r=await fetch('${API}/cards/${newId}',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({front:${JSON.stringify(FRONT_EDIT)}})});return r.status})()`);
  await ev('location.reload()'); await sleep(4500);
  const seenEdit = await ev(`document.body.innerText.indexOf('已修改')>=0`);
  const goneOld = await ev(`document.body.innerText.indexOf('写入测试')<0`);
  steps.push({ step: '4 修改（PATCH ' + patch + '）', ok: patch === 200 && seenEdit && goneOld, detail: '页面出现新文案 ' + seenEdit + ' · 旧文案消失 ' + goneOld });

  const del1 = await ev(`(async()=>{const r=await fetch('${API}/cards/${newId}',{method:'DELETE'});return r.status})()`);
  const del2 = await ev(`(async()=>{const r=await fetch('${API}/cards/${newId}',{method:'DELETE'});return r.status})()`);
  await ev('location.reload()'); await sleep(4500);
  const gone = await ev(`document.body.innerText.indexOf('${TAG}')<0`);
  const after = await ev(`(async()=>{const r=await fetch('${API}/cards?limit=500');const d=await r.json();return (d.data||d).length})()`);
  steps.push({ step: '5 删除（DELETE ' + del1 + '）', ok: del1 === 200 && gone, detail: '页面已消失 ' + gone + ' · 重复删返回 ' + del2 + '（应 404）' });

  const allOk = steps.every(s => s.ok);
  console.log(JSON.stringify({ round: R, site: SITE, allOk: allOk, newId: newId,
    residue: { before: before, after: after, clean: before === after, repeatDelete: del2 }, steps: steps }, null, 1));
  process.exit(allOk ? 0 : 1);
})().catch(e => { console.error('FAIL', e.message); process.exit(2); });
