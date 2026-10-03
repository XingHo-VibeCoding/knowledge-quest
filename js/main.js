/* 知识闯关 — 页面逻辑
 *  Day 8 主视图 + Day 9 双视图/录入/本地持久化 + Day 12 组合筛选 + Day 13 三视图路由与四状态
 */
let cards = [];            // 全部卡片 = mock（quest-cards.json，只读） + 用户自存（localStorage）
let currentSubject = '全部'; // F2 当前筛选科目
let currentSub = '';         // 两级分类：当前子分类（'' = 不分子类）
let currentKeyword = '';     // Day 12 当前搜索关键词（命中正面或背面）
let currentRoute = 'wall';   // Day 13 当前视图名：wall / quiz / card
let demoState = '';          // Day 13 状态演示：loading / empty / error（只有地址栏给了 demo 参数才有值）

/* 两级分类（2026-10-03）：categories = { '科目': ['子类', …], … }
   默认值只给 mock 自带四类，用户改过的配置存 localStorage（KQStore.CATEGORIES_KEY）。
   自定义科目默认不分子类，加子类后在配置里生长。 */
const DEFAULT_SUBS = {
  '口语': ['日常表达', '职场表达'],
  '教务': ['接待与运营', '排课', '数据与活动'],
  '专业课': ['编程', '光电'],
  '销售': ['咨询与讲解', '邀约与谈判', '转介绍与内容']
};
let categories = {}; // load() 时按 mock subjects + 自存卡科目初始化

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
  // 两级分类
  subFilters: document.getElementById('subFilters'),
  catPanel: document.getElementById('catPanel'),
  catList: document.getElementById('catList'),
  catMsg: document.getElementById('catMsg'),
  catCloseBtn: document.getElementById('catCloseBtn'),
  fSub: document.getElementById('fSub'),
  fSubCustom: document.getElementById('fSubCustom'),
  // 三视图（Day 13：卡片墙 / 闯关 / 卡片详情）＋ 展览模式（2026-10-03）
  viewWall: document.getElementById('view-wall'),
  viewQuiz: document.getElementById('view-quiz'),
  viewDetail: document.getElementById('view-detail'),
  viewGallery: document.getElementById('view-gallery'),
  tabWall: document.getElementById('tabWall'),
  tabQuiz: document.getElementById('tabQuiz'),
  tabGallery: document.getElementById('tabGallery'),
  // 卡片详情（Day 13）
  detailBody: document.getElementById('detailBody'),
  detailMissing: document.getElementById('detailMissing'),
  relatedWrap: document.getElementById('relatedWrap'),
  relatedGrid: document.getElementById('relatedGrid'),
  dSubject: document.getElementById('dSubject'),
  dMeta: document.getElementById('dMeta'),
  dFront: document.getElementById('dFront'),
  dBack: document.getElementById('dBack'),
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

/* Day 12：筛选 = （科目 + 子分类） AND 关键词（关键词命中正面或背面即可，忽略大小写）
   子分类规则：'' = 不分子类全部通过；'未分类' 只匹配没有 sub 的卡；其余按卡上的 sub 精确匹配 */
function visibleCards() {
  const kw = currentKeyword.trim().toLowerCase();
  return cards.filter(function (c) {
    if (currentSubject !== '全部' && c.subject !== currentSubject) return false;
    if (currentSubject !== '全部' && currentSub) {
      if (currentSub === '未分类' && c.sub) return false;
      if (currentSub !== '未分类' && c.sub !== currentSub) return false;
    }
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
    },
    onOpen: openDetail   // Day 13：卡片上有「详情 ›」入口，进第二级页面
  });
  renderFilterStatus(list.length);
}

/* Day 12 筛选三态：有结果（结果条+清除按钮）/ 无结果（noResult 区块）/ 清空（回到完整列表）。
   筛选只影响渲染，不动 cards 数据。 */
function renderFilterStatus(count) {
  // Day 13：地址栏求了状态演示时，演示态优先——后续任何重渲染都不许把它冲掉
  if (demoState) { showState(demoState); return; }
  const filtering = isFiltering();
  els.clearBtn.classList.toggle('hidden', !filtering);
  els.filterResult.classList.toggle('hidden', !filtering);
  if (filtering) {
    const parts = [];
    if (currentKeyword.trim()) parts.push('关键词「' + currentKeyword.trim() + '」');
    if (currentSubject !== '全部') {
      let label = '科目「' + currentSubject + '」';
      if (currentSub) label += ' → 子分类「' + currentSub + '」';
      parts.push(label);
    }
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

/* ＝＝＝ 两级分类（2026-10-03）＝＝＝
   初始化：mock 科目用默认子类（用户配置过就用用户的），自定义科目给空数组。
   配置只在用户显式增删时写回 localStorage——刷新页面永远不会丢用户的分类。 */
function initCategories() {
  const stored = KQStore.getCategories();
  categories = {};
  currentSubjects().forEach(function (s) {
    if (stored && Object.prototype.hasOwnProperty.call(stored, s)) categories[s] = stored[s].slice();
    else categories[s] = (DEFAULT_SUBS[s] || []).slice();
  });
}
function subsOf(subject) { return categories[subject] || []; }

/* 当前科目下真实存在的子类集合 = 配置里的 + 卡片实际带着的（自定义卡自填的子类也能筛） */
function effectiveSubs(subject) {
  const set = {};
  subsOf(subject).forEach(function (s) { set[s] = true; });
  cards.forEach(function (c) { if (c.subject === subject && c.sub) set[c.sub] = true; });
  return Object.keys(set);
}

/* F2：科目筛选 chips（行尾挂「管理分类」入口） */
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
      currentSub = ''; // 换科目时子分类归零，避免"口语 → 编程"这种跨科目的死条件
      els.filters.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('active'); });
      btn.classList.add('active');
      syncHash();
      renderSubFilters();
      render(); // 筛选只动渲染，不动数据
    });
    els.filters.appendChild(btn);
  });
  const mgmt = document.createElement('button');
  mgmt.type = 'button';
  mgmt.className = 'chip chip-manage';
  mgmt.textContent = '⚙ 管理分类';
  mgmt.addEventListener('click', function () { toggleCatPanel(true); });
  els.filters.appendChild(mgmt);
  renderSubFilters();
}

/* 子分类行：只在选中具体科目时出现；'全部' + 配置子类 + '未分类'（有无子类卡时） + 添加入口 */
function renderSubFilters() {
  const show = currentSubject !== '全部';
  els.subFilters.classList.toggle('hidden', !show);
  if (!show) return;
  els.subFilters.innerHTML = '';
  const subs = effectiveSubs(currentSubject);
  const hasUncategorized = cards.some(function (c) {
    return c.subject === currentSubject && !c.sub;
  });
  ['全部'].concat(subs, hasUncategorized ? ['未分类'] : []).forEach(function (sub) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip chip-sub' + (sub === currentSub ? ' active' : '');
    const n = cards.filter(function (c) {
      if (c.subject !== currentSubject) return false;
      return sub === '未分类' ? !c.sub : (sub === '全部' || c.sub === sub);
    }).length;
    btn.textContent = sub + ' ' + n;
    btn.addEventListener('click', function () {
      currentSub = (sub === '全部') ? '' : sub;
      els.subFilters.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('active'); });
      btn.classList.add('active');
      syncHash();
      render();
    });
    els.subFilters.appendChild(btn);
  });
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'chip chip-add';
  addBtn.textContent = '＋ 子分类';
  addBtn.addEventListener('click', function () { addSubPrompt(currentSubject); });
  els.subFilters.appendChild(addBtn);
}

/* 添加子分类：用行内小面板（不用 prompt，历史上它会被部分浏览器禁掉） */
function addSubPrompt(subject) {
  toggleCatPanel(true, subject);
}

/* ＝＝＝ 管理分类面板：列出大类 → 子类标签（可删空的）＋ 行内添加 ＝＝＝ */
let catAddTarget = ''; // 点「＋ 子分类」进来时，直接聚焦对应大类的输入框
function toggleCatPanel(force, focusSubject) {
  const show = force !== undefined ? force : els.catPanel.classList.contains('hidden');
  els.catPanel.classList.toggle('hidden', !show);
  catAddTarget = focusSubject || '';
  els.catMsg.textContent = '';
  if (show) renderCatList();
}
function renderCatList() {
  els.catList.innerHTML = '';
  currentSubjects().forEach(function (subject) {
    const row = document.createElement('div');
    row.className = 'cat-row';
    const name = document.createElement('span');
    name.className = 'cat-name';
    name.textContent = subject;
    row.appendChild(name);

    const tags = document.createElement('span');
    tags.className = 'cat-tags';
    const subs = effectiveSubs(subject);
    if (subs.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'cat-empty';
      empty.textContent = '暂无子分类';
      tags.appendChild(empty);
    }
    subs.forEach(function (sub) {
      const tag = document.createElement('span');
      tag.className = 'cat-tag';
      tag.textContent = sub;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'cat-del-btn';
      del.setAttribute('aria-label', '删除子分类 ' + subject + ' / ' + sub);
      del.textContent = '✕';
      del.addEventListener('click', function () { removeSub(subject, sub, del); });
      tag.appendChild(del);
      tags.appendChild(tag);
    });
    row.appendChild(tags);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'cat-add-input';
    input.setAttribute('aria-label', '给 ' + subject + ' 添加子分类');
    input.placeholder = '新子分类名';
    input.maxLength = 8;
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'cat-add-btn';
    add.textContent = '添加';
    function doAdd() {
      if (addSub(subject, input.value.trim())) { renderCatList(); renderSubFilters(); }
    }
    add.addEventListener('click', doAdd);
    input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); doAdd(); } });
    row.appendChild(input);
    row.appendChild(add);
    if (subject === catAddTarget) setTimeout(function () { input.focus(); }, 0);
    els.catList.appendChild(row);
  });
}
function catFail(msg) { els.catMsg.textContent = msg; els.catMsg.className = 'form-msg warn'; }
function catOk(msg) { els.catMsg.textContent = msg; els.catMsg.className = 'form-msg ok'; }

function addSub(subject, name) {
  if (!name) { catFail('子分类名不能为空'); return false; }
  if (effectiveSubs(subject).indexOf(name) >= 0) { catFail('「' + name + '」已经存在'); return false; }
  if (!categories[subject]) categories[subject] = [];
  categories[subject].push(name);
  if (!KQStore.saveCategories(categories)) {
    categories[subject].pop();
    catFail('保存失败：本机存储不可用');
    return false;
  }
  catOk('已在「' + subject + '」下添加子分类「' + name + '」');
  return true;
}
function removeSub(subject, sub, btn) {
  const used = cards.filter(function (c) { return c.subject === subject && c.sub === sub; }).length;
  if (used > 0) {
    catFail('「' + sub + '」下面还有 ' + used + ' 张卡片，先删卡或改卡的子分类，再删它');
    return;
  }
  categories[subject] = categories[subject].filter(function (s) { return s !== sub; });
  if (!KQStore.saveCategories(categories)) {
    categories[subject].push(sub);
    catFail('保存失败：本机存储不可用');
    return;
  }
  if (currentSub === sub) currentSub = '';
  catOk('已删除子分类「' + sub + '」');
  renderCatList();
  renderSubFilters();
  render();
}

function updateStats() {
  const localCount = cards.filter(function (c) { return c.local; }).length;
  els.stats.textContent = '共 ' + cards.length + ' 张卡片（其中你自己存的 ' + localCount +
    ' 张，保存在本机浏览器）· 科目：' + currentSubjects().join(' / ');
}

/* Day 12：清除筛选（第三种情况：清空后恢复完整列表） */
function clearFilters() {
  if (!isFiltering()) return;
  currentSubject = '全部';
  currentSub = '';
  currentKeyword = '';
  els.searchInput.value = '';
  syncHash();
  renderFilters(currentSubjects());
  render();
  toast.show('已清除筛选条件，显示全部 ' + cards.length + ' 张卡片', null, 3);
}

/* 筛选条件 ⇄ 地址栏：#/wall?q=干涉&subject=专业课（可直达、可分享，截图地址栏自带条件）
   Day 13：筛选参数挂在路由上，用 replace 更新——改搜索词不该把浏览器历史塞满 */
function syncHash() {
  const p = new URLSearchParams();
  if (currentKeyword.trim()) p.set('q', currentKeyword.trim());
  if (currentSubject !== '全部') p.set('subject', currentSubject);
  if (currentSubject !== '全部' && currentSub) p.set('sub', currentSub);
  if (demoState) p.set('demo', demoState);
  Router.replace(Router.build('wall', [], p));
}

/* ＝＝＝ 视图切换（Day 9 双视图 → Day 13 三视图 + 地址路由） ＝＝＝
   切换的唯一出口是 applyRoute：地址认视图，视图不认识按钮。
   所以"用地址直达"和"点导航点击"走的是同一条路，不会出现两套状态。 */
function showView(name) {
  currentRoute = name;
  els.viewWall.classList.toggle('hidden', name !== 'wall');
  els.viewQuiz.classList.toggle('hidden', name !== 'quiz');
  els.viewDetail.classList.toggle('hidden', name !== 'card');
  els.viewGallery.classList.toggle('hidden', name !== 'gallery');
  // 当前页不仅靠颜色高亮：aria-current="page" 让读屏也知道自己在哪一页
  els.tabWall.classList.toggle('active', name === 'wall');
  els.tabQuiz.classList.toggle('active', name === 'quiz');
  els.tabGallery.classList.toggle('active', name === 'gallery');
  els.tabWall.setAttribute('aria-current', name === 'wall' ? 'page' : 'false');
  els.tabQuiz.setAttribute('aria-current', name === 'quiz' ? 'page' : 'false');
  els.tabGallery.setAttribute('aria-current', name === 'gallery' ? 'page' : 'false');
  const titles = { wall: '卡片墙', quiz: '闯关', card: '卡片详情', gallery: '展览模式' };
  document.title = titles[name] + ' · 知识闯关';
  if (name === 'quiz') Quiz.start(cards); else Quiz.stop();
}

/* ＝＝＝ Day 13：卡片详情视图（多级页面的第二级） ＝＝＝ */
function openDetail(card) { Router.go(Router.build('card', [card.id])); }

function renderDetail(id) {
  const card = cards.filter(function (c) { return String(c.id) === String(id); })[0];
  const found = !!card;
  // 详情也有自己的边界：编号对不上时给「找不到」而不是白屏
  els.detailBody.classList.toggle('hidden', !found);
  els.detailMissing.classList.toggle('hidden', found);
  els.relatedWrap.classList.toggle('hidden', !found);
  if (!found) return;
  els.dSubject.textContent = card.subject;
  els.dSubject.className = 'badge badge-' + card.subject;
  els.dMeta.textContent = (card.local ? '自存卡 · ' : '内置卡 · ') + card.type + ' · Lv.' + card.level;
  els.dFront.textContent = card.front;
  els.dBack.textContent = card.back;
  // 同科目卡片：从详情还有地方可去，别让用户走进死胡同（点进去还是详情，链路自洽）
  const related = cards.filter(function (c) {
    return c.subject === card.subject && String(c.id) !== String(card.id);
  }).slice(0, 6);
  if (related.length === 0) {
    els.relatedGrid.innerHTML = '<p class="related-empty">这个科目暂时没有别的卡片。</p>';
  } else {
    KnowledgeCard.renderGrid(els.relatedGrid, related, { onOpen: openDetail });
  }
}

/* ＝＝＝ Day 13：路由分发（地址 → 视图），三个视图各一条分支 ＝＝＝
   #/wall（可带 ?q= &subject= &demo=） / #/quiz / #/card/<id> */
function applyRoute(route) {
  const r = route || Router.parse();
  demoState = r.query.get('demo') || '';
  // 演示态要能自证是演示：错误态文案说明这是模拟，别让人以为真坏了
  if (demoState === 'error') {
    els.errorMsg.textContent = '卡片加载失败（演示：模拟接口异常）。点重试会重新请求一次。';
  }
  if (r.name === 'card') {
    showView('card');
    renderDetail(r.params[0] || '');
    return;
  }
  if (r.name === 'quiz') { showView('quiz'); return; }
  // 展览模式（2026-10-03）：沿用当前筛选结果做展品清单，?i=n 直达第 n 件展品。
  // 注意这里不动 currentSubject/currentKeyword——从筛选后的卡片墙进场，展馆里展的就是筛出来的那批。
  if (r.name === 'gallery') {
    showView('gallery');
    const gi = parseInt(r.query.get('i') || '0', 10);
    Gallery.enter(visibleCards(), isNaN(gi) ? 0 : gi);
    return;
  }
  // 卡片墙（含筛选参数；切回来时先清空旧条件，避免上一个关键词阴魂不散）
  showView('wall');
  currentSubject = '全部';
  currentSub = '';
  currentKeyword = (r.query.get('q') || '').trim();
  els.searchInput.value = currentKeyword;
  const s = (r.query.get('subject') || '').trim();
  if (s && ['全部'].concat(currentSubjects()).indexOf(s) >= 0) {
    currentSubject = s;
    const sub = (r.query.get('sub') || '').trim();
    // 子分类参数只在科目有效时生效；配置没了或写错了就静默回到"全部子类"，页面不能白屏
    if (sub && (effectiveSubs(s).indexOf(sub) >= 0 || sub === '未分类')) currentSub = sub;
  }
  if (cards.length) { renderFilters(currentSubjects()); render(); }
  else if (demoState) showState(demoState);
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
  let sub = els.fSub.value;
  if (sub === '__custom') sub = els.fSubCustom.value.trim();
  const front = els.fFront.value.trim();
  const back = els.fBack.value.trim();
  if (!subject || !front || !back) {
    els.formMsg.textContent = '科目、正面、背面都要填哦';
    els.formMsg.className = 'form-msg warn';
    return;
  }
  // 新科目/新子分类顺手登记进分类配置，筛选和管理面板里立刻能看到
  if (!categories[subject]) categories[subject] = [];
  if (sub && categories[subject].indexOf(sub) < 0) categories[subject].push(sub);
  KQStore.saveCategories(categories);
  const card = {
    id: 'u' + Date.now(),
    subject: subject, sub: sub || '', type: '问答', level: 1,
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
      if (!cards || cards.length === 0) { showState('empty'); return; } // 状态 2：空（卡片库本来就没内容）
      initCategories(); // 两级分类：按科目初始化配置（用户配置过就用用户的）
      renderFilters(currentSubjects());
      updateStats();
      applyRoute(); // Day 13：数据就绪后按地址栏决定显示哪个视图、哪种状态
    })
    .catch(function (e) {
      els.errorMsg.textContent = '卡片加载失败（' + e.message + '）。file:// 直开会拦 fetch，请用本地服务器访问。';
      showState('error'); // 状态 3：错误
      console.error(e);
    });
}

/* ＝＝＝ 事件绑定 ＝＝＝ */
renderSubOptions(els.fSubject.value); // 表单子分类下拉框的初始选项
document.getElementById('retryBtn').addEventListener('click', load);

/* Day 13：导航用 <a href="#/..."> 原生链接，点它浏览器自己改地址，
   所以这里不需要再绑点击事件——绑了反而会和 hashchange 打架，出现两套状态。 */
document.getElementById('dBackBtn').addEventListener('click', function () { Router.back('#/wall'); });
document.getElementById('dQuizBtn').addEventListener('click', function () { Router.go(Router.build('quiz')); });
document.getElementById('detailBackBtn').addEventListener('click', function () { Router.go(Router.build('wall')); });
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
  const isCustom = els.fSubject.value === '__custom';
  els.fSubjectCustom.classList.toggle('hidden', !isCustom);
  renderSubOptions(isCustom ? els.fSubjectCustom.value.trim() : els.fSubject.value);
});
/* 科目 → 子分类联动：'不分子类' + 该科目配置的子类 + 自定义… */
function renderSubOptions(subject) {
  els.fSub.innerHTML = '';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = '不分子类';
  els.fSub.appendChild(none);
  subsOf(subject).forEach(function (s) {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    els.fSub.appendChild(opt);
  });
  const custom = document.createElement('option');
  custom.value = '__custom';
  custom.textContent = '自定义…';
  els.fSub.appendChild(custom);
  els.fSubCustom.classList.add('hidden');
}
els.fSub.addEventListener('change', function () {
  els.fSubCustom.classList.toggle('hidden', els.fSub.value !== '__custom');
  if (els.fSub.value === '__custom') els.fSubCustom.focus();
});
document.getElementById('catCloseBtn').addEventListener('click', function () {
  toggleCatPanel(false);
  renderFilters(currentSubjects()); // 面板里加过子类，出来后筛选行同步刷新
  render();
});
document.getElementById('backWallBtn').addEventListener('click', function () { Router.go(Router.build('wall')); });

/* Day 13：地址栏一变就交给路由分发——浏览器前进/后退、粘贴链接、点导航，全是这一条路。
   数据还没到时不处理，load() 完成后会自己 applyRoute 一次。 */
Router.onChange(function (route) {
  if (!cards.length) return;
  applyRoute(route);
});

/* 闯关模块初始化 */
Gallery.init();

/* 展览模式键盘：←/→ 换展品、回车翻面、ESC 退场（只在 gallery 激活时接管按键） */
document.addEventListener('keydown', function (ev) {
  if (currentRoute !== 'gallery') return;
  Gallery.handleKey(ev);
});

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

/* 测试钩子（只读）：CDP 自动化断言当前筛选状态用，不参与页面逻辑 */
window.__kq_currentSubject = function () { return currentSubject; };
window.__kq_currentSub = function () { return currentSub; };
