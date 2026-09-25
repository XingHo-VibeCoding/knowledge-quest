/* 知识闯关 — 页面逻辑（Day 8 主视图：mock 数据 + 四种页面状态） */
let cards = [];            // 全部卡片（数据源：本地 JSON，后续周换 API 只改 load 里的地址）
let currentSubject = '全部'; // F2 当前筛选科目

const els = {
  grid: document.getElementById('grid'),
  loading: document.getElementById('loading'),
  empty: document.getElementById('empty'),
  error: document.getElementById('error'),
  errorMsg: document.getElementById('errorMsg'),
  stats: document.getElementById('stats'),
  filters: document.getElementById('filters'),
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

/* 渲染交给组件（components.js）：main.js 只管状态、筛选与交互 */
function render() {
  const list = currentSubject === '全部' ? cards : cards.filter(c => c.subject === currentSubject);
  KnowledgeCard.renderGrid(els.grid, list);
}

/* F2：科目筛选 chips */
function renderFilters(subjects) {
  const all = ['全部'].concat(subjects);
  els.filters.innerHTML = '';
  all.forEach(subject => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (subject === currentSubject ? ' active' : '');
    btn.textContent = subject;
    btn.addEventListener('click', () => {
      currentSubject = subject;
      els.filters.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      render(); // 筛选只动渲染，不动数据
    });
    els.filters.appendChild(btn);
  });
}

/* 数据加载：mock 阶段来自本地 JSON（TECH_DESIGN 决策），第 3 周换 API 时只改这里 */
function load() {
  showState('loading'); // 状态 1：加载中
  fetch('data/quest-cards.json')
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(data => {
      cards = data.cards;
      if (!cards || cards.length === 0) { showState('empty'); return; } // 状态 2：空
      renderFilters(data.subjects);
      els.stats.textContent = '共 ' + cards.length + ' 张卡片 · ' + data.subjects.join(' / ') + ' · 更新于 ' + data.updated;
      render();
      showState('normal'); // 状态 4：正常
    })
    .catch(e => {
      els.errorMsg.textContent = '卡片加载失败（' + e.message + '）。file:// 直开会拦 fetch，请用本地服务器访问。';
      showState('error'); // 状态 3：错误
      console.error(e);
    });
}

document.getElementById('retryBtn').addEventListener('click', load);

document.getElementById('shuffleBtn').addEventListener('click', () => {
  if (!cards.length) return;
  cards = shuffle(cards);
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

load();
