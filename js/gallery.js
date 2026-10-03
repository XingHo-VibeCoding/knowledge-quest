/* 知识闯关 — 展览模式（2026-10-03）
 *
 * 借鉴"暗色展馆"设计语言：整个页面是一个展台，一次只展出一件卡片（展品），
 * ←/→ 换展品、回车或点击翻面、ESC 退场；列表页（卡片墙）保持不变，两种体验共存。
 *
 * 背景装饰层 = Canvas 程序化生成（红蓝喷溅 + 故障色块 + 白色划痕 + 尘点），
 * 随机种子取自卡片 id：同一张卡每次进来画面完全一致（同卡同画），不依赖任何外部图片。
 *
 * 深色底文字对比度按 #0b0c11 复算（WCAG AA）：
 *   主文字 #f2f3f7 ≈ 17:1 / 次要 #a8aec0 ≈ 8:1 / 品牌亮紫 #9aa4ff ≈ 7:1
 */
const Gallery = {
  els: {},
  list: [],   // 当前展出的卡片（沿用卡片墙的筛选结果）
  idx: 0,

  init() {
    const self = this;
    // 直接按 id 存引用，名字保持和 DOM 一致
    this.els = {
      root: document.getElementById('view-gallery'),
      art: document.getElementById('gArt'),
      close: document.getElementById('gClose'),
      prev: document.getElementById('gPrev'),
      next: document.getElementById('gNext'),
      frame: document.getElementById('gFrame'),
      qEcho: document.getElementById('gQEcho'),
      answer: document.getElementById('gAnswer'),
      title: document.getElementById('gTitle'),
      num: document.getElementById('gNum'),
      desc: document.getElementById('gDesc')
    };
    this.els.frame.addEventListener('click', function () { self.flip(); });
    this.els.frame.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); self.flip(); }
    });
    this.els.prev.addEventListener('click', function () { self.step(-1); });
    this.els.next.addEventListener('click', function () { self.step(1); });
    this.els.close.addEventListener('click', function () { self.exit(); });
    window.addEventListener('resize', function () {
      if (!self.els.root.classList.contains('hidden')) self.drawArt();
    });
  },

  /* 进场：list 沿用卡片墙当前筛选结果，startIdx 来自地址 #/gallery?i=n */
  enter(list, startIdx) {
    this.list = list || [];
    const n = this.list.length;
    this.idx = n ? Math.min(Math.max(startIdx || 0, 0), n - 1) : 0;
    this.refresh();
    const self = this;
    setTimeout(function () { self.els.frame.focus(); }, 0); // 键盘用户进场即可翻页
  },

  refresh() {
    const n = this.list.length;
    const card = n ? this.list[this.idx] : null;
    this.els.title.textContent = card
      ? card.subject + (card.sub ? ' · ' + card.sub : '')
      : '暂无展品';
    this.els.num.textContent = 'No. ' + this.pad(n ? this.idx + 1 : 0) + ' / ' + this.pad(n);
    this.els.desc.textContent = card
      ? card.front
      : '当前条件下没有可展出的卡片，退场回卡片墙换个筛选条件再进来。';
    this.els.qEcho.textContent = card ? 'Q：' + card.front : '';
    this.els.answer.textContent = card ? card.back : '';
    this.els.frame.classList.remove('flipped');
    this.els.frame.setAttribute('aria-label',
      card ? '展品 ' + (this.idx + 1) + '：按回车翻面看答案' : '暂无展品');
    this.drawArt();
    // 展位号写进地址（replace 不进历史）：刷新/分享都停在同一件展品上
    Router.replace('#/gallery?i=' + this.idx);
  },

  flip() {
    const flipped = this.els.frame.classList.toggle('flipped');
    const card = this.list[this.idx];
    if (card) {
      this.els.frame.setAttribute('aria-label',
        '展品 ' + (this.idx + 1) + '：按回车' + (flipped ? '回到谜面' : '翻面看答案'));
    }
  },

  step(dir) {
    const n = this.list.length;
    if (!n) return;
    this.idx = (this.idx + dir + n) % n; // 循环浏览：最后一张的下一个是第一张
    this.refresh();
  },

  exit() { Router.back('#/wall'); },

  /* 键盘统一入口（main.js 在 gallery 激活时调用） */
  handleKey(ev) {
    if (ev.key === 'ArrowRight') { ev.preventDefault(); this.step(1); return; }
    if (ev.key === 'ArrowLeft') { ev.preventDefault(); this.step(-1); return; }
    if (ev.key === 'Escape') { ev.preventDefault(); this.exit(); return; }
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target === this.els.frame) {
      ev.preventDefault(); this.flip();
    }
  },

  pad(n) { return String(n).padStart(3, '0'); },

  /* ＝＝＝ 程序化背景：种子随机 + 五层装饰 ＝＝＝ */
  seed(str) { // FNV-1a → 32 位种子
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  },
  mulberry32(a) { // 轻量确定性 PRNG
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  drawArt() {
    const cv = this.els.art;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth || window.innerWidth;
    const h = cv.clientHeight || window.innerHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const card = this.list[this.idx];
    const rnd = this.mulberry32(this.seed(card ? String(card.id) : 'kq-empty'));
    const RED = [[225, 29, 72], [190, 18, 60], [120, 10, 40]];
    const BLUE = [[37, 99, 235], [29, 78, 216], [30, 41, 120]];

    // 1) 大团软光斑：红蓝各若干，低透明度，打底氛围
    const blobCount = 4 + Math.floor(rnd() * 2);
    for (let i = 0; i < blobCount; i++) {
      const c = (i % 2 === 0 ? RED : BLUE)[Math.floor(rnd() * 3)];
      const x = rnd() * w, y = rnd() * h, r = 140 + rnd() * 220;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (0.10 + rnd() * 0.12) + ')');
      g.addColorStop(1, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // 2) 喷溅点簇：每团几十个小点，离中心越远越小越淡
    const clusters = 3 + Math.floor(rnd() * 2);
    for (let i = 0; i < clusters; i++) {
      const c = (rnd() < 0.5 ? RED : BLUE)[Math.floor(rnd() * 2)];
      const cx = rnd() * w, cy = rnd() * h, reach = 80 + rnd() * 120;
      const dots = 50 + Math.floor(rnd() * 60);
      for (let j = 0; j < dots; j++) {
        const ang = rnd() * Math.PI * 2;
        const d = Math.pow(rnd(), 1.8) * reach; // 靠中心更密
        const x = cx + Math.cos(ang) * d, y = cy + Math.sin(ang) * d;
        ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (0.15 + rnd() * 0.4) + ')';
        ctx.beginPath();
        ctx.arc(x, y, 0.6 + rnd() * (d > reach * 0.6 ? 2 : 5), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 3) 故障色块：横条矩形，红/蓝/白错位
    const rects = 9 + Math.floor(rnd() * 8);
    for (let i = 0; i < rects; i++) {
      const pick = rnd();
      const c = pick < 0.4 ? RED[0] : pick < 0.8 ? BLUE[0] : [240, 240, 245];
      ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (0.08 + rnd() * 0.22) + ')';
      ctx.fillRect(rnd() * w, rnd() * h, 26 + rnd() * 200, 4 + rnd() * 34);
    }

    // 4) 白色划痕：细贝塞尔曲线
    const strokes = 3 + Math.floor(rnd() * 3);
    ctx.lineCap = 'round';
    for (let i = 0; i < strokes; i++) {
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.10 + rnd() * 0.25) + ')';
      ctx.lineWidth = 0.8 + rnd() * 1.4;
      ctx.beginPath();
      ctx.moveTo(rnd() * w, rnd() * h);
      ctx.bezierCurveTo(rnd() * w, rnd() * h, rnd() * w, rnd() * h, rnd() * w, rnd() * h);
      ctx.stroke();
    }

    // 5) 尘点
    const dust = 120;
    for (let i = 0; i < dust; i++) {
      ctx.fillStyle = 'rgba(255,255,255,' + (0.03 + rnd() * 0.14) + ')';
      ctx.beginPath();
      ctx.arc(rnd() * w, rnd() * h, rnd() * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
};
