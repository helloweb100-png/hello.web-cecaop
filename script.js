/* ==========================================================================
   CECAOP | script.js
   JavaScript nativo, sin dependencias.
   Un solo bucle rAF coordina todo lo que depende del scroll (en vez de
   muchos listeners), y cada módulo falla de forma aislada.
   ========================================================================== */
(() => {
  'use strict';

  /* ------------------------------------------------------------------
     CONFIGURACIÓN (lo único que normalmente hay que editar)
     ------------------------------------------------------------------ */
  const CONFIG = {
    // Número de WhatsApp: código de país 52 + 10 dígitos, sin espacios ni signos.
    whatsapp: '524492240909',
    timezone: 'America/Mexico_City',
    schedule: { days: [1, 2, 3, 4, 5], open: 9, close: 16 }, // lunes a viernes, 9:00 a 16:00
    rotator: [
      'transporte de carga general',
      'transporte de pasaje y turismo',
      'materiales y residuos peligrosos',
      'doblemente articulado',
      'chofer guía',
      'taxis de puertos y aeropuertos'
    ]
  };

  /* ------------------------------------------------------------------
     UTILIDADES
     ------------------------------------------------------------------ */
  const root = document.documentElement;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const waURL = (text) => 'https://wa.me/' + CONFIG.whatsapp + (text ? '?text=' + encodeURIComponent(text) : '');
  const safe = (name, fn) => { try { fn(); } catch (err) { console.warn('[CECAOP] módulo "' + name + '" falló:', err); } };

  root.classList.add('js-ok');

  const state = { y: window.scrollY, vh: window.innerHeight, vw: window.innerWidth, vel: 0, lastY: window.scrollY };
  const tasks = [];                // funciones que corren en cada frame: fn(time, dt)
  const onResize = [];             // funciones que corren al cambiar el tamaño

  /* ------------------------------------------------------------------
     PREPARACIÓN DEL DOM (antes de que termine el loader)
     ------------------------------------------------------------------ */
  function prepare() {
    // Dividir títulos en palabras para el reveal con máscara
    $$('[data-split]').forEach(splitWords);

    // Manifiesto: palabras que se encienden con el scroll
    const man = $('#manifesto-text');
    if (man) {
      const frag = document.createDocumentFragment();
      man.textContent.trim().split(/\s+/).forEach((word, i, arr) => {
        const s = document.createElement('span');
        s.className = 'w';
        s.textContent = word;
        frag.append(s);
        if (i < arr.length - 1) frag.append(document.createTextNode(' '));
      });
      man.textContent = '';
      man.append(frag);
    }

    // Retardos de entrada del hero
    $$('[data-hero-in]').forEach((el, i) => el.style.setProperty('--hd', 180 + i * 130 + 'ms'));

    // Índices para el menú móvil
    $$('.mobile-menu li a').forEach((a, i) => a.style.setProperty('--i', i));

    // Índices de trazo para los vehículos (efecto de dibujo escalonado)
    $$('.vehicle').forEach((svg) => {
      $$('.v-ground > *:not(.v-dash), .v-line > *', svg).forEach((shape, i) => shape.style.setProperty('--k', i));
    });

    // Contadores empiezan en 0 (el HTML trae el valor final por si no hay JS)
    $$('[data-count]').forEach((el) => { el.textContent = '0'; });

    // Año del footer
    const year = $('#year');
    if (year) year.textContent = new Date().getFullYear();
  }

  function splitWords(el) {
    let idx = 0;
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) {
              frag.append(document.createTextNode(' '));
            } else {
              const outer = document.createElement('span');
              outer.className = 'sw';
              const inner = document.createElement('span');
              inner.textContent = part;
              inner.style.setProperty('--wi', idx++);
              outer.append(inner);
              frag.append(outer);
            }
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1) {
          walk(child);
        }
      });
    };
    walk(el);
  }

  /* ------------------------------------------------------------------
     LOADER: progreso real (load + fuentes) con tiempo mínimo
     ------------------------------------------------------------------ */
  function initLoader(onDone) {
    const loader = $('#loader');
    if (!loader) { onDone(); return; }

    const ring = $('#loader-ring');
    const meter = $('#loader-bar');
    const num = $('#loader-num');
    const status = $('#loader-status');
    const messages = [
      [0, 'Encendiendo motores'],
      [24, 'Cargando rutas'],
      [52, 'Verificando requisitos'],
      [78, 'Preparando tu licencia'],
      [96, 'Listo para la ruta']
    ];
    const minTime = reduceMotion ? 350 : 2400;
    const t0 = performance.now();
    let ready = false;
    let finished = false;
    let lastMsg = -1;

    const markReady = () => { ready = true; };
    const pageLoaded = document.readyState === 'complete'
      ? Promise.resolve()
      : new Promise((res) => window.addEventListener('load', res, { once: true }));
    Promise.all([pageLoaded, document.fonts ? document.fonts.ready : Promise.resolve()]).then(markReady, markReady);
    setTimeout(markReady, 6500); // tope de seguridad

    function tick(now) {
      if (finished) return;
      const t = clamp((now - t0) / minTime, 0, 1);
      const eased = 1 - Math.pow(1 - t, 2.4);
      const p = ready ? eased * 100 : Math.min(eased * 100, 90);

      if (ring) ring.style.strokeDashoffset = String(100 - p);
      if (meter) meter.parentElement.style.setProperty('--p', (p / 100).toFixed(3));
      if (meter) meter.style.setProperty('--p', (p / 100).toFixed(3));
      if (num) num.textContent = String(Math.round(p));
      for (let i = messages.length - 1; i >= 0; i--) {
        if (p >= messages[i][0]) {
          if (i !== lastMsg && status) { status.textContent = messages[i][1]; lastMsg = i; }
          break;
        }
      }

      if (ready && t >= 1) {
        finished = true;
        if (num) num.textContent = '100';
        setTimeout(finish, 380);
        return;
      }
      requestAnimationFrame(tick);
    }

    function finish() {
      loader.classList.add('is-done');
      root.classList.remove('is-loading');
      window.scrollTo(0, window.scrollY);
      setTimeout(() => { root.classList.add('is-ready'); onDone(); }, reduceMotion ? 0 : 520);
      setTimeout(() => loader.classList.add('is-gone'), reduceMotion ? 50 : 1700);
    }

    requestAnimationFrame(tick);
  }

  /* ------------------------------------------------------------------
     HEADER, PROGRESO DE SCROLL, MENÚ MÓVIL, LINK ACTIVO
     ------------------------------------------------------------------ */
  function initHeader() {
    const header = $('#header');
    const bar = $('#scroll-progress');
    const toggle = $('#menu-toggle');
    const menu = $('#mobile-menu');
    let scrolledFlag = false;

    tasks.push(() => {
      const scrolled = state.y > 24;
      if (scrolled !== scrolledFlag) {
        scrolledFlag = scrolled;
        header.classList.toggle('is-scrolled', scrolled);
      }
      const max = document.documentElement.scrollHeight - state.vh;
      bar.style.setProperty('--sp', max > 0 ? clamp(state.y / max, 0, 1).toFixed(4) : '0');
    });

    // Menú móvil
    const setMenu = (open) => {
      menu.classList.toggle('is-open', open);
      menu.setAttribute('aria-hidden', String(!open));
      menu.inert = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
      root.style.overflow = open ? 'hidden' : '';
      root.classList.toggle('menu-open', open);
    };
    menu.inert = true;
    toggle.addEventListener('click', () => setMenu(!menu.classList.contains('is-open')));
    $$('a', menu).forEach((a) => a.addEventListener('click', () => setMenu(false)));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.classList.contains('is-open')) { setMenu(false); toggle.focus(); }
    });
    onResize.push(() => { if (state.vw >= 1024 && menu.classList.contains('is-open')) setMenu(false); });

    // Link activo según la sección visible
    const links = $$('.primary-nav a');
    const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((a) => { a.classList.remove('is-active'); a.removeAttribute('aria-current'); });
        const link = map.get(entry.target.id);
        if (link) { link.classList.add('is-active'); link.setAttribute('aria-current', 'true'); }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    $$('main section[id]').forEach((s) => io.observe(s));
  }

  /* ------------------------------------------------------------------
     REVEAL AL ENTRAR EN PANTALLA + CONTADORES
     ------------------------------------------------------------------ */
  function initReveal() {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
    $$('[data-reveal], [data-split], .course-card').forEach((el) => io.observe(el));

    // Contadores
    const easeOutExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
    const counterIO = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        counterIO.unobserve(entry.target);
        const el = entry.target;
        const target = parseInt(el.dataset.count, 10) || 0;
        if (reduceMotion) { el.textContent = String(target); return; }
        const start = performance.now();
        const dur = 1700;
        const step = (now) => {
          const t = clamp((now - start) / dur, 0, 1);
          el.textContent = String(Math.round(easeOutExpo(t) * target));
          if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }, { threshold: 0.6 });
    $$('[data-count]').forEach((el) => counterIO.observe(el));
  }

  /* ------------------------------------------------------------------
     HERO: partículas, rotador, tarjeta de ruta, parallax
     ------------------------------------------------------------------ */
  function initHero() {
    const hero = $('#inicio');
    if (!hero) return;
    let heroVisible = true;
    new IntersectionObserver((e) => { heroVisible = e[0].isIntersecting; }, { threshold: 0 }).observe(hero);

    /* Partículas en red (canvas) */
    const canvas = $('#hero-canvas');
    if (canvas && !reduceMotion) {
      const ctx = canvas.getContext('2d');
      let w = 0, h = 0, dpr = 1, particles = [];
      const mouse = { x: -9999, y: -9999 };
      const LINK = 130;

      const build = () => {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        w = canvas.clientWidth; h = canvas.clientHeight;
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const count = clamp(Math.round((w * h) / 15000), 26, 92);
        particles = Array.from({ length: count }, () => {
          const gold = Math.random() < 0.28;
          return {
            x: Math.random() * w, y: Math.random() * h,
            vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35 - 0.05,
            r: Math.random() * 1.7 + 0.6, c: gold ? '255,194,14' : '157,184,255'
          };
        });
      };
      build();
      onResize.push(build);

      hero.addEventListener('pointermove', (e) => {
        const r = canvas.getBoundingClientRect();
        mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
      }, { passive: true });
      hero.addEventListener('pointerleave', () => { mouse.x = mouse.y = -9999; });

      tasks.push(() => {
        if (!heroVisible) return;
        ctx.clearRect(0, 0, w, h);
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          const dx = p.x - mouse.x, dy = p.y - mouse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 14400) { const d = Math.sqrt(d2) || 1; p.x += (dx / d) * 0.9; p.y += (dy / d) * 0.9; }
          p.x += p.vx; p.y += p.vy;
          if (p.x < -10) p.x = w + 10; else if (p.x > w + 10) p.x = -10;
          if (p.y < -10) p.y = h + 10; else if (p.y > h + 10) p.y = -10;
          ctx.fillStyle = 'rgba(' + p.c + ',0.85)';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
          for (let j = i + 1; j < particles.length; j++) {
            const q = particles[j];
            const ax = p.x - q.x, ay = p.y - q.y;
            const dist2 = ax * ax + ay * ay;
            if (dist2 < LINK * LINK) {
              ctx.strokeStyle = 'rgba(' + p.c + ',' + ((1 - Math.sqrt(dist2) / LINK) * 0.28).toFixed(3) + ')';
              ctx.lineWidth = 1;
              ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
            }
          }
        }
      });
    }

    /* Rotador con efecto de descifrado */
    const rot = $('#rotator');
    if (rot && !reduceMotion) {
      const phrases = CONFIG.rotator;
      const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      let idx = 0;
      const scramble = (to) => {
        const from = rot.textContent;
        const len = Math.max(from.length, to.length);
        const t0 = performance.now();
        const dur = 900;
        const frame = (now) => {
          const t = clamp((now - t0) / dur, 0, 1);
          let out = '';
          for (let i = 0; i < to.length; i++) {
            const settle = (i / len) * 0.7 + 0.1;
            if (to[i] === ' ') out += ' ';
            else out += t > settle ? to[i] : glyphs[(Math.random() * glyphs.length) | 0].toLowerCase();
          }
          rot.textContent = out;
          if (t < 1) requestAnimationFrame(frame); else rot.textContent = to;
        };
        requestAnimationFrame(frame);
      };
      setInterval(() => {
        if (document.hidden || !heroVisible) return;
        idx = (idx + 1) % phrases.length;
        scramble(phrases[idx]);
      }, 3600);
    }

    /* Tarjeta "Ruta de tu licencia" (se anima en bucle) */
    const card = $('#route-card');
    if (card) {
      const items = $$('.route-card__list li', card);
      const pct = $('#route-pct');
      const progress = [14, 38, 62, 86, 100];
      let step = reduceMotion ? items.length : 0;
      const paint = () => {
        items.forEach((li, i) => {
          li.classList.toggle('is-done', i < step);
          li.classList.toggle('is-current', i === step && step < items.length);
        });
        const p = progress[Math.min(step, progress.length - 1)];
        card.style.setProperty('--rp', (p / 100).toFixed(2));
        if (pct) pct.textContent = p + '%';
      };
      paint();
      if (!reduceMotion) {
        const loop = () => {
          if (!document.hidden) {
            step = step >= items.length ? 0 : step + 1;
            paint();
          }
          setTimeout(loop, step >= items.length ? 2800 : 1300);
        };
        setTimeout(loop, 1300);
      }
    }

    /* Parallax con el mouse + scroll */
    if (!reduceMotion) {
      const orbit = $('#orbit');
      const copy = $('.hero__copy', hero);
      const aurora = $('.hero__aurora', hero);
      const road = $('.hero__road', hero);
      let nx = 0, ny = 0, cx = 0, cy = 0;
      if (finePointer) {
        hero.addEventListener('pointermove', (e) => {
          const r = hero.getBoundingClientRect();
          nx = ((e.clientX - r.left) / r.width - 0.5) * 2;
          ny = ((e.clientY - r.top) / r.height - 0.5) * 2;
        }, { passive: true });
        hero.addEventListener('pointerleave', () => { nx = 0; ny = 0; });
      }
      tasks.push(() => {
        if (!heroVisible) return;
        cx = lerp(cx, nx, 0.06); cy = lerp(cy, ny, 0.06);
        const s = state.y;
        if (orbit) orbit.style.transform = 'perspective(1000px) rotateY(' + (cx * 9).toFixed(2) + 'deg) rotateX(' + (-cy * 9).toFixed(2) + 'deg) translateY(' + (s * -0.06).toFixed(1) + 'px)';
        if (card) { card.style.setProperty('--rx', (cx * -16).toFixed(1) + 'px'); card.style.setProperty('--ry', (cy * -12 + s * -0.1).toFixed(1) + 'px'); }
        if (aurora) aurora.style.transform = 'translate3d(' + (cx * -22).toFixed(1) + 'px,' + (cy * -16 + s * 0.12).toFixed(1) + 'px,0)';
        if (copy) copy.style.transform = 'translate3d(0,' + (s * 0.1).toFixed(1) + 'px,0)';
        if (road) road.style.transform = 'translate3d(0,' + (s * 0.22).toFixed(1) + 'px,0)';
      });
    }
  }

  /* ------------------------------------------------------------------
     TICKER: velocidad y dirección reaccionan al scroll
     ------------------------------------------------------------------ */
  function initTicker() {
    const track = $('#ticker-track');
    if (!track || reduceMotion) return;
    const group = track.firstElementChild;
    let width = group.getBoundingClientRect().width;
    let x = 0, dir = 1, speed = 1;
    onResize.push(() => { width = group.getBoundingClientRect().width; });
    tasks.push((t, dt) => {
      if (Math.abs(state.vel) > 1.2) dir = state.vel > 0 ? 1 : -1;
      const target = 1.15 + Math.min(Math.abs(state.vel) * 0.55, 12);
      speed = lerp(speed, target, 0.07);
      x -= speed * dir * dt;
      if (x <= -width) x += width;
      if (x > 0) x -= width;
      track.style.transform = 'translate3d(' + x.toFixed(2) + 'px,0,0)';
    });
  }

  /* ------------------------------------------------------------------
     MANIFIESTO: palabras que se encienden con el scroll
     ------------------------------------------------------------------ */
  function initManifesto() {
    const el = $('#manifesto-text');
    if (!el) return;
    const words = $$('.w', el);
    if (reduceMotion) { words.forEach((w) => w.classList.add('is-lit')); return; }
    let lit = -1;
    tasks.push(() => {
      const r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > state.vh + 200) return;
      const p = clamp((state.vh * 0.86 - r.top) / (state.vh * 0.42 + r.height), 0, 1);
      const count = Math.round(p * words.length);
      if (count === lit) return;
      lit = count;
      words.forEach((w, i) => w.classList.toggle('is-lit', i < count));
    });
  }

  /* ------------------------------------------------------------------
     CURSOS: tarjetas apiladas (las anteriores se hunden al ser cubiertas)
     ------------------------------------------------------------------ */
  function initStack() {
    const stack = $('#course-stack');
    if (!stack) return;
    const cards = $$('.course-card', stack);
    const ghosts = cards.map((c) => $('.course-card__ghost', c));
    let stickyTops = [];
    const measure = () => { stickyTops = cards.map((c) => parseFloat(getComputedStyle(c).top) || 0); };
    measure();
    onResize.push(measure);
    if (reduceMotion) return;

    const cache = cards.map(() => ({ sc: '', cover: '', gy: '' }));
    tasks.push(() => {
      const sr = stack.getBoundingClientRect();
      if (sr.bottom < -300 || sr.top > state.vh + 300) return;
      const rects = cards.map((c) => c.getBoundingClientRect());
      cards.forEach((card, i) => {
        let covered = 0;
        const bottomStuck = stickyTops[i] + rects[i].height;
        for (let j = i + 1; j < cards.length; j++) {
          const span = bottomStuck - stickyTops[j];
          covered += span > 0 ? clamp((bottomStuck - rects[j].top) / span, 0, 1) : 0;
        }
        const sc = (1 - Math.min(covered * 0.035, 0.16)).toFixed(4);
        const cover = Math.min(covered * 0.3, 0.72).toFixed(3);
        const gy = ((rects[i].top + rects[i].height / 2 - state.vh / 2) * -0.07).toFixed(1) + 'px';
        if (cache[i].sc !== sc) { card.style.setProperty('--sc', sc); cache[i].sc = sc; }
        if (cache[i].cover !== cover) { card.style.setProperty('--cover', cover); cache[i].cover = cover; }
        if (ghosts[i] && cache[i].gy !== gy) { ghosts[i].style.setProperty('--gy', gy); cache[i].gy = gy; }
      });
    });
  }

  /* ------------------------------------------------------------------
     PROCESO: la línea se llena y el marcador avanza con el scroll
     ------------------------------------------------------------------ */
  function initRoute() {
    const wrap = $('#route');
    if (!wrap) return;
    const line = $('.route__line', wrap);
    const steps = $$('.route__step', wrap);
    let rp = 0;
    tasks.push(() => {
      const wr = wrap.getBoundingClientRect();
      if (wr.bottom < -200 || wr.top > state.vh + 200) return;
      const lr = line.getBoundingClientRect();
      const focusY = state.vh * 0.56;
      const target = clamp((focusY - lr.top) / lr.height, 0, 1);
      rp = reduceMotion ? target : lerp(rp, target, 0.14);
      wrap.style.setProperty('--rp', rp.toFixed(4));
      steps.forEach((step) => {
        const node = $('.route__node', step).getBoundingClientRect();
        step.classList.toggle('is-active', node.top + node.height / 2 < focusY);
      });
    });
  }

  /* ------------------------------------------------------------------
     INTERACCIONES: spotlight, botones magnéticos, FAQ
     ------------------------------------------------------------------ */
  function initInteractions() {
    if (finePointer) {
      $$('[data-spotlight]').forEach((el) => {
        el.addEventListener('pointermove', (e) => {
          const r = el.getBoundingClientRect();
          el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
          el.style.setProperty('--my', (e.clientY - r.top) + 'px');
        });
      });
      if (!reduceMotion) {
        $$('[data-magnetic]').forEach((el) => {
          el.addEventListener('pointermove', (e) => {
            const r = el.getBoundingClientRect();
            el.style.setProperty('--tx', ((e.clientX - r.left - r.width / 2) * 0.22).toFixed(1) + 'px');
            el.style.setProperty('--ty', ((e.clientY - r.top - r.height / 2) * 0.32).toFixed(1) + 'px');
          });
          el.addEventListener('pointerleave', () => {
            el.style.setProperty('--tx', '0px');
            el.style.setProperty('--ty', '0px');
          });
        });
      }
    }

    // Acordeón FAQ (uno abierto a la vez)
    const items = $$('.acc');
    items.forEach((item) => {
      const btn = $('.acc__btn', item);
      btn.addEventListener('click', () => {
        const open = !item.classList.contains('is-open');
        items.forEach((other) => {
          other.classList.remove('is-open');
          $('.acc__btn', other).setAttribute('aria-expanded', 'false');
        });
        if (open) { item.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); }
      });
    });
  }

  /* ------------------------------------------------------------------
     HORARIO: "Abierto ahora" calculado en hora de México
     ------------------------------------------------------------------ */
  function initStatus() {
    const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const weekdayIndex = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const { days, open, close } = CONFIG.schedule;
    const fmt = (h) => { const hr = h % 12 || 12; return hr + ':00 ' + (h < 12 ? 'AM' : 'PM'); };

    const nowMX = () => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: CONFIG.timezone, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23'
      }).formatToParts(new Date());
      const get = (type) => (parts.find((p) => p.type === type) || {}).value;
      return { day: weekdayIndex[get('weekday')], mins: parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10) };
    };

    const render = () => {
      const { day, mins } = nowMX();
      const workday = days.includes(day);
      let isOpen = false;
      let text;
      if (workday && mins >= open * 60 && mins < close * 60) {
        isOpen = true;
        text = 'Abierto ahora, cerramos a las ' + fmt(close);
      } else if (workday && mins < open * 60) {
        text = 'Cerrado, abrimos hoy a las ' + fmt(open);
      } else {
        let offset = 1;
        while (!days.includes((day + offset) % 7) && offset < 8) offset++;
        const label = offset === 1 ? 'mañana' : 'el ' + dayNames[(day + offset) % 7];
        text = 'Cerrado, abrimos ' + label + ' a las ' + fmt(open);
      }
      $$('[data-status]').forEach((el) => { el.textContent = text; });
      $$('[data-status-wrap]').forEach((el) => el.classList.toggle('is-open', isOpen));
      $$('#hours-list li').forEach((li) => li.classList.toggle('is-today', Number(li.dataset.day) === day));
    };
    render();
    setInterval(render, 60000);
  }

  /* ------------------------------------------------------------------
     WHATSAPP: enlaces, formulario y botón flotante
     ------------------------------------------------------------------ */
  function initWhatsApp() {
    $$('[data-wa]').forEach((a) => {
      a.href = waURL(a.dataset.waText || '');
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    });

    const form = $('#lead-form');
    if (form) {
      const fields = {
        nombre: { el: $('#f-nombre'), err: $('#e-nombre') },
        telefono: { el: $('#f-tel'), err: $('#e-tel') }
      };
      const digits = (v) => v.replace(/\D/g, '').replace(/^52(\d{10})$/, '$1');
      const validators = {
        nombre: (v) => (v.trim().length < 3 ? 'Escribe tu nombre completo.' : ''),
        telefono: (v) => (digits(v).length !== 10 ? 'Escribe un teléfono de 10 dígitos.' : '')
      };
      const check = (key) => {
        const { el, err } = fields[key];
        const msg = validators[key](el.value);
        err.textContent = msg;
        el.setAttribute('aria-invalid', msg ? 'true' : 'false');
        return !msg;
      };
      Object.keys(fields).forEach((key) => {
        fields[key].el.addEventListener('blur', () => check(key));
        fields[key].el.addEventListener('input', () => { if (fields[key].el.getAttribute('aria-invalid') === 'true') check(key); });
      });

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const results = Object.keys(fields).map(check);
        if (results.includes(false)) {
          const firstBad = Object.keys(fields).find((k) => fields[k].el.getAttribute('aria-invalid') === 'true');
          if (firstBad) fields[firstBad].el.focus();
          return;
        }
        const nombre = fields.nombre.el.value.trim();
        const tel = digits(fields.telefono.el.value);
        const curso = $('#f-curso').value;
        const extra = $('#f-msg').value.trim();
        const text = [
          'Hola CECAOP, soy ' + nombre + '.',
          'Me interesa: ' + curso + '.',
          'Mi teléfono: ' + tel + '.',
          extra
        ].filter(Boolean).join('\n');
        const url = waURL(text);
        window.open(url, '_blank', 'noopener');
        const success = $('#form-success');
        $('#wa-retry').href = url;
        success.hidden = false;
        success.focus();
        setTimeout(() => { form.reset(); Object.values(fields).forEach((f) => f.el.setAttribute('aria-invalid', 'false')); }, 300);
        setTimeout(() => { success.hidden = true; }, 9000);
      });
    }

    // Burbuja del botón flotante (una vez por sesión)
    const float = $('#wa-float');
    if (float) {
      let seen = false;
      try { seen = sessionStorage.getItem('cecaop-tip') === '1'; } catch (err) { /* sin storage */ }
      if (!seen) {
        setTimeout(() => {
          float.classList.add('is-tip');
          try { sessionStorage.setItem('cecaop-tip', '1'); } catch (err) { /* sin storage */ }
          setTimeout(() => float.classList.remove('is-tip'), 6500);
        }, 8000);
      }
      float.addEventListener('click', () => float.classList.remove('is-tip'));
    }
  }

  /* ------------------------------------------------------------------
     BUCLE PRINCIPAL
     ------------------------------------------------------------------ */
  function startLoop() {
    let last = performance.now();
    const frame = (now) => {
      const dt = clamp((now - last) / 16.667, 0.2, 3);
      last = now;
      state.y = window.scrollY;
      state.vel = lerp(state.vel, state.y - state.lastY, 0.12);
      state.lastY = state.y;
      for (let i = 0; i < tasks.length; i++) {
        try { tasks[i](now, dt); } catch (err) { console.warn('[CECAOP] tarea falló:', err); tasks.splice(i--, 1); }
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        state.vh = window.innerHeight;
        state.vw = window.innerWidth;
        onResize.forEach((fn) => safe('resize', fn));
      }, 150);
    });
  }

  /* ------------------------------------------------------------------
     ARRANQUE
     ------------------------------------------------------------------ */
  safe('prepare', prepare);
  safe('header', initHeader);
  safe('reveal', initReveal);
  safe('ticker', initTicker);
  safe('manifesto', initManifesto);
  safe('stack', initStack);
  safe('route', initRoute);
  safe('interactions', initInteractions);
  safe('status', initStatus);
  safe('whatsapp', initWhatsApp);
  safe('hero', initHero);
  startLoop();

  try {
    initLoader(() => { /* el hero ya se anima por CSS al recibir .is-ready */ });
  } catch (err) {
    console.warn('[CECAOP] loader falló:', err);
    root.classList.remove('is-loading');
    root.classList.add('is-ready');
    const l = $('#loader');
    if (l) l.style.display = 'none';
  }
})();
