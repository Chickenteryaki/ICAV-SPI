/* ICAV SPI — polish layer (2026-11). Runs after site.js.
   Progressive: if this file fails to load, the site looks and works as before. */
(() => {
  'use strict';
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const motion = () => !reduced.matches;
  const hasIO = 'IntersectionObserver' in window;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  root.classList.add('polish');
  const syncMotion = () => root.classList.toggle('polish-motion', motion());
  syncMotion();

  /* ---------- Header, scroll progress, hero parallax ---------- */
  const nav = document.querySelector('.nav');
  const menu = document.querySelector('.menu');
  const header = document.querySelector('.site-header');
  const hero = document.querySelector('.page-hero');

  const progress = document.createElement('div');
  progress.className = 'scroll-progress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.append(progress);

  if (hero) {
    const cue = document.createElement('div');
    cue.className = 'scroll-cue';
    cue.setAttribute('aria-hidden', 'true');
    cue.innerHTML = '<span>Scroll</span><i></i>';
    hero.append(cue);
  }

  let lastY = scrollY;
  let velocity = 0;
  let scrollFrame = 0;
  const photoWindows = [...document.querySelectorAll('.chapter-photo-window')];

  function onScrollFrame() {
    scrollFrame = 0;
    const y = scrollY;
    const dy = y - lastY;
    velocity = dy;
    const max = root.scrollHeight - innerHeight;
    root.style.setProperty('--scroll', max > 0 ? clamp(y / max, 0, 1).toFixed(4) : '0');
    root.classList.toggle('is-scrolled', y > 40);

    const menuOpen = nav?.classList.contains('open');
    const focusInHeader = header?.contains(document.activeElement) && document.activeElement !== document.body;
    if (!menuOpen && !focusInHeader && y > innerHeight * .6 && dy > 3) root.classList.add('header-hidden');
    else if (dy < -3 || y < innerHeight * .6 || menuOpen || focusInHeader) root.classList.remove('header-hidden');
    lastY = y;

    if (!motion()) return;
    if (hero) {
      const h = hero.offsetHeight || innerHeight;
      if (y <= h * 1.1) {
        hero.style.setProperty('--hero-shift', `${(y * .28).toFixed(1)}px`);
        hero.style.setProperty('--hero-lift', `${(-y * .12).toFixed(1)}px`);
        hero.style.setProperty('--hero-fade', clamp(1 - (y / h) * 1.25, 0, 1).toFixed(3));
      }
    }
    photoWindows.forEach(win => {
      const r = win.getBoundingClientRect();
      if (r.bottom < -60 || r.top > innerHeight + 60) return;
      const p = clamp((r.top + r.height / 2 - innerHeight / 2) / innerHeight, -1, 1);
      win.style.setProperty('--py', `${(-p * r.height * .045).toFixed(2)}px`);
    });
  }
  const requestScroll = () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(onScrollFrame); };
  addEventListener('scroll', requestScroll, { passive: true });
  addEventListener('resize', requestScroll);
  header?.addEventListener('focusin', () => root.classList.remove('header-hidden'));
  onScrollFrame();

  /* ---------- Mobile menu: label + scroll lock (site.js owns open/close) ---------- */
  if (nav && menu) {
    const syncMenu = () => {
      const open = nav.classList.contains('open');
      menu.textContent = open ? 'Close' : 'Menu';
      root.classList.toggle('menu-open', open);
      if (open) root.classList.remove('header-hidden');
    };
    new MutationObserver(syncMenu).observe(nav, { attributes: true, attributeFilter: ['class'] });
    syncMenu();
  }

  /* ---------- Headline word reveal ---------- */
  function splitWords(el) {
    let index = 0;
    const walk = node => {
      [...node.childNodes].forEach(child => {
        if (child.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.append(' '); return; }
            const outer = document.createElement('span');
            const inner = document.createElement('span');
            outer.className = 'w';
            inner.className = 'wi';
            inner.style.setProperty('--i', index++);
            inner.textContent = part;
            outer.append(inner);
            frag.append(outer);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== 'BR') {
          walk(child);
        }
      });
    };
    walk(el);
    el.classList.add('wsplit');
  }

  const headings = [...document.querySelectorAll('.page-hero h1, .display')];
  if (motion() && hasIO) {
    headings.forEach(splitWords);
    const headingObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('words-in');
        headingObserver.unobserve(entry.target);
      });
    }, { threshold: .15, rootMargin: '0px 0px -6% 0px' });
    headings.forEach(h => headingObserver.observe(h));
  }

  /* ---------- Staggered reveals for lists and cards ---------- */
  const groups = [
    '.goal-facts > div', '.home-explore .row', '.timeline-row', '.stats .stat',
    '.news-list > *'
  ];
  const revealItems = [];
  groups.forEach(selector => {
    const items = [...document.querySelectorAll(selector)];
    items.forEach((el, i) => {
      if (el.matches('[data-reveal]') || el.closest('[data-reveal]')) return;
      el.classList.add('pr');
      el.style.setProperty('--d', String(i % 4));
      revealItems.push(el);
    });
  });
  if (motion() && hasIO) {
    const prObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        el.classList.add('pr-in');
        prObserver.unobserve(el);
        // Drop the stagger delay afterwards so hover effects respond instantly.
        setTimeout(() => el.style.setProperty('--d', '0'), 1600);
      });
    }, { threshold: .12, rootMargin: '0px 0px -5% 0px' });
    revealItems.forEach(el => prObserver.observe(el));
  } else revealItems.forEach(el => el.classList.add('pr-in'));

  /* ---------- Count-up numbers ---------- */
  function prepareCount(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const match = node.textContent.match(/\d[\d,]*(?:\.\d+)?/);
      if (!match) continue;
      const raw = match[0];
      // <data> rather than <span>: the site styles every span inside .goal-facts/.stat.
      const span = document.createElement('data');
      span.className = 'count';
      span.value = raw.replace(/,/g, '');
      span.textContent = raw;
      const before = node.textContent.slice(0, match.index);
      const after = node.textContent.slice(match.index + raw.length);
      node.replaceWith(before, span, after);
      const decimals = raw.includes('.') ? raw.split('.')[1].length : 0;
      return { span, raw, target: parseFloat(raw.replace(/,/g, '')), decimals, commas: raw.includes(',') };
    }
    return null;
  }
  const format = (value, c) => {
    const fixed = value.toFixed(c.decimals);
    return c.commas ? Number(fixed).toLocaleString('en-GB', { minimumFractionDigits: c.decimals, maximumFractionDigits: c.decimals }) : fixed;
  };
  const counters = [...document.querySelectorAll('.goal-facts strong, .stats .stat strong, .goal-number')]
    .map(el => ({ el, c: prepareCount(el) })).filter(item => item.c);
  function runCount(c) {
    const duration = c.target >= 50 ? 2000 : 1500;
    const start = performance.now();
    const tick = now => {
      const t = clamp((now - start) / duration, 0, 1);
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      c.span.textContent = t === 1 ? c.raw : format(c.target * eased, c);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  if (motion() && hasIO && counters.length) {
    counters.forEach(({ c }) => { c.span.textContent = format(0, c); });
    const countObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const item = counters.find(x => x.el === entry.target);
        if (item) runCount(item.c);
        countObserver.unobserve(entry.target);
      });
    }, { threshold: .6 });
    counters.forEach(({ el }) => countObserver.observe(el));
  }

  /* ---------- Marquee: drifts on its own, speeds up and follows your scroll ---------- */
  const track = document.querySelector('.marquee-track');
  if (track) {
    const group = track.querySelector('.marquee-group');
    track.append(group.cloneNode(true));
    let x = 0, rate = 1, direction = 1, visible = false, last = 0, raf = 0;
    const step = now => {
      raf = 0;
      if (!visible || !motion()) { last = 0; return; }
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      if (Math.abs(velocity) > 1) direction = velocity > 0 ? 1 : -1;
      const target = direction * (1 + Math.min(6, Math.abs(velocity) / 10));
      rate += (target - rate) * .08;
      velocity *= .9;
      const width = group.offsetWidth || 1;
      x -= rate * dt * .06;
      if (x <= -width) x += width;
      if (x > 0) x -= width;
      track.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
      raf = requestAnimationFrame(step);
    };
    if (hasIO) {
      new IntersectionObserver(entries => {
        visible = entries[0].isIntersecting;
        if (visible && !raf) raf = requestAnimationFrame(step);
      }).observe(track);
    }
  }

  /* ---------- Explore cards: load their photos just before they are needed ---------- */
  const cards = [...document.querySelectorAll('[data-card-img]')];
  const loadCard = el => el.style.setProperty('--card-img', `url("${el.dataset.cardImg}")`);
  if (hasIO) {
    const cardObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        loadCard(entry.target);
        cardObserver.unobserve(entry.target);
      });
    }, { rootMargin: '600px 0px' });
    cards.forEach(el => cardObserver.observe(el));
  } else cards.forEach(loadCard);

  /* ---------- Pointer effects (mouse/trackpad only) ---------- */
  if (finePointer.matches) {
    document.querySelectorAll('.goal-facts > div').forEach(card => {
      card.addEventListener('pointermove', e => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${e.clientX - r.left}px`);
        card.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    });
    document.querySelectorAll('.button, .slideshow-toggle').forEach(btn => {
      btn.addEventListener('pointermove', e => {
        if (!motion()) return;
        const r = btn.getBoundingClientRect();
        const dx = clamp((e.clientX - (r.left + r.width / 2)) * .22, -8, 8);
        const dy = clamp((e.clientY - (r.top + r.height / 2)) * .3, -6, 6);
        btn.style.translate = `${dx.toFixed(1)}px ${dy.toFixed(1)}px`;
      });
      btn.addEventListener('pointerleave', () => { btn.style.translate = ''; });
    });
  }

  /* ---------- Slideshow dots: show time left on the current slide ---------- */
  const dots = [...document.querySelectorAll('.home-hero-dot')];
  const toggle = document.querySelector('.slideshow-toggle');
  if (dots.length) {
    let lastKey = '';
    const restartDots = force => {
      const playing = toggle?.dataset.state !== 'play' && !document.hidden && motion();
      // Only restart when the slide or play state really changed: our own
      // 'run' class toggles also trigger the observers below.
      const key = `${dots.findIndex(d => d.classList.contains('active'))}:${playing}`;
      if (force !== true && key === lastKey) return;
      lastKey = key;
      dots.forEach(dot => {
        dot.classList.remove('run');
        if (playing && dot.classList.contains('active')) {
          void dot.offsetWidth; // restart the CSS animation
          dot.classList.add('run');
        }
      });
    };
    const onChange = () => restartDots(false);
    dots.forEach(dot => new MutationObserver(onChange).observe(dot, { attributes: true, attributeFilter: ['class'] }));
    if (toggle) new MutationObserver(onChange).observe(toggle, { attributes: true, attributeFilter: ['data-state'] });
    // Clicking a dot or play restarts site.js's timer even on the same slide.
    dots.forEach(dot => dot.addEventListener('click', () => restartDots(true)));
    toggle?.addEventListener('click', () => restartDots(true));
    document.addEventListener('visibilitychange', () => restartDots(true));
    restartDots(true);
  }

  /* ---------- Tiny aircraft on the scroll-progress bar ---------- */
  const scrollPlane = document.createElement('div');
  scrollPlane.className = 'scroll-plane';
  scrollPlane.setAttribute('aria-hidden', 'true');
  document.body.append(scrollPlane);

  /* ---------- Flight story v2: living sky, sun-cast shadow, mission HUD ----------
     site.js drives the flight itself (--flight-progress, --flight-daylight,
     aircraft position). This reads those values and adds the sky and HUD.
     The energy figures are an illustrative simulation, labelled as such. */
  const story = document.querySelector('.flight-story');
  const hud = story?.querySelector('.flight-hud');
  if (story && hud) {
    const $ = sel => hud.querySelector(sel);
    const dayEl = $('[data-hud-day]'), timeEl = $('[data-hud-time]'), statusEl = $('[data-hud-status]');
    const solarEl = $('[data-hud-solar]'), batteryEl = $('[data-hud-battery]');

    // Sun height over a day starting at 06:00 (sunrise) — same clock as site.js.
    const clockAt = h => (6 + h) % 24;
    const sunHeight = clock => Math.sin(((clock - 6) / 12) * Math.PI);
    // Battery: charge in daylight, drain on the night-time cruise load.
    const STEP = .05, LOAD = .3, RATE = .2;
    const battery = [];
    for (let h = 0, b = .42; h <= 100.0001; h += STEP) {
      battery.push(b);
      const solar = Math.max(0, sunHeight(clockAt(h))) ** 1.15;
      b = clamp(b + (solar - LOAD) * RATE * STEP, .12, 1);
    }
    const batteryAt = h => battery[clamp(Math.round(h / STEP), 0, battery.length - 1)];

    // Seeded starfield so it looks the same on every visit.
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    story.querySelectorAll('.sky-stars i').forEach(layer => {
      const stars = [];
      for (let i = 0; i < 46; i++) {
        const a = (.35 + rand() * .65).toFixed(2);
        stars.push(`${(rand() * 100).toFixed(2)}vw ${(rand() * 72).toFixed(2)}vh 0 ${rand() < .15 ? .6 : 0}px rgba(236,242,255,${a})`);
      }
      layer.style.boxShadow = stars.join(',');
    });

    const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    let lastText = '';
    const updateFlight = () => {
      const progress = parseFloat(story.style.getPropertyValue('--flight-progress'));
      if (Number.isNaN(progress)) return;
      const hours = progress * 100;
      const clock = clockAt(hours);
      const height = sunHeight(clock);

      // Sun and moon travel an arc from left horizon, over the top, to the right.
      const theta = ((clock - 6) / 12) * Math.PI;
      const arc = angle => [50 - 40 * Math.cos(angle), 84 - 66 * Math.sin(angle)];
      const [sx, sy] = arc(theta);
      const [mx, my] = arc(theta - Math.PI);
      const sunVis = clamp((height + .12) / .3, 0, 1);
      const moonVis = clamp((-height + .05) / .3, 0, 1);
      const warm = clamp(1 - height / .55, 0, 1);
      const set = (k, v) => story.style.setProperty(k, v);
      set('--sun-x', `${sx.toFixed(2)}%`); set('--sun-y', `${sy.toFixed(2)}%`);
      set('--moon-x', `${mx.toFixed(2)}%`); set('--moon-y', `${my.toFixed(2)}%`);
      set('--sun-vis', sunVis.toFixed(3)); set('--moon-vis', (moonVis * .95).toFixed(3));
      set('--sun-color', `rgb(${mix([255, 236, 186], [255, 160, 92], warm).join(',')})`);
      set('--dusk', (clamp(1 - Math.abs(height) / .38, 0, 1) * .85).toFixed(3));

      // Shadow falls away from the sun.
      const ax = parseFloat(story.style.getPropertyValue('--aircraft-x')) || innerWidth / 2;
      const ay = parseFloat(story.style.getPropertyValue('--aircraft-y')) || innerHeight / 2;
      let dx = ax - (sx / 100) * innerWidth, dy = ay - (sy / 100) * innerHeight;
      const len = Math.hypot(dx, dy) || 1;
      const reach = 4 + 8 * sunVis;
      dx = (dx / len) * reach; dy = (dy / len) * reach;
      // drop-shadow is applied inside the rotated aircraft, so undo the rotation.
      const bank = (parseFloat(story.style.getPropertyValue('--aircraft-bank')) || 180) * Math.PI / 180;
      const lx = dx * Math.cos(-bank) - dy * Math.sin(-bank);
      const ly = dx * Math.sin(-bank) + dy * Math.cos(-bank);
      set('--shadow-x', `${lx.toFixed(1)}px`); set('--shadow-y', `${ly.toFixed(1)}px`);

      // HUD readout
      const solar = Math.max(0, height) ** 1.15;
      const charge = batteryAt(hours);
      set('--hud-solar', solar.toFixed(3)); set('--hud-battery', charge.toFixed(3));
      const passed = hours >= 81.5;
      story.classList.toggle('record-passed', passed);
      const status = passed ? 'Record passed' : solar > LOAD ? 'Charging' : solar > .02 ? 'Solar + battery' : 'On battery';
      set('--hud-dot', passed ? '#f2b544' : solar > LOAD ? '#4fcf92' : solar > .02 ? '#f2b544' : '#8fb3e3');
      const totalMinutes = Math.floor((6 + hours) * 60);
      const day = Math.floor(totalMinutes / 1440) + 1;
      const time = `${String(Math.floor((totalMinutes % 1440) / 60)).padStart(2, '0')}:${String(totalMinutes % 60 - (totalMinutes % 10)).padStart(2, '0')}`;
      const text = `${day}|${time}|${status}|${Math.round(solar * 100)}|${Math.round(charge * 100)}`;
      if (text !== lastText) {
        lastText = text;
        dayEl.textContent = day; timeEl.textContent = time; statusEl.textContent = status;
        solarEl.textContent = `${Math.round(solar * 100)}%`; batteryEl.textContent = `${Math.round(charge * 100)}%`;
      }
    };
    // site.js eases the aircraft for a moment after scrolling stops, so keep
    // following it briefly rather than updating only on scroll events.
    let flightFrame = 0, followUntil = 0;
    const tick = now => {
      flightFrame = 0;
      updateFlight();
      if (now < followUntil) flightFrame = requestAnimationFrame(tick);
    };
    const requestFlight = () => {
      followUntil = performance.now() + 700;
      if (!flightFrame) flightFrame = requestAnimationFrame(tick);
    };
    addEventListener('scroll', requestFlight, { passive: true });
    addEventListener('resize', requestFlight);
    addEventListener('load', requestFlight);
    requestFlight();
  }

  /* ---------- If the visitor switches on "reduce motion", settle everything ---------- */
  reduced.addEventListener('change', () => {
    syncMotion();
    if (!motion()) {
      headings.forEach(h => h.classList.add('words-in'));
      revealItems.forEach(el => el.classList.add('pr-in'));
      counters.forEach(({ c }) => { c.span.textContent = c.raw; });
      if (hero) ['--hero-shift', '--hero-lift', '--hero-fade'].forEach(p => hero.style.removeProperty(p));
      if (track) track.style.transform = '';
    }
  });
})();
