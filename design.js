/* Design C — "Kinetic". Runs after polish.js. */
(() => {
  'use strict';
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------- Intro: the aircraft crosses the screen while hours count to 100 ---------- */
  if (root.classList.contains('kn-loading')) {
    const intro = document.createElement('div');
    intro.className = 'kn-intro';
    intro.setAttribute('aria-hidden', 'true');
    intro.innerHTML = '<div class="kn-intro-brand">ICAV SPI · Solar Plane Initiative</div><div class="kn-intro-line"></div><div class="kn-intro-plane"></div>' +
      '<div class="kn-intro-goal">Four days. Four nights. Still flying.</div><div class="kn-intro-count"><span>000</span><small>h</small></div>';
    document.body.append(intro);
    const count = intro.querySelector('.kn-intro-count span');
    const DURATION = 1700;
    let start = 0, done = false;
    const finish = () => {
      if (done) return; done = true;
      try { sessionStorage.setItem('kn-intro', '1'); } catch (e) {}
      intro.classList.add('out');
      root.classList.remove('kn-loading');
      setTimeout(() => intro.remove(), 1100);
    };
    const tick = now => {
      if (!start) start = now;
      const t = clamp((now - start) / DURATION, 0, 1);
      const e = t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      intro.style.setProperty('--p', e.toFixed(4));
      count.textContent = String(Math.round(e * 100)).padStart(3, '0');
      if (t < 1) requestAnimationFrame(tick); else setTimeout(finish, 250);
    };
    requestAnimationFrame(tick);
    intro.addEventListener('click', finish);
    addEventListener('keydown', finish, { once: true });
  }

  /* ---------- Hero sunlight spotlight ---------- */
  const hero = document.querySelector('.page-hero');
  if (hero && !reduced) {
    const spot = document.createElement('div');
    spot.className = 'kn-spot'; spot.setAttribute('aria-hidden', 'true');
    (hero.querySelector('.shade') || hero.firstElementChild).after(spot);
    let x = .7, y = .38, tx = x, ty = y, pointer = false, visible = true;
    hero.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const r = hero.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width; ty = (e.clientY - r.top) / r.height; pointer = true;
    });
    hero.addEventListener('pointerleave', () => { pointer = false; });
    new IntersectionObserver(en => { visible = en[0].isIntersecting; if (visible) requestAnimationFrame(loop); }).observe(hero);
    function loop(now) {
      if (!visible) return;
      if (!pointer) { tx = .62 + Math.sin(now / 4200) * .22; ty = .34 + Math.sin(now / 3100) * .12; }
      x += (tx - x) * .08; y += (ty - y) * .08;
      spot.style.setProperty('--sx', `${(x * 100).toFixed(2)}%`);
      spot.style.setProperty('--sy', `${(y * 100).toFixed(2)}%`);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  /* ---------- Solar-cell field that charges under the cursor ---------- */
  document.querySelectorAll('.home-next, .team-cta, .contact-grid').forEach(section => {
    const host = section.classList.contains('contact-grid') ? section.closest('.section') : section;
    if (!host || reduced) return;
    host.classList.add('kn-cells-host');
    const canvas = document.createElement('canvas');
    canvas.className = 'kn-cells'; canvas.setAttribute('aria-hidden', 'true');
    host.prepend(canvas);
    const ctx = canvas.getContext('2d');
    const CELL = 26, GAP = 3;
    let cols = 0, rows = 0, energy = new Float32Array(0), dpr = 1, mx = -999, my = -999, visible = false, raf = 0, last = 0;
    const resize = () => {
      dpr = Math.min(2, devicePixelRatio || 1);
      const r = host.getBoundingClientRect();
      canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
      cols = Math.ceil(r.width / CELL); rows = Math.ceil(r.height / CELL);
      energy = new Float32Array(cols * rows);
    };
    resize();
    addEventListener('resize', resize);
    host.addEventListener('pointermove', e => { const r = host.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; });
    host.addEventListener('pointerleave', () => { mx = my = -999; });
    const draw = now => {
      raf = 0;
      if (!visible) return;
      const dt = Math.min(50, now - (last || now)); last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const sweep = ((now / 9000) % 1.4 - .2) * cols;  // a slow band of sunlight crosses on its own
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const k = j * cols + i;
          const cx = i * CELL + CELL / 2, cy = j * CELL + CELL / 2;
          const d = Math.hypot(cx - mx, cy - my);
          const near = d < 170 ? (1 - d / 170) ** 2 : 0;
          const band = Math.max(0, 1 - Math.abs(i - sweep - j * .35) / 3) * .22;
          energy[k] = Math.max(energy[k] * Math.pow(.9965, dt), near, band);
          const e = energy[k];
          ctx.fillStyle = e > .02
            ? `rgba(${Math.round(40 + 202 * e)},${Math.round(60 + 121 * e)},${Math.round(110 - 42 * e)},${(.16 + e * .6).toFixed(3)})`
            : 'rgba(60,90,140,.12)';
          ctx.fillRect(i * CELL + GAP / 2, j * CELL + GAP / 2, CELL - GAP, CELL - GAP);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    new IntersectionObserver(en => { visible = en[0].isIntersecting; if (visible && !raf) raf = requestAnimationFrame(draw); }).observe(host);
  });

  /* ---------- Stacked explore cards ---------- */
  const explore = document.querySelector('.home-explore');
  if (explore) {
    explore.classList.add('kn-stack');
    const cards = [...explore.querySelectorAll('.row')];
    cards.forEach((c, i) => { c.style.setProperty('--i', i); c.dataset.cardImg && c.style.setProperty('--card-img', `url("${c.dataset.cardImg}")`); });
    const stack = () => {
      cards.forEach((c, i) => {
        const next = cards[i + 1];
        if (!next) { c.style.setProperty('--s', 1); return; }
        const gap = next.getBoundingClientRect().top - c.getBoundingClientRect().top;
        const covered = clamp(1 - gap / c.offsetHeight, 0, 1);
        c.style.setProperty('--s', (1 - covered * .06).toFixed(4));
      });
    };
    addEventListener('scroll', () => requestAnimationFrame(stack), { passive: true });
    stack();
  }

  /* ---------- Lean with scroll speed ---------- */
  if (!reduced) {
    let lastY = scrollY, lean = 0, raf = 0;
    const settle = () => {
      lean *= .86;
      root.style.setProperty('--lean', lean.toFixed(2));
      raf = Math.abs(lean) > .05 ? requestAnimationFrame(settle) : 0;
      if (!raf) root.style.setProperty('--lean', '0');
    };
    addEventListener('scroll', () => {
      const v = scrollY - lastY; lastY = scrollY;
      lean = clamp(lean * .6 + v * .12, -8, 8);
      if (!raf) raf = requestAnimationFrame(settle);
    }, { passive: true });
  }

  /* ---------- Blob cursor ---------- */
  if (fine && !reduced) {
    const cur = document.createElement('div');
    cur.className = 'kn-cursor'; cur.setAttribute('aria-hidden', 'true');
    document.body.append(cur);
    let x = 0, y = 0, tx = 0, ty = 0, run = false;
    const loop = () => {
      x += (tx - x) * .2; y += (ty - y) * .2;
      cur.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      run = Math.abs(tx - x) + Math.abs(ty - y) > .3;
      if (run) requestAnimationFrame(loop);
    };
    addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      tx = e.clientX; ty = e.clientY; cur.classList.add('on');
      const photo = e.target.closest('.chapter-photo, .photo, figure, .home-explore .row');
      const hot = e.target.closest('a, button, summary');
      cur.classList.toggle('view', !!photo && !!hot);
      cur.classList.toggle('hot', !!hot && !photo);
      cur.textContent = photo && hot ? 'Open' : '';
      if (!run) { run = true; requestAnimationFrame(loop); }
    }, { passive: true });
    document.addEventListener('pointerleave', () => cur.classList.remove('on'));
  }

  /* ---------- Giant footer wordmark ---------- */
  const footer = document.querySelector('.footer');
  if (footer) {
    const mega = document.createElement('div');
    mega.className = 'kn-mega'; mega.setAttribute('aria-hidden', 'true');
    mega.innerHTML = [...'100 HOURS.'].map((ch, i) => ch === ' ' ? '<span class="sp"></span>' : `<span style="--i:${i}">${ch}</span>`).join('');
    footer.prepend(mega);
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(en => { if (en[0].isIntersecting) { mega.classList.add('in'); io.disconnect(); } }, { threshold: .3 });
      io.observe(mega);
    } else mega.classList.add('in');
  }
})();
