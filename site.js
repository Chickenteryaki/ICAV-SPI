(() => {
  'use strict';
  const menu = document.querySelector('.menu');
  const nav = document.querySelector('.nav');
  const closeMenu = () => { nav?.classList.remove('open'); menu?.setAttribute('aria-expanded', 'false'); };
  menu?.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(open));
  });
  nav?.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav?.classList.contains('open')) { closeMenu(); menu.focus(); }
  });
  document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const slides = [...document.querySelectorAll('.home-hero-slide')];
  const dots = [...document.querySelectorAll('.home-hero-dot')];
  const pause = document.querySelector('.slideshow-toggle');
  let slideIndex = 0, timer, paused = reduced.matches;

  function showSlide(index) {
    slideIndex = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      slide.classList.toggle('active', i === slideIndex);
      slide.setAttribute('aria-hidden', String(i !== slideIndex));
    });
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === slideIndex);
      dot.setAttribute('aria-pressed', String(i === slideIndex));
    });
  }

  function scheduleSlides() {
    clearInterval(timer);
    if (pause) {
      pause.textContent = paused ? 'Play' : 'Pause';
      pause.dataset.state = paused ? 'play' : 'pause';
      pause.setAttribute('aria-label', paused ? 'Play slideshow' : 'Pause slideshow');
    }
    if (slides.length > 1 && !paused && !document.hidden) {
      timer = setInterval(() => showSlide(slideIndex + 1), 6500);
    }
  }

  if (slides.length) {
    showSlide(0);
    scheduleSlides();
    dots.forEach((dot, i) => dot.addEventListener('click', () => { showSlide(i); scheduleSlides(); }));
    pause?.addEventListener('click', () => { paused = !paused; scheduleSlides(); });
    document.addEventListener('visibilitychange', scheduleSlides);
  }

  // Shared motion is progressive: every page remains readable without JavaScript.
  const root = document.documentElement;
  const narrow = matchMedia('(max-width: 900px)');
  const revealTargets = new Set(document.querySelectorAll('[data-reveal]'));
  document.querySelectorAll(
    '.page-hero .hero-copy, .section .display, .section .body-copy, ' +
    '.team-intro-copy, .team-life-copy, .team-review-copy, .team-section-head, ' +
    '.team-bands article, .team-partner-copy, .crew-list, .team-cta .split > div, ' +
    '.systems-controls .row, .contact-option'
  ).forEach(el => {
    if (!el.closest('.flight-story') && !el.parentElement.closest('[data-reveal]')) {
      el.dataset.reveal = 'copy';
      revealTargets.add(el);
    }
  });
  document.querySelectorAll(
    '.team-life-main, .team-review-image, .team-partner-image, .team-testday-photo, .photo-grid .photo'
  ).forEach(el => { el.dataset.reveal = 'photo'; revealTargets.add(el); });

  const revealObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-revealed');
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: .08, rootMargin: '0px 0px -24px 0px' }) : null;
  revealTargets.forEach(el => {
    if (!reduced.matches && revealObserver) {
      el.classList.add('reveal-ready');
      revealObserver.observe(el);
    } else el.classList.add('is-revealed');
  });

  const depthPhotos = [...document.querySelectorAll(
    '.team-life-main, .team-review-image, .team-testday-photo'
  )];
  depthPhotos.forEach(el => el.classList.add('depth-photo'));
  let depthFrame = 0;
  function updateDepth() {
    depthFrame = 0;
    depthPhotos.forEach(el => {
      if (reduced.matches || narrow.matches) { el.style.removeProperty('--photo-drift'); return; }
      const rect = el.getBoundingClientRect();
      if (rect.bottom < -40 || rect.top > innerHeight + 40) return;
      const distance = Math.min(14, rect.height * .018);
      const progress = Math.min(1, Math.max(-1, (rect.top + rect.height / 2 - innerHeight / 2) / innerHeight));
      el.style.setProperty('--photo-drift', `${(-progress * distance).toFixed(2)}px`);
    });
  }
  const requestDepth = () => { if (!depthFrame) depthFrame = requestAnimationFrame(updateDepth); };
  if (depthPhotos.length) {
    addEventListener('scroll', requestDepth, { passive: true });
    addEventListener('resize', requestDepth);
    updateDepth();
  }

  const drawing = document.querySelector('[data-systems-drawing]');
  const systemButtons = [...document.querySelectorAll('[data-system-select]')];
  const systemStatus = document.querySelector('[data-system-status]');
  if (drawing && systemButtons.length) {
    function selectSystem(button) {
      drawing.dataset.activeSystem = button.dataset.systemSelect;
      systemButtons.forEach(item => {
        const selected = item === button;
        item.setAttribute('aria-pressed', String(selected));
        item.closest('.row').classList.toggle('system-active', selected);
      });
      if (systemStatus) systemStatus.textContent = button.textContent;
    }
    systemButtons.forEach((button, index) => {
      button.addEventListener('click', () => selectSystem(button));
      button.addEventListener('keydown', event => {
        const direction = ['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 :
          ['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 0;
        if (!direction) return;
        event.preventDefault();
        const next = systemButtons[(index + direction + systemButtons.length) % systemButtons.length];
        next.focus();
        selectSystem(next);
      });
    });
    selectSystem(systemButtons.find(button => button.getAttribute('aria-pressed') === 'true') || systemButtons[0]);
  }

  // Keep native details semantics while animating both opening and closing.
  const disclosures = [...document.querySelectorAll('.news-entry')];
  const disclosureState = new Map();
  function finishDisclosure(detail, state) {
    state.animation?.cancel();
    state.fade?.cancel();
    detail.open = state.open;
    detail.style.removeProperty('height');
    detail.style.removeProperty('overflow');
    disclosureState.delete(detail);
  }
  disclosures.forEach(detail => {
    const summary = detail.querySelector('summary');
    const body = detail.querySelector('.news-body');
    summary?.addEventListener('click', event => {
      if (reduced.matches || typeof detail.animate !== 'function') return;
      event.preventDefault();
      const previous = disclosureState.get(detail);
      const open = !(previous ? previous.open : detail.open);
      const start = detail.getBoundingClientRect().height;
      previous?.animation?.cancel();
      previous?.fade?.cancel();
      detail.style.height = '';
      detail.open = true;
      const end = open ? detail.getBoundingClientRect().height : summary.getBoundingClientRect().height + 1;
      detail.style.height = `${start}px`;
      detail.style.overflow = 'hidden';
      const state = { open };
      state.animation = detail.animate([{ height: `${start}px` }, { height: `${end}px` }], {
        duration: 260, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'both'
      });
      state.fade = body?.animate(open ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], {
        duration: open ? 230 : 170, fill: 'both'
      });
      disclosureState.set(detail, state);
      state.animation.onfinish = () => {
        if (disclosureState.get(detail) === state) finishDisclosure(detail, state);
      };
    });
  });

  function setSharedMotion() {
    root.classList.toggle('motion-enabled', !reduced.matches);
    if (reduced.matches) {
      revealTargets.forEach(el => el.classList.add('is-revealed'));
      disclosureState.forEach((state, detail) => finishDisclosure(detail, state));
      paused = true;
      scheduleSlides();
    }
    updateDepth();
  }
  const setVisibility = () => root.classList.toggle('motion-suspended', document.hidden);
  reduced.addEventListener('change', setSharedMotion);
  narrow.addEventListener('change', requestDepth);
  document.addEventListener('visibilitychange', setVisibility);
  setSharedMotion();
  setVisibility();

  const story = document.querySelector('.flight-story');
  if (!story) return;

  const chapters = [...story.querySelectorAll('[data-flight-stop]')];
  const hourLabel = story.querySelector('[data-flight-hours]');
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

  let markers = [];
  let storyTop = 0;
  let storyHeight = 0;
  let frame = 0;

  function measure() {
    storyTop = story.getBoundingClientRect().top + scrollY;
    storyHeight = story.offsetHeight;
    markers = chapters.map(chapter => {
      const columns = [...(chapter.querySelector('.chapter-grid')?.children || [])]
        .map(el => el.getBoundingClientRect()).sort((a, b) => a.left - b.left);
      const gap = columns.length === 2 && innerWidth > 900 ? columns[1].left - columns[0].right : 0;
      return {
        y: chapter.getBoundingClientRect().top + scrollY - storyTop,
        h: Number(chapter.dataset.flightStop),
        x: gap > 0 ? (columns[0].right + gap / 2) / innerWidth * 100 : 50,
        gap,
        scene: chapter.id
      };
    });
    markers.push({
      y: Math.max(markers[markers.length - 1].y + 1, storyHeight - innerHeight),
      h: 100,
      x: 50,
      gap: 0,
      scene: 'flight-goal'
    });
    update();
  }

  function update() {
    frame = 0;
    if (reduced.matches || !markers.length) return;

    const offset = scrollY - storyTop;
    if (offset < -innerHeight || offset > storyHeight) return;

    const maxPosition = Math.max(1, markers[markers.length - 1].y);
    const position = clamp(offset, 0, maxPosition);
    const progress = clamp(position / maxPosition);

    let segment = 0;
    while (segment < markers.length - 2 && position > markers[segment + 1].y) segment++;
    const from = markers[segment];
    const to = markers[segment + 1];
    const t = clamp((position - from.y) / Math.max(1, to.y - from.y));
    const elapsed = from.h + (to.h - from.h) * t;

    const totalMinutes = Math.floor((6 + elapsed) * 60);
    const clock = (totalMinutes % 1440) / 60;
    const daylight = clamp((Math.sin((clock - 6) / 12 * Math.PI) + .25) / 1.25);
    const blend = daylight * daylight * (3 - 2 * daylight);
    const night = [15, 25, 38];
    const day = [238, 234, 224];
    const rgb = night.map((v, i) => Math.round(v + (day[i] - v) * blend));
    const linear = rgb.map(v => {
      v /= 255;
      return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
    });
    const luminance = linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;

    story.style.setProperty('--flight-bg', `rgb(${rgb.join(',')})`);
    story.style.setProperty('--flight-fg', luminance > .18 ? '#111a22' : '#f6f3eb');
    story.style.setProperty('--flight-daylight', blend.toFixed(3));
    story.style.setProperty('--flight-progress', (elapsed / 100).toFixed(4));

    const landing = clamp((progress - .78) / .22);
    const mobile = innerWidth <= 900;
    const corridor = from.gap > 0 ? from : to;
    const space = Math.max(0, (corridor.gap - Math.min(86, innerWidth * .063) * 1.15 - 20) / 2);
    const lateral = Math.sin(progress * Math.PI * 2.05) * Math.min(12, space) / innerWidth * 100;
    const startX = corridor.x || 50;
    const x = mobile ? (innerWidth - 29) / innerWidth * 100 - landing * 12 :
      startX + (50 - startX) * landing + lateral * (1 - landing);
    const y = 27 + progress * 16 + Math.sin(progress * Math.PI * 3) * 1.3 - landing * 22;
    const bank = 180 + Math.cos(progress * Math.PI * 2.05) * (mobile ? 3 : 4) * (1 - landing);
    const scale = 1 + landing * (mobile ? .15 : .35);
    const trail = .46 - landing * .31;

    story.style.setProperty('--aircraft-x', `${x.toFixed(2)}%`);
    story.style.setProperty('--aircraft-y', `${y.toFixed(2)}%`);
    story.style.setProperty('--aircraft-bank', `${bank.toFixed(2)}deg`);
    story.style.setProperty('--aircraft-scale', scale.toFixed(3));
    story.style.setProperty('--trail-opacity', trail.toFixed(3));
    story.style.setProperty('--landing', landing.toFixed(3));
    let visibleChapter = 0;
    const viewPosition = position + innerHeight * .45;
    while (visibleChapter < chapters.length - 1 && viewPosition >= markers[visibleChapter + 1].y) visibleChapter++;
    story.dataset.flightScene = chapters[visibleChapter].id;
    story.style.setProperty('--cloud-drift', `${(Math.sin(position / 620) * 68).toFixed(1)}px`);
    story.style.setProperty('--cloud-rise', `${(Math.sin(position / 510) * 7 + Math.cos(position / 980) * 3).toFixed(1)}px`);

    if (hourLabel) hourLabel.textContent = String(Math.floor(elapsed + .0001)).padStart(3, '0');
  }

  function requestUpdate() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  function setMotion() {
    story.classList.toggle('motion-ready', !reduced.matches);
    if (reduced.matches) {
      paused = true;
      scheduleSlides();
    }
    measure();
  }

  addEventListener('scroll', requestUpdate, { passive: true });
  addEventListener('resize', measure);
  addEventListener('pageshow', measure);
  reduced.addEventListener('change', setMotion);

  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(story);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      story.classList.toggle('flight-running', entries[0].isIntersecting);
    }).observe(story);
  } else story.classList.add('flight-running');

  setMotion();
})();
