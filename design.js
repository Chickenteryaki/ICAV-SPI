/* Design A — "Mission Control". Runs after polish.js. */
(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------- Decoding headlines ---------- */
  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#<>_+=*';
  function decode(heading) {
    if (heading.dataset.decoded) return;
    heading.dataset.decoded = '1';
    if (!heading.hasAttribute('aria-label')) heading.setAttribute('aria-label', heading.textContent.replace(/\s+/g, ' ').trim());
    const words = [...heading.querySelectorAll('.wi')];
    words.forEach((w, i) => {
      const final = w.textContent;
      w.style.minWidth = `${w.getBoundingClientRect().width}px`;
      w.classList.add('mc-decoding');
      const start = performance.now() + i * 90 + (heading.closest('.page-hero') ? 200 : 0);
      const duration = 520 + final.length * 45;
      const step = now => {
        const t = clamp((now - start) / duration, 0, 1);
        if (t >= 1) { w.textContent = final; w.classList.remove('mc-decoding'); w.style.minWidth = ''; return; }
        const solved = Math.floor(final.length * t);
        let out = final.slice(0, solved);
        for (let c = solved; c < final.length; c++) out += /\s|[.,]/.test(final[c]) ? final[c] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        w.textContent = out;
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }
  if (!reduced) {
    document.querySelectorAll('.wsplit').forEach(h => {
      if (h.classList.contains('words-in')) decode(h);
      new MutationObserver(() => { if (h.classList.contains('words-in')) decode(h); })
        .observe(h, { attributes: true, attributeFilter: ['class'] });
    });
  }

  /* ---------- Hero instrument frame, live clock, flight path ---------- */
  const hero = document.querySelector('.page-hero');
  if (hero) {
    const frame = document.createElement('div');
    frame.className = 'mc-frame';
    frame.setAttribute('aria-hidden', 'true');
    const site = document.body.querySelector('.nav a.active')?.textContent || 'Home';
    frame.innerHTML = `<i class="mc-corner"></i><i class="mc-corner"></i><i class="mc-corner"></i><i class="mc-corner"></i>
      <div class="mc-read l"><span>51.520° N · 0.236° W</span><span>Wormwood Scrubs</span></div>
      <div class="mc-read r"><span class="mc-live">UTC <b data-mc-clock>--:--:--</b></span><span>ICAV-SPI / ${site}</span></div>
      <div class="mc-scan"></div>`;
    hero.append(frame);
    const clockEl = frame.querySelector('[data-mc-clock]');
    const tickClock = () => { clockEl.textContent = new Date().toISOString().slice(11, 19); };
    tickClock(); setInterval(tickClock, 1000);

    if (!reduced && hero.classList.contains('home-hero')) {
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('class', 'mc-path'); svg.setAttribute('viewBox', '0 0 1000 600');
      svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('aria-hidden', 'true');
      const d = 'M -60 470 C 160 470, 300 250, 520 300 S 800 170, 1060 70';
      svg.innerHTML = `<path d="${d}"/><path class="mc-trail" d="${d}"/>`;
      hero.querySelector('.shade').after(svg);
      const [guide, trail] = svg.querySelectorAll('path');
      const plane = document.createElement('div');
      plane.className = 'mc-plane'; plane.setAttribute('aria-hidden', 'true');
      plane.innerHTML = '<span class="mc-plane-tag">ICAV-SPI</span>';
      hero.append(plane);
      const total = guide.getTotalLength();
      trail.style.strokeDasharray = `${total} ${total}`;
      const LOOP = 16000;
      let visible = true;
      new IntersectionObserver(e => { visible = e[0].isIntersecting; if (visible) requestAnimationFrame(fly); }).observe(hero);
      const fly = now => {
        if (!visible) return;
        const t = (now % LOOP) / LOOP;
        const travel = clamp(t / .8, 0, 1);
        const eased = travel < .5 ? 2 * travel * travel : 1 - (-2 * travel + 2) ** 2 / 2;
        const len = eased * total;
        const r = hero.getBoundingClientRect();
        const sx = r.width / 1000, sy = r.height / 600;
        const p = guide.getPointAtLength(len), q = guide.getPointAtLength(Math.min(total, len + 2));
        const angle = Math.atan2((q.y - p.y) * sy, (q.x - p.x) * sx) * 180 / Math.PI + 90;
        plane.style.transform = `translate(${p.x * sx - 23}px, ${p.y * sy - 18}px) rotate(${angle.toFixed(1)}deg)`;
        plane.querySelector('span').style.transform = `rotate(${(-angle).toFixed(1)}deg)`;
        const fade = t < .8 ? 1 : 1 - (t - .8) / .2;
        plane.style.opacity = (travel > 0 && travel < 1 ? 1 : 0) * fade;
        trail.style.strokeDashoffset = `${total - len}`;
        trail.style.opacity = fade;
        requestAnimationFrame(fly);
      };
      requestAnimationFrame(fly);
    }
  }

  /* ---------- Cursor reticle ---------- */
  if (fine && !reduced) {
    const cur = document.createElement('div');
    cur.className = 'mc-cursor'; cur.setAttribute('aria-hidden', 'true');
    cur.innerHTML = '<span></span>';
    document.body.append(cur);
    const label = cur.firstChild;
    let x = innerWidth / 2, y = innerHeight / 2, tx = x, ty = y, running = false;
    const loop = () => {
      x += (tx - x) * .22; y += (ty - y) * .22;
      cur.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      if (Math.abs(tx - x) + Math.abs(ty - y) > .3) requestAnimationFrame(loop); else running = false;
    };
    addEventListener('pointermove', e => {
      tx = e.clientX; ty = e.clientY; cur.classList.add('on');
      if (!running) { running = true; requestAnimationFrame(loop); }
      const hot = e.target.closest('a, button, summary, [role="button"]');
      cur.classList.toggle('hot', !!hot);
      const photo = e.target.closest('figure, .photo, .chapter-photo');
      label.textContent = hot ? (hot.target === '_blank' ? 'OPEN ↗' : 'GO →') : photo ? 'IMG' : '';
    }, { passive: true });
    document.addEventListener('pointerleave', () => cur.classList.remove('on'));
  }

  /* ---------- Chapter rail for the homepage flight story ---------- */
  const story = document.querySelector('.flight-story');
  if (story) {
    const chapters = [...story.querySelectorAll('[data-flight-stop]')];
    const rail = document.createElement('div');
    rail.className = 'mc-rail'; rail.setAttribute('aria-hidden', 'true');
    rail.innerHTML = chapters.map(() => '<i></i>').join('');
    document.body.append(rail);
    const ticks = [...rail.children];
    const sync = () => {
      const r = story.getBoundingClientRect();
      rail.classList.toggle('on', r.top < innerHeight * .4 && r.bottom > innerHeight * .6);
      rail.style.color = getComputedStyle(story).getPropertyValue('--flight-fg') || '#fff';
      let active = 0;
      chapters.forEach((c, i) => { if (c.getBoundingClientRect().top < innerHeight * .55) active = i; });
      ticks.forEach((t, i) => t.classList.toggle('on', i === active));
    };
    addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
    sync();
  }

  /* ---------- Blueprint draws itself ---------- */
  const bp = document.querySelector('.bp-figure');
  if (bp) {
    if ('IntersectionObserver' in window && !reduced) {
      const io = new IntersectionObserver(e => { if (e[0].isIntersecting) { bp.classList.add('drawn'); io.disconnect(); } }, { threshold: .12 });
      io.observe(bp);
    } else bp.classList.add('drawn');
  }
})();
