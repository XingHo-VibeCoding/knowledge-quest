/* 知识闯关 — 闯关模式（Day 9 雏形）
 * 流程：随机抽 5 关 → 看题自答 → 翻面核对 → 自判答对/没答上 → 通关统计 + 最佳战绩。
 * 纯前端自判版：第 3 周接 API 后可升级为客观判定（选择题/输入比对）。
 */
const Quiz = {
  TOTAL: 5,        // 每轮关数
  cards: [],       // 本轮题目
  idx: 0,          // 当前第几关（从 0 起）
  score: 0,        // 答对数
  results: [],     // 每关结果（用于通关复盘）
  active: false,

  els: {},

  init(els) {
    this.els = els;
    const self = this;
    els.showAnswerBtn.addEventListener('click', function () { self.reveal(); });
    els.correctBtn.addEventListener('click', function () { self.judge(true); });
    els.wrongBtn.addEventListener('click', function () { self.judge(false); });
    els.againBtn.addEventListener('click', function () { self.start(self.pool); });
  },

  /** 开新一轮：pool 为当前可用卡片（含用户自存卡） */
  start(pool) {
    if (!pool || pool.length === 0) return;
    this.pool = pool;
    this.cards = this.shuffle(pool).slice(0, this.TOTAL);
    this.idx = 0;
    this.score = 0;
    this.results = [];
    this.active = true;
    this.els.view.classList.remove('hidden');
    this.renderQuestion();
  },

  stop() {
    this.active = false;
    this.els.view.classList.add('hidden');
  },

  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  /* 阶段一：出题（只显示正面，先自己作答） */
  renderQuestion() {
    const e = this.els;
    const card = this.cards[this.idx];
    e.progress.textContent = '第 ' + (this.idx + 1) + ' / ' + this.cards.length + ' 关';
    e.subject.textContent = card.subject + ' · ' + card.type + ' · Lv.' + card.level;
    e.subject.className = 'badge badge-' + card.subject;
    e.front.textContent = card.front;
    e.backWrap.classList.add('hidden');
    e.answerBtns.classList.add('hidden');
    e.showAnswerBtn.classList.remove('hidden');
    e.qView.classList.remove('hidden');
    e.resultView.classList.add('hidden');
  },

  /* 阶段二：翻面核对（出答案 + 自判按钮） */
  reveal() {
    const e = this.els;
    e.back.textContent = this.cards[this.idx].back;
    e.backWrap.classList.remove('hidden');
    e.showAnswerBtn.classList.add('hidden');
    e.answerBtns.classList.remove('hidden');
  },

  /* 阶段三：自判 → 下一关或通关 */
  judge(correct) {
    this.results.push({ card: this.cards[this.idx], correct: correct });
    if (correct) this.score++;
    this.idx++;
    if (this.idx < this.cards.length) {
      this.renderQuestion();
    } else {
      this.finish();
    }
  },

  /* 通关：成绩单 + 最佳战绩 */
  finish() {
    const e = this.els;
    this.active = false;
    KQStore.saveBest(this.score, this.cards.length);
    const best = KQStore.getBest();
    e.score.textContent = this.score + ' / ' + this.cards.length;
    e.score.className = 'score' + (this.score === this.cards.length ? ' perfect' : '');
    e.stamps.textContent = '🏆'.repeat(this.score) + '▫'.repeat(this.cards.length - this.score);
    e.best.textContent = best ? '本机最佳战绩：' + best.score + ' / ' + best.total + '（' + best.date + '）' : '';
    e.review.innerHTML = '';
    this.results.forEach(function (r) {
      const li = document.createElement('li');
      li.className = 'review-item' + (r.correct ? ' ok' : ' bad');
      const t = document.createElement('span');
      t.textContent = (r.correct ? '✓ ' : '✗ ') + r.card.front;
      li.appendChild(t);
      e.review.appendChild(li);
    });
    e.qView.classList.add('hidden');
    e.resultView.classList.remove('hidden');
  }
};
