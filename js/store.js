/* 知识闯关 — 本地存储模块（Day 9）
 * 用户自己录入的卡片存 localStorage，刷新不丢；复习最佳战绩也存这里。
 * 约定：mock 数据（quest-cards.json）永远只读，用户卡片单独存，互不污染。
 */
const KQStore = {
  CARDS_KEY: 'kq_user_cards',   // 用户自存卡片
  BEST_KEY: 'kq_best_score',    // 闯关最佳战绩

  _read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback; // 隐私模式/存储被禁时静默降级为不保存
    }
  },

  _write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  },

  /** 用户卡片：读全部 */
  getCards() { return this._read(this.CARDS_KEY, []); },

  /** 用户卡片：新增一张（返回是否成功） */
  addCard(card) {
    const cards = this.getCards();
    cards.unshift(card);
    return this._write(this.CARDS_KEY, cards);
  },

  /** 用户卡片：按 id 删除 */
  removeCard(id) {
    return this._write(this.CARDS_KEY, this.getCards().filter(c => c.id !== id));
  },

  /** 战绩：读最佳（{score, total, date}） */
  getBest() { return this._read(this.BEST_KEY, null); },

  /** 战绩：本轮成绩更好就刷新 */
  saveBest(score, total) {
    const best = this.getBest();
    if (!best || score > best.score) {
      this._write(this.BEST_KEY, { score: score, total: total, date: new Date().toISOString().slice(0, 10) });
    }
  }
};
