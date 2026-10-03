/* 知识闯关 — 可复用知识卡片组件（Day 8 建，Day 9 扩展自存卡删除，Day 13 加详情入口）
 * KnowledgeCard.create(card, opts) -> 单张知识卡片 DOM（点击翻面）
 * KnowledgeCard.renderGrid(el, cards, opts) -> 整批渲染进网格容器
 * 约定：组件不知道数据从哪来（mock / localStorage / 真实 API 都能用），只负责"一张卡片 -> 一个 DOM"。
 */
const KnowledgeCard = {
  /**
   * @param {Object}  card    { id, subject, type, level, front, back, local? }
   * @param {Object}  [opts]
   * @param {Function}[opts.onFlip]   (card, isFlipped) 翻面回调
   * @param {Boolean} [opts.deletable] 显示删除按钮（仅用户自存卡传 true）
   * @param {Function}[opts.onDelete] (card, btn) 删除回调
   * @param {Function}[opts.onOpen]   (card) 打开详情回调（Day 13）
   */
  create(card, opts = {}) {
    const el = document.createElement('article');
    el.className = 'card';
    el.dataset.subject = card.subject;
    el.dataset.cardId = card.id;
    // Day 13：卡片是"点得动的东西"，就必须键盘也能用（Tab 能到、回车能翻、读屏能读）
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', '卡片：' + card.front + '（回车翻面看答案）');
    el.innerHTML =
      '<div class="card-top">' +
        '<span class="badge badge-' + card.subject + '">' + card.subject + '</span>' +
        '<span class="meta">' + (card.local ? '<span class="local-tag">自存</span>' : '') + (card.sub ? card.sub + ' · ' : '') + card.type + ' · Lv.' + card.level + '</span>' +
      '</div>' +
      '<div class="face front"><p></p><span class="hint">点卡片看答案</span></div>' +
      '<div class="face back"><p></p></div>';
    el.querySelector('.front p').textContent = card.front;  // textContent 防注入
    el.querySelector('.back p').textContent = card.back;
    if (opts.deletable && card.local) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'card-del';
      del.title = '删除这张自存卡';
      del.textContent = '✕';
      del.addEventListener('click', function (ev) {
        ev.stopPropagation(); // 别触发翻面
        if (opts.onDelete) opts.onDelete(card, del); // Day 11：多传按钮引用，供禁用/改文案
      });
      el.appendChild(del);
    }
    /* Day 13：详情入口。用真按钮而不是假链接——键盘、读屏都能到；
       点它只跳详情、不翻面（stopPropagation 挡掉卡片自身的翻面）。 */
    if (opts.onOpen) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'card-more';
      more.textContent = '详情 ›';
      more.setAttribute('aria-label', '查看「' + card.front + '」的详情');
      more.addEventListener('click', function (ev) {
        ev.stopPropagation();
        opts.onOpen(card);
      });
      el.appendChild(more);
    }
    function flip() {
      const flipped = el.classList.toggle('flipped');
      el.setAttribute('aria-label', '卡片：' + card.front + '（回车' + (flipped ? '看问题' : '看答案') + '）');
      if (opts.onFlip) opts.onFlip(card, flipped);
    }
    el.addEventListener('click', flip);
    el.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); flip(); }
    });
    return el;
  },

  /** 整批渲染：先清空容器，再逐张生成 */
  renderGrid(container, cards, opts = {}) {
    container.innerHTML = '';
    const els = cards.map(function (card) { return KnowledgeCard.create(card, opts); });
    els.forEach(function (el) { container.appendChild(el); });
    return els;
  }
};
