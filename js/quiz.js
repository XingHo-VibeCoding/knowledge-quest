/* 知识闯关 — 闯关模式
 *  Day 9 雏形：随机抽 5 关 → 看题 → 翻面核对 → 自判答对/没答上。
 *  Day 21 改造：答题阶段不出现答案 —— 先把答案写进输入框、提交，答案区与判定按钮才展开，
 *               并由系统做一次文本比对给出「预判」，自己可改判。
 * 为什么要改：原来「显示答案」按钮就在题面下方，手比脑子快，先翻答案再"觉得自己会"，
 *            等于把复习变成了认读。改成必须自己先产出一遍，才是真回忆。
 * 比对说明：只是预判，不是裁判 —— 同一个意思可以有多种说法，最终以自己改判为准。
 */
const Quiz = {
  TOTAL: 5,        // 每轮关数
  PASS: 0.75,      // 文本相似度达到这个比例，预判为「答对」
  cards: [],       // 本轮题目
  idx: 0,          // 当前第几关（从 0 起）
  score: 0,        // 答对数
  results: [],     // 每关结果（用于通关复盘）
  active: false,
  stage: 'ask',    // ask = 作答中（答案不出现） / judge = 已提交待判定

  els: {},

  init(els) {
    this.els = els;
    const self = this;
    els.answerInput.addEventListener('input', function () { self.syncSubmit(); });
    els.answerInput.addEventListener('keydown', function (ev) { self.onKey(ev); });
    els.submitAnswerBtn.addEventListener('click', function () { self.submit(false); });
    els.giveUpBtn.addEventListener('click', function () { self.submit(true); });
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
    this.stage = 'ask';
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

  /* ＝＝＝ 阶段一：出题（只有正面 + 输入框；答案区、判定按钮一律不出现）＝＝＝ */
  renderQuestion() {
    const e = this.els;
    const card = this.cards[this.idx];
    this.stage = 'ask';
    this.suggested = null;
    this.mine = '';

    e.progress.textContent = '第 ' + (this.idx + 1) + ' / ' + this.cards.length + ' 关';
    e.subject.textContent = card.subject + ' · ' + card.type + ' · Lv.' + card.level;
    e.subject.className = 'badge badge-' + card.subject;
    e.front.textContent = card.front;

    /* 答案区：清空 + 收起（这是今天改动的核心 —— 没提交就看不到答案） */
    e.back.textContent = '';
    e.yours.textContent = '';
    e.verdict.textContent = '';
    e.verdict.className = 'q-verdict';
    e.backWrap.classList.add('hidden');

    /* 作答区：出现，输入框可写、提交按钮按输入内容决定是否可点 */
    e.answerInput.value = '';
    e.answerInput.disabled = false;
    e.answerInputWrap.classList.remove('hidden');
    e.giveUpWrap.classList.remove('hidden');

    /* 判定按钮：收起 */
    e.answerBtns.classList.add('hidden');
    e.correctBtn.classList.remove('suggested');
    e.wrongBtn.classList.remove('suggested');
    this.syncSubmit();

    e.qView.classList.remove('hidden');
    e.resultView.classList.add('hidden');

    const input = e.answerInput;
    setTimeout(function () { try { input.focus(); } catch (err) { /* 忽略：不可聚焦时不阻断出题 */ } }, 0);
  },

  /* 输入为空时提交按钮不可点（避免空提交拿不到有效比对） */
  syncSubmit() {
    const e = this.els;
    const empty = String(e.answerInput.value || '').trim().length === 0;
    e.submitAnswerBtn.disabled = empty || this.stage !== 'ask';
  },

  /* Enter 提交；Shift+Enter 换行；中文输入法选词的回车不拦（isComposing / 229） */
  onKey(ev) {
    if (ev.key !== 'Enter' || ev.shiftKey) return;
    if (ev.isComposing || ev.keyCode === 229) return;
    ev.preventDefault();
    if (!this.els.submitAnswerBtn.disabled) this.submit(false);
  },

  /* ＝＝＝ 阶段二：提交 → 这才展开答案 + 判定按钮 ＝＝＝
   * giveUp = true 表示「想不出来，直接看答案」（走同一条路，只是没有自己的答案可比） */
  submit(giveUp) {
    if (this.stage !== 'ask') return;
    const e = this.els;
    const card = this.cards[this.idx];
    const mine = giveUp ? '' : String(e.answerInput.value || '').trim();
    this.stage = 'judge';
    this.mine = mine;

    /* 正确答案 */
    e.back.textContent = card.back;

    /* 我写的答案（空答案也明说，复盘时能分清"不会"和"写错"） */
    e.yours.innerHTML = '';
    const lab = document.createElement('span');
    lab.className = 'yours-label';
    lab.textContent = mine ? '你写的是：' : '你写的是：（空 · 直接看了答案）';
    e.yours.appendChild(lab);
    if (mine) e.yours.appendChild(document.createTextNode(mine));

    /* 系统预判：只给起点，改判权在用户手里 */
    const sug = this.compare(mine, card.back);
    this.suggested = sug;
    e.verdict.textContent = sug
      ? '系统比对：和你写的基本一致 → 预判「答对」。若其实不是一个意思，点「没答上」改判。'
      : '系统比对：和你写的不一致 → 预判「没答上」。若只是换了说法，点「答对了」改判。';
    e.verdict.className = 'q-verdict ' + (sug ? 'ok' : 'bad');

    /* 展开答案区、收起作答区、给出判定按钮（预判的那个高亮） */
    e.backWrap.classList.remove('hidden');
    e.answerInput.disabled = true;
    e.answerInputWrap.classList.add('hidden');
    e.giveUpWrap.classList.add('hidden');
    e.answerBtns.classList.remove('hidden');
    e.correctBtn.classList.toggle('suggested', sug === true);
    e.wrongBtn.classList.toggle('suggested', sug === false);
    e.submitAnswerBtn.disabled = true;
  },

  /* ＝＝＝ 文本比对（预判用）＝＝＝
   * 归一化（忽略大小写 / 空白 / 中英标点）→ 拆出多个可接受答案 → 取最高相似度。
   * 判对的条件：完全相同，或一方包含另一方（短的至少 4 字符），或相似度 ≥ PASS。 */
  compare(mine, answer) {
    const a = this.norm(mine);
    const b = this.norm(answer);
    if (!a || !b) return false;
    const cands = String(answer || '')
      .split(/[/、;；|]|\s{3,}/)
      .map(function (s) { return Quiz.norm(s); })
      .filter(function (s) { return s.length >= 2; });
    cands.push(b);
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      if (a === c) return true;
      if (c.length >= 4 && (a.indexOf(c) >= 0 || c.indexOf(a) >= 0)) return true;
      if (this.sim(a, c) >= this.PASS) return true;
    }
    return false;
  },

  norm(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[，。、；：！？""''（）【】《》,.;:!?"'()\[\]{}<>=~～\-—_·…「」『』]/g, '');
  },

  /* 最长公共子序列长度 / 较长串长度（词序打乱、多字少字都能容忍） */
  sim(x, y) {
    const n = x.length, m = y.length;
    if (!n || !m) return 0;
    let prev = new Array(m + 1).fill(0);
    let cur = new Array(m + 1).fill(0);
    for (let i = 1; i <= n; i++) {
      cur[0] = 0;
      for (let j = 1; j <= m; j++) {
        cur[j] = x[i - 1] === y[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
      }
      const t = prev; prev = cur; cur = t;
    }
    return prev[m] / Math.max(n, m);
  },

  /* ＝＝＝ 阶段三：判定 → 下一关或通关 ＝＝＝ */
  judge(correct) {
    this.results.push({ card: this.cards[this.idx], correct: correct, mine: this.mine || '' });
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
      /* 答错的题把正确答案带上 —— 复盘才有用，不然只记得"错了" */
      if (!r.correct) {
        const b = document.createElement('span');
        b.className = 'review-back';
        b.textContent = '答案：' + r.card.back;
        li.appendChild(b);
      }
      e.review.appendChild(li);
    });
    e.qView.classList.add('hidden');
    e.resultView.classList.remove('hidden');
  }
};

/* 供自动化测试/截图核对：当前处于哪个阶段、预判结果是什么（只读） */
window.__kq_quizState = function () {
  return {
    stage: Quiz.stage,
    idx: Quiz.idx,
    total: Quiz.cards.length,
    score: Quiz.score,
    answerShown: !Quiz.els.backWrap.classList.contains('hidden'),
    suggested: Quiz.suggested === null ? null : Quiz.suggested,
    mine: Quiz.mine || ''
  };
};
