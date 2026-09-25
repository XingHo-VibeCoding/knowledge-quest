/* 知识闯关 — 可复用知识卡片组件（Day 8 主视图 + 组件化）
 * KnowledgeCard.create(card, opts) -> 单张知识卡片 DOM（点击翻面）
 * KnowledgeCard.renderGrid(el, cards, opts) -> 整批渲染进网格容器
 * 约定：组件不知道数据从哪来（mock / 真实 API 都能用），只负责"一张卡片 -> 一个 DOM"。
 */
const KnowledgeCard = {
  /**
   * @param {Object}  card    { id, subject, type, level, front, back }
   * @param {Object}  [opts]
   * @param {Function}[opts.onFlip] (card, isFlipped) 翻面回调
   */
  create(card, opts = {}) {
    const el = document.createElement('article');
    el.className = 'card';
    el.dataset.subject = card.subject;
    el.innerHTML =
      '<div class="card-top">' +
        '<span class="badge badge-' + card.subject + '">' + card.subject + '</span>' +
        '<span class="meta">' + card.type + ' · Lv.' + card.level + '</span>' +
      '</div>' +
      '<div class="face front"><p></p><span class="hint">点卡片看答案</span></div>' +
      '<div class="face back"><p></p></div>';
    el.querySelector('.front p').textContent = card.front;  // textContent 防注入
    el.querySelector('.back p').textContent = card.back;
    el.addEventListener('click', () => {
      const flipped = el.classList.toggle('flipped');
      if (opts.onFlip) opts.onFlip(card, flipped);
    });
    return el;
  },

  /** 整批渲染：先清空容器，再逐张生成 */
  renderGrid(container, cards, opts = {}) {
    container.innerHTML = '';
    const els = cards.map(card => this.create(card, opts));
    els.forEach(el => container.appendChild(el));
    return els;
  }
};
