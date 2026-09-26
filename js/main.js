/* 知识闯关 — 页面逻辑（Day 8 主视图 + Day 9 双视图/录入/本地持久化） */
let cards = [];            // 全部卡片 = mock（quest-cards.json，只读） + 用户自存（localStorage）
let currentSubject = '全部'; // F2 当前筛选科目

const els = {
  grid: document.getElementById('grid'),
  loading: document.getElementById('loading'),
  empty: document.getElementById('empty'),
  error: document.getElementById('error'),
  errorMsg: document.getElementById('errorMsg'),
  stats: document.getElementById('stats'),
  filters: document.getElementById('filters'),
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

/* 四态统一调度：loading（骨架屏）/ empty（卡片库为空）/ error（失败+重试）/ normal（卡片墙） */
function showState(name) {
  els.loading.classList.toggle('hidden', name !== 'loading');
  els.empty.classList.toggle('hidden', name !== 'empty');
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

/* 渲染交给组件：用户自存卡带删除按钮 */
function render() {
  const list = currentSubject === '全部' ? cards : cards.filter(function (c) { return c.subject === currentSubject; });
  KnowledgeCard.renderGrid(els.grid, list, {
    deletable: true,
    onDelete: function (card) {
      if (!confirm('删除这张自存卡？')) return;
      KQStore.removeCard(card.id);
      cards = cards.filter(function (c) { return c.id !== card.id; });
      renderFilters(currentSubjects());
      render();
      updateStats();
    }
  });
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
      render(); // 筛选只动渲染，不动数据
    });
    els.filters.appendChild(btn);
  });
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
els.fSubject.addEventListener('change', function () {
  els.fSubjectCustom.classList.toggle('hidden', els.fSubject.value !== '__custom');
});
document.getElementById('backWallBtn').addEventListener('click', function () { showView('wall'); });

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
