/* 知识闯关 — 页面逻辑（Day 8 主视图 + Day 9 双视图/录入/本地持久化 + Day 12 组合筛选） */
let cards = [];            // 全部卡片 = mock（quest-cards.json，只读） + 用户自存（localStorage）
let currentSubject = '全部'; // F2 当前筛选科目
let currentKeyword = '';     // Day 12 当前搜索关键词（命中正面或背面）

const els = {
  grid: document.getElementById('grid'),
  loading: document.getElementById('loading'),
  empty: document.getElementById('empty'),
  error: document.getElementById('error'),
  errorMsg: document.getElementById('errorMsg'),
  stats: document.getElementById('stats'),
  filters: document.getElementById('filters'),
  // Day 12 筛选
  searchInput: document.getElementById('searchInput'),
  clearBtn: document.getElementById('clearBtn'),
  filterResult: document.getElementById('filterResult'),
  noResult: document.getElementById('noResult'),
  // 双视图
  viewWall: document.getElementById('view-wall'),
  viewQuiz: document.getElementById('view-quiz'),
  wallBtn: document.getElementById('wallBtn'),
  quizBtn: document.getElementById('quizBtn'),
  // 添加卡片面板
  addBtn: document.getElementById('addBtn'),
  addPanel: document.getElementById('addPanel'),
  fSubject: document.getElementById('fSubject'),
  fSubjectCustom: document.getElementById('fSubjectCustom'),
  fFront: document.getElementById('fFront'),
  fBack: document.getElementById('fBack'),
  formMsg: document.getElementById('formMsg'),
  saveCardBtn: document.getElementById('saveCardBtn'),
};

/* 五态统一调度：loading（骨架屏）/ empty（卡片库为空）/ noResult（筛选无结果）
   / error（失败+重试）/ normal（卡片墙），同一时刻只显示一种 */
function showState(name) {
  els.loading.classList.toggle('hidden', name !== 'loading');
  els.empty.classList.toggle('hidden', name !== 'empty');
  els.noResult.classList.toggle('hidden', name !== 'noResult');
  els.error.classList.toggle('hidden', name !== 'error');
  els.grid.classList.toggle('hidden', name !== 'normal');
}

/* 洗牌（F3 随机复习）：Fisher-Yates */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ＝＝＝ Day 11：操作反馈条（toast）＋ 可撤销删除 ＝＝＝
 * 状态机：操作前 → 处理中（按钮禁用）→ 成功（toast+撤销）／失败（toast 原地不动）
 */
const toast = {
  el: document.getElementById('toast'),
  msg: document.getElementById('toastMsg'),
  undoBtn: document.getElementById('toastUndoBtn'),
  timer: null,
  pending: null, // {card} 待撤销的删除

  show(text, undoCard, seconds) {
    this.msg.textContent = text;
    this.pending = undoCard || null;
    this.undoBtn.classList.toggle('hidden', !undoCard);
    this.el.classList.remove('hidden');
    if (this.timer) clearTimeout(this.timer);
    if (seconds) {
      this.timer = setTimeout(function () { toast.hide(); }, seconds * 1000);
    }
  },
  hide() {
    this.el.classList.add('hidden');
    this.pending = null;
    if (this.timer) clearTimeout(this.timer);
  },
  /* 撤销：写回存储 → 放回内存 → 重渲染 → 反馈「已恢复」 */
  undo() {
    if (!this.pending) return;
    const card = this.pending;
    this.hide();
    if (KQStore.restoreCard(card)) {
      cards.unshift(card);
      renderFilters(currentSubjects());
      render();
      updateStats();
      this.show('已恢复「' + clip(card.front) + '」✓', null, 3);
    } else {
      this.show('恢复失败：本机存储不可用，请刷新后重试', null, 5);
    }
  }
};
document.getElementById('toastUndoBtn').addEventListener('click', function () { toast.undo(); });

function clip(text) { return text.length > 12 ? text.slice(0, 12) + '…' : text; }

let deleting = false; // 处理中防重复提交
function deleteCard(card, btn) {
  if (deleting) return;                       // 状态：处理中 → 忽略重复操作
  if (!confirm('删除这张自存卡？删除后 5 秒内可以撤销。')) return;
  deleting = true;
  btn.disabled = true;                        // 状态：处理中（按钮禁用）
  btn.textContent = '删除中…';
  setTimeout(function () {                    // 与第 3 周 API 删除同构：写入是异步的
    if (!KQStore.removeCard(card.id)) {       // 状态：失败 → 卡片原地不动 + 下一步指引
      btn.disabled = false;
      btn.textContent = '✕';
      deleting = false;
      toast.show('删除失败：本机存储不可用，请刷新页面后重试', null, 5);
      return;
    }
    cards = cards.filter(function (c) { return c.id !== card.id; }); // 状态：成功
    renderFilters(currentSubjects());
    render();
    updateStats();
    deleting = false;
    toast.show('已删除「' + clip(card.front) + '」', card, 5); // 5 秒内可撤销
  }, 300);
}

/* Day 12：筛选 = 科目 AND 关键词（关键词命中正面或背面即可，忽略大小写） */
function visibleCards() {
  const kw = currentKeyword.trim().toLowerCase();
  return cards.filter(function (c) {
    if (currentSubject !== '全部' && c.subject !== currentSubject) return false;
    if (!kw) return true;
    return (String(c.front) + ' ' + String(c.back)).toLowerCase().indexOf(kw) >= 0;
  });
}
function isFiltering() { return currentSubject !== '全部' || currentKeyword.trim() !== ''; }

/* 渲染交给组件：用户自存卡带删除按钮 */
function render() {
  const list = visibleCards();
  KnowledgeCard.renderGrid(els.grid, list, {
    deletable: true,
    onDelete: function (card, btn) {
      deleteCard(card, btn);
    }
  });
  renderFilterStatus(list.length);
}

/* Day 12 筛选三态：有结果（结果条+清除按钮）/ 无结果（noResult 区块）/ 清空（回到完整列表）。
   筛选只影响渲染，不动 cards 数据。 */
function renderFilterStatus(count) {
  const filtering = isFiltering();
  els.clearBtn.classList.toggle('hidden', !filtering);
  els.filterResult.classList.toggle('hidden', !filtering);
  if (filtering) {
    const parts = [];
    if (currentKeyword.trim()) parts.push('关键词「' + currentKeyword.trim() + '」');
    if (currentSubject !== '全部') parts.push('科目「' + currentSubject + '」');
    els.filterResult.textContent = '筛选条件：' + parts.join(' + ') +
      ' → 找到 ' + count + ' 张，共 ' + cards.length + ' 张';
  }
  if (cards.length === 0) { showState('empty'); return; }          // 卡片库本来就没内容
  showState(filtering && count === 0 ? 'noResult' : 'normal');     // 筛选无结果 / 正常
}

/* 科目列表 = mock 固定四类 + 用户自存卡里的自定义科目（去重） */
let baseSubjects = [];
function currentSubjects() {
  const set = {};
  baseSubjects.forEach(function (s) { set[s] = true; });
  cards.forEach(function (c) { if (c.local) set[c.subject] = true; });
  return Object.keys(set);
}

function updateStats() {
  const localCount = cards.filter(function (c) { return c.local; }).length;
  els.stats.textContent = '共 ' + cards.length + ' 张卡片（其中你自己存的 ' + localCount +
    ' 张，保存在本机浏览器）· 科目：' + currentSubjects().join(' / ');
}

/* F2：科目筛选 chips */
function renderFilters(subjects) {
  const all = ['全部'].concat(subjects);
  els.filters.innerHTML = '';
  all.forEach(function (subject) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (subject === currentSubject ? ' active' : '');
    btn.textContent = subject;
    btn.addEventListener('click', function () {
      currentSubject = subject;
      els.filters.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('active'); });
      btn.classList.add('active');
      syncHash();
      render(); // 筛选只动渲染，不动数据
    });
    els.filters.appendChild(btn);
  });
}

/* ＝＝＝ Day 12：清除筛选（第三种情况：清空后恢复完整列表） ＝＝＝ */
function clearFilters() {
  if (!isFiltering()) return;
  currentSubject = '全部';
  currentKeyword = '';
  els.searchInput.value = '';
  syncHash();
  renderFilters(currentSubjects());
  render();
  toast.show('已清除筛选条件，显示全部 ' + cards.length + ' 张卡片', null, 3);
}

/* 筛选条件 ⇄ URL hash：#q=干涉&subject=专业课（可直达、可分享，截图地址栏自带条件） */
function applyHashFilters() {
  const raw = location.hash.replace(/^#/, '');
  if (!raw || raw === 'quiz') return;
  const p = new URLSearchParams(raw);
  const q = (p.get('q') || '').trim();
  const s = (p.get('subject') || '').trim();
  currentKeyword = q;
  els.searchInput.value = q;
  if (s && ['全部'].concat(currentSubjects()).indexOf(s) >= 0) currentSubject = s;
}
function syncHash() {
  const p = new URLSearchParams();
  if (currentKeyword.trim()) p.set('q', currentKeyword.trim());
  if (currentSubject !== '全部') p.set('subject', currentSubject);
  const qs = p.toString();
  history.replaceState(null, '', location.pathname + location.search + (qs ? '#' + qs : ''));
}

/* ＝＝＝ 双视图切换（Day 9）：卡片墙 ⇄ 闯关 ＝＝＝ */
function showView(name) {
  els.viewWall.classList.toggle('hidden', name !== 'wall');
  els.viewQuiz.classList.toggle('hidden', name !== 'quiz');
  els.wallBtn.classList.toggle('active', name === 'wall');
  els.quizBtn.classList.toggle('active', name === 'quiz');
  if (name === 'quiz') Quiz.start(cards); else Quiz.stop();
}

/* ＝＝＝ 添加卡片（Day 9）：存 localStorage，刷新不丢 ＝＝＝ */
function toggleAddPanel(force) {
  const show = force !== undefined ? force : els.addPanel.classList.contains('hidden');
  els.addPanel.classList.toggle('hidden', !show);
  els.addBtn.textContent = show ? '× 收起' : '＋ 添加卡片';
}

function saveCard() {
  let subject = els.fSubject.value;
  if (subject === '__custom') subject = els.fSubjectCustom.value.trim();
  const front = els.fFront.value.trim();
  const back = els.fBack.value.trim();
  if (!subject || !front || !back) {
    els.formMsg.textContent = '科目、正面、背面都要填哦';
    els.formMsg.className = 'form-msg warn';
    return;
  }
  const card = {
    id: 'u' + Date.now(),
    subject: subject, type: '问答', level: 1,
    front: front, back: back, local: true
  };
  if (KQStore.addCard(card)) {
    cards.unshift(card); // 本地立即见效，不用刷新
    els.fFront.value = '';
    els.fBack.value = '';
    els.formMsg.textContent = '已存入卡片库 ✓（保存在本机浏览器，刷新不丢）';
    els.formMsg.className = 'form-msg ok';
    renderFilters(currentSubjects());
    render();
    updateStats();
  } else {
    els.formMsg.textContent = '保存失败：浏览器本地存储不可用';
    els.formMsg.className = 'form-msg warn';
  }
}

/* 数据加载：mock 只读 + 用户自存卡合并；第 3 周换 API 时只改 load 里的 fetch */
function load() {
  showState('loading'); // 状态 1：加载中
  fetch('data/quest-cards.json')
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (data) {
      baseSubjects = data.subjects;
      cards = data.cards.map(function (c) { c.local = false; return c; }).concat(KQStore.getCards());
      if (!cards || cards.length === 0) { showState('empty'); return; } // 状态 2：空
      applyHashFilters(); // Day 12：先读地址栏里的筛选条件，再渲染
      renderFilters(currentSubjects());
      updateStats();
      render();
      showState('normal'); // 状态 4：正常
      if (location.hash === '#quiz') showView('quiz'); // #quiz 直达闯关（数据就绪后再切）
    })
    .catch(function (e) {
      els.errorMsg.textContent = '卡片加载失败（' + e.message + '）。file:// 直开会拦 fetch，请用本地服务器访问。';
      showState('error'); // 状态 3：错误
      console.error(e);
    });
}

/* ＝＝＝ 事件绑定 ＝＝＝ */
document.getElementById('retryBtn').addEventListener('click', load);

els.wallBtn.addEventListener('click', function () { showView('wall'); });
els.quizBtn.addEventListener('click', function () { showView('quiz'); });
els.addBtn.addEventListener('click', function () { toggleAddPanel(); });
els.saveCardBtn.addEventListener('click', saveCard);

/* Day 12：搜索框即时筛选 + 清除筛选（两个入口）+ Esc 清空 */
els.searchInput.addEventListener('input', function () {
  currentKeyword = els.searchInput.value;
  syncHash();
  render();
});
els.searchInput.addEventListener('keydown', function (ev) {
  if (ev.key === 'Escape') { ev.preventDefault(); clearFilters(); }
});
els.clearBtn.addEventListener('click', clearFilters);
document.getElementById('noResultClearBtn').addEventListener('click', clearFilters);

els.fSubject.addEventListener('change', function () {
  els.fSubjectCustom.classList.toggle('hidden', els.fSubject.value !== '__custom');
});
document.getElementById('backWallBtn').addEventListener('click', function () { showView('wall'); });

/* Day 12：外部改动地址栏（粘贴 #q=干涉 分享链接）时重新应用筛选；
   syncHash 走 replaceState 不触发本事件，所以不会和输入框打架；#quiz 仍走视图切换 */
window.addEventListener('hashchange', function () {
  const raw = location.hash.replace(/^#/, '');
  if (raw === 'quiz') { showView('quiz'); return; }
  currentSubject = '全部';
  currentKeyword = '';
  applyHashFilters();
  if (cards.length) { renderFilters(currentSubjects()); render(); }
  showView('wall');
});

/* 闯关模块初始化 */
Quiz.init({
  view: els.viewQuiz,
  progress: document.getElementById('qProgress'),
  subject: document.getElementById('qSubject'),
  front: document.getElementById('qFront'),
  backWrap: document.getElementById('qBackWrap'),
  back: document.getElementById('qBack'),
  showAnswerBtn: document.getElementById('showAnswerBtn'),
  answerBtns: document.getElementById('answerBtns'),
  correctBtn: document.getElementById('correctBtn'),
  wrongBtn: document.getElementById('wrongBtn'),
  againBtn: document.getElementById('againBtn'),
  qView: document.getElementById('qView'),
  resultView: document.getElementById('resultView'),
  score: document.getElementById('qScore'),
  stamps: document.getElementById('qStamps'),
  best: document.getElementById('qBest'),
  review: document.getElementById('qReview'),
});

/* 支持 #quiz 直达闯关视图（方便分享/截图） */
load();
