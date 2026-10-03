/* 知识闯关 — 展览模式（2026-10-03）
 *
 * 借鉴"暗色展馆"设计语言：整个页面是一个展台，一次只展出一件卡片（展品），
 * ←/→ 换展品、回车或点击翻面、ESC 退场；列表页（卡片墙）保持不变，两种体验共存。
 *
 * 背景装饰层 = Canvas 程序化生成（红蓝喷溅 + 故障色块 + 白色划痕 + 尘点），
 * 随机种子取自卡片 id：同一张卡每次进来画面完全一致（同卡同画），不依赖任何外部图片。
 *
 * 2026-10-03 二次改造（用户反馈"太规整、太死板"）——四条"去模板化"规则：
 *   1. 每件展品有自己的姿态：倾角 ±3.6°、横向 ±34px、纵向 ±22px、缩放 0.95~1.03
 *   2. 后方叠着两张邻卡 + 随机胶带/印章/裁切标记，"手工布置"而不是"居中摆放"
 *   3. 鼠标移动有视差：背景层跟手平移、展品轻微 3D 倾斜（尊重 prefers-reduced-motion）
 *   4. 换展品时文案错峰入场（标题 → 编号 → 谜面），箭头左右不等高、略微旋转，打破对称
 *   姿态同样由卡片 id 做种子：同一张卡的摆放永远一致，不会每次刷新都乱跳。
 *
 * 文字对比度按「最暗纸底 #f2ece2 / 卡面最暗档 #faf6ef」复算（WCAG AA）：
 *   主文字 #2c2a35 ≈ 12:1 / 次要 #5d5a6b ≈ 5.7:1 / 小字最低档 #666276 ≈ 5.0:1
 *
 * 2026-10-03 三次改造（用户反馈"不喜欢那个颜色，想要明亮轻松一点"）：
 *   整馆由「暗色展馆」换成「暖白纸底 + 糖果色」——版式一行没动（姿态/叠卡/视差/错峰入场全部保留），
 *   只把调色板换掉：暗底 #0b0c11 → 暖白纸底 #fdfbf6~#f2ece2；红蓝喷溅 → 糖果色软斑 + 彩纸屑；
 *   白色划痕（浅底看不见）→ 暖灰铅笔线。文字色全部重新按最暗纸底 / 卡面复算。
 */
const Gallery = {
  els: {},
  list: [],   // 当前展出的卡片（沿用卡片墙的筛选结果）
  idx: 0,
  pose_: null,

  init() {
    const self = this;
    this.els = {
      root: document.getElementById('view-gallery'),
      art: document.getElementById('gArt'),
      close: document.getElementById('gClose'),
      prev: document.getElementById('gPrev'),
      next: document.getElementById('gNext'),
      wrap: document.querySelector('.g-frame-wrap'),
      under1: document.querySelector('.g-under-1'),
      under2: document.querySelector('.g-under-2'),
      tapeA: document.querySelector('.g-tape-a'),
      tapeB: document.querySelector('.g-tape-b'),
      stamp: document.getElementById('gStamp'),
      frame: document.getElementById('gFrame'),
      qEcho: document.getElementById('gQEcho'),
      answer: document.getElementById('gAnswer'),
      tag: document.getElementById('gTag'),
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

    /* 视差：鼠标在展馆里移动 → 背景层跟手 + 展品轻微 3D 倾斜。
       关掉动效偏好（prefers-reduced-motion）时直接不绑，避免"我不要动画你还动"。 */
    this.reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!this.reduced) {
      this.els.root.addEventListener('mousemove', function (ev) { self.parallax(ev); });
      this.els.root.addEventListener('mouseleave', function () { self.parallax(null); });
    }

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
    this.applyPose(card);
    this.replay();
    this.drawArt();
    // 展位号写进地址（replace 不进历史）：刷新/分享都停在同一件展品上
    Router.replace('#/gallery?i=' + this.idx);
  },

  /* ＝＝＝ 姿态：每件展品的"摆放方式"，种子来自卡片 id ＝＝＝ */
  pose(card) {
    const rnd = this.mulberry32(this.seed(String(card ? card.id : 'kq-empty') + '#pose'));
    return {
      rot: (rnd() * 2 - 1) * 3.6,
      ox: Math.round((rnd() * 2 - 1) * 34),
      oy: Math.round((rnd() * 2 - 1) * 22),
      scale: 0.95 + rnd() * 0.08,
      tapes: rnd() < 0.62 ? (rnd() < 0.45 ? 2 : 1) : 0,
      tapeRight: rnd() < 0.5,
      tapeRot: -14 + rnd() * 28,
      stamp: rnd() < 0.65,
      stampOfs: Math.round(rnd() * 18),
      u1rot: (rnd() * 2 - 1) * 7,
      u2rot: (rnd() * 2 - 1) * 7,
      titleRot: (rnd() * 2 - 1) * 1.5,
      descRot: (rnd() * 2 - 1) * 1.2,
      tagRot: -4 + rnd() * 8,
      drift: 8 + rnd() * 10,
      driftDur: 20 + rnd() * 10,
      driftDir: rnd() < 0.5 ? 1 : -1
    };
  },

  applyPose(card) {
    const p = this.pose(card);
    this.pose_ = p;
    // 小屏收姿态幅度：375px 下卡已占 78vw，±34px 的偏移会压到两侧箭头的点击区
    const k = window.innerWidth < 640 ? 0.45 : 1;
    const e = this.els, st = e.root.style;
    st.setProperty('--rot', (p.rot * k).toFixed(2) + 'deg');
    st.setProperty('--ox', Math.round(p.ox * k) + 'px');
    st.setProperty('--oy', Math.round(p.oy * k) + 'px');
    st.setProperty('--scale', p.scale.toFixed(3));
    st.setProperty('--drift', p.drift + 'px');
    st.setProperty('--drift-dur', p.driftDur.toFixed(1) + 's');
    e.title.style.setProperty('--info-rot', p.titleRot.toFixed(2) + 'deg');
    e.desc.style.setProperty('--info-rot', p.descRot.toFixed(2) + 'deg');
    e.tag.style.setProperty('--tag-rot', p.tagRot.toFixed(2) + 'deg');
    e.stamp.style.setProperty('--stamp-ofs', p.stampOfs + 'px');
    e.stamp.textContent = p.stamp ? '知识闯关 · KQ · ' + this.pad(this.idx + 1) : '';

    e.frame.classList.toggle('has-tape', p.tapes > 0);
    e.frame.classList.toggle('has-tape-two', p.tapes > 1);
    e.frame.classList.toggle('tape-right', p.tapeRight);
    e.frame.style.setProperty('--tape-rot', p.tapeRot.toFixed(2) + 'deg');

    // 叠在后面的两张邻卡：跟着主轴一起歪，但歪得不一样，才有"一叠"的感觉
    e.under1.style.transform = 'translate(' + (p.ox - 30) + 'px,' + (p.oy + 20) + 'px) rotate(' + (p.u1rot).toFixed(2) + 'deg) scale(' + (p.scale * 0.955).toFixed(3) + ')';
    e.under2.style.transform = 'translate(' + (p.ox + 34) + 'px,' + (p.oy + 30) + 'px) rotate(' + (p.u2rot).toFixed(2) + 'deg) scale(' + (p.scale * 0.925).toFixed(3) + ')';
  },

  /* 换展品时的错峰入场：给动画"重启一次"（先摘类、强制回流、再挂回） */
  replay() {
    const seq = [[this.els.title, 0], [this.els.num, 90], [this.els.desc, 150], [this.els.frame, 0]];
    seq.forEach(function (pair) {
      const el = pair[0];
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = '';
      el.style.animationDelay = pair[1] + 'ms';
    });
    const f = this.els.frame;
    f.classList.remove('swap');
    void f.offsetWidth;
    f.classList.add('swap');
  },

  /* 视差：dx/dy ∈ [-1,1]，背景层跟手平移，展品做小幅 3D 倾斜 */
  parallax(ev) {
    if (!this.pose_) return;
    const e = this.els;
    let dx = 0, dy = 0;
    if (ev) {
      const r = e.root.getBoundingClientRect();
      dx = ((ev.clientX - r.left) / r.width - 0.5) * 2;
      dy = ((ev.clientY - r.top) / r.height - 0.5) * 2;
    }
    e.art.style.transform = 'translate(' + (dx * -14).toFixed(1) + 'px,' + (dy * -10).toFixed(1) + 'px) scale(1.05)';
    e.wrap.style.setProperty('--tx', (-dy * 3.4).toFixed(2) + 'deg');
    e.wrap.style.setProperty('--ty', (dx * 4.2).toFixed(2) + 'deg');
    e.wrap.style.setProperty('--mx', (dx * 12).toFixed(1) + 'px');
    e.wrap.style.setProperty('--my', (dy * 8).toFixed(1) + 'px');
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
    const w = Math.max(cv.clientWidth || window.innerWidth, 320);
    const h = Math.max(cv.clientHeight || window.innerHeight, 240);
    cv.width = w * dpr; cv.height = h * dpr;
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const card = this.list[this.idx];
    const rnd = this.mulberry32(this.seed(card ? String(card.id) : 'kq-empty'));
    // 糖果色盘（明亮版）：玫瑰 / 天蓝 / 薄荷 / 奶油黄 / 薰衣草
    const ROSE   = [[244,140,166],[212,69,106],[255,186,204]];
    const SKY    = [[126,178,241],[96,150,226],[188,220,250]];
    const MINT   = [[120,205,180],[86,186,160],[196,235,222]];
    const BUTTER = [[248,206,116],[246,224,150],[255,238,186]];
    const LILAC  = [[178,160,240],[150,132,224],[214,204,246]];
    const POTS = [ROSE, SKY, MINT, BUTTER, LILAC];

    // 1) 大团软色斑：糖果色低透明度铺底，明亮版靠"淡"而不是靠"暗"撑氛围
    const blobCount = 4 + Math.floor(rnd() * 2);
    for (let i = 0; i < blobCount; i++) {
      const c = POTS[i % POTS.length][Math.floor(rnd() * 3)];
      const x = rnd() * w, y = rnd() * h, r = 150 + rnd() * 230;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (0.16 + rnd() * 0.20) + ')');
      g.addColorStop(1, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // 2) 喷溅点簇：糖果色小点，像水彩甩笔
    const clusters = 3 + Math.floor(rnd() * 2);
    for (let i = 0; i < clusters; i++) {
      const c = POTS[Math.floor(rnd() * POTS.length)][Math.floor(rnd() * 2)];
      const cx = rnd() * w, cy = rnd() * h, reach = 80 + rnd() * 120;
      const dots = 50 + Math.floor(rnd() * 60);
      for (let j = 0; j < dots; j++) {
        const ang = rnd() * Math.PI * 2;
        const d = Math.pow(rnd(), 1.8) * reach;
        const x = cx + Math.cos(ang) * d, y = cy + Math.sin(ang) * d;
        ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (0.22 + rnd() * 0.45) + ')';
        ctx.beginPath();
        ctx.arc(x, y, 0.6 + rnd() * (d > reach * 0.6 ? 2 : 5), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 3) 彩纸屑：换成小方块并带随机旋转（原来是故障横条，浅底上"故障风"会显脏）
    const confetti = 14 + Math.floor(rnd() * 10);
    for (let i = 0; i < confetti; i++) {
      const c = POTS[Math.floor(rnd() * POTS.length)][Math.floor(rnd() * 3)];
      const cw = 7 + rnd() * 16, ch = 5 + rnd() * 11;
      ctx.save();
      ctx.translate(rnd() * w, rnd() * h);
      ctx.rotate(rnd() * Math.PI);
      ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (0.30 + rnd() * 0.40) + ')';
      ctx.beginPath();
      if (ctx.roundRect) { ctx.roundRect(-cw / 2, -ch / 2, cw, ch, 2); } else { ctx.rect(-cw / 2, -ch / 2, cw, ch); }
      ctx.fill();
      ctx.restore();
    }

    // 4) 铅笔线：原来在暗底用白划痕，浅底上白线等于隐形 → 改成暖灰细曲线
    const strokes = 3 + Math.floor(rnd() * 3);
    ctx.lineCap = 'round';
    for (let i = 0; i < strokes; i++) {
      const pastel = rnd() < 0.45;
      if (pastel) {
        const c = POTS[Math.floor(rnd() * POTS.length)][0];
        ctx.strokeStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (0.30 + rnd() * 0.25) + ')';
      } else {
        ctx.strokeStyle = 'rgba(96,84,72,' + (0.10 + rnd() * 0.12) + ')';
      }
      ctx.lineWidth = 1 + rnd() * 2.2;
      ctx.beginPath();
      ctx.moveTo(rnd() * w, rnd() * h);
      ctx.bezierCurveTo(rnd() * w, rnd() * h, rnd() * w, rnd() * h, rnd() * w, rnd() * h);
      ctx.stroke();
    }

    // 5) 纸屑颗粒：浅底上要用"暖灰小点"才有纸感，白点会看不见
    const dust = 140;
    for (let i = 0; i < dust; i++) {
      ctx.fillStyle = 'rgba(104,90,76,' + (0.05 + rnd() * 0.13) + ')';
      ctx.beginPath();
      ctx.arc(rnd() * w, rnd() * h, rnd() * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
};
