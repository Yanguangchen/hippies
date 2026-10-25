// Scroll choreography for the beer cards. With motion allowed they wait as a stack
// in a pinned viewport, fan out like a hand, deal into their row showing only the
// names, then open one after another to reveal each description. Vertical pinning
// is native sticky positioning; scripts move the cards and grow their details.
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
// Pinned scroll distance, in viewport heights.
const DECK_VIEWPORTS = 2.2;
// A loose stack [x, y, degrees], top card first: it sits square, the rest peek out below.
const STACK = [[0, 0, 0], [-4, 5, -3.5], [4, 10, 2.5], [-3, 15, -2], [3, 20, 4]];

export function createCardDeck() {
  const root = document.documentElement;
  const story = document.querySelector('.deck-story');
  const pin = story?.querySelector('.deck-pin');
  const wrap = pin?.querySelector('.wrap');
  const grid = wrap?.querySelector('.taps-grid');
  const cards = grid ? [...grid.querySelectorAll('.tap')] : [];
  const header = document.querySelector('header');
  const state = { on: false, progress: 0 };
  let wanted = false, metrics = null, target = 0, value = 0, raf = 0, last = 0, pending = 0;

  // Lays the cards out for this viewport and returns their keyframes, or null when even
  // the closed cards cannot share one screen (landscape phones keep the static grid).
  function measure() {
    const height = root.clientHeight;
    const cols = grid.clientWidth >= 940 ? 5 : grid.clientWidth >= 600 ? 3 : 1;
    pin.style.setProperty('--deck-cols', cols);
    pin.classList.toggle('deck-list', cols === 1);
    wrap.style.transform = '';
    for (const card of cards) { card.style.transform = ''; card.style.setProperty('--grow', 0); }
    for (const card of cards) card.style.setProperty('--more-h', `${card.querySelector('.tap-more').scrollHeight}px`);
    const closed = grid.offsetHeight;
    const slots = cards.map(card => ({ x: card.offsetLeft + card.offsetWidth / 2, y: card.offsetTop + card.offsetHeight / 2, w: card.offsetWidth, h: card.offsetHeight }));
    for (const card of cards) card.style.setProperty('--grow', 1);
    const open = grid.offsetHeight;
    for (const card of cards) card.style.setProperty('--grow', 0);
    const headerBottom = header ? header.getBoundingClientRect().bottom : 0, top = headerBottom + 16;
    const room = height - top - Math.max(20, height * .04);
    if (closed > room) return null;
    // The stack sits where the closed cards will be. Like a hand of cards, each card lies
    // over the one before it, so the fan leaves every name showing; a single column of wide
    // cards fans downward as a cascade instead.
    const cx = (Math.min(...slots.map(s => s.x - s.w / 2)) + Math.max(...slots.map(s => s.x + s.w / 2))) / 2;
    const cy = (Math.min(...slots.map(s => s.y - s.h / 2)) + Math.max(...slots.map(s => s.y + s.h / 2))) / 2;
    const list = cols === 1, radius = slots[0].h * 3.5;
    const keys = slots.map((slot, i) => {
      const [jx, jy, jr] = STACK[(cards.length - 1 - i) % STACK.length];
      const offset = i - (cards.length - 1) / 2, angle = offset * (list ? 3 : 11), rad = angle * Math.PI / 180;
      return { sx: cx + jx - slot.x, sy: cy + jy - slot.y, sr: jr, fr: angle,
        fx: cx + (list ? offset * 8 : radius * Math.sin(rad)) - slot.x,
        fy: cy + (list ? offset * slot.h * .7 : radius * (1 - Math.cos(rad))) - slot.y };
    });
    return {
      height, track: height * DECK_VIEWPORTS, keys, scale: list ? .82 : 1, clip: headerBottom + 4,
      // Centre the opened cards; a single column taller than the screen glides up as it opens.
      top: top + Math.max(0, (room - open) / 2), overflow: Math.max(0, open - room),
    };
  }

  function layout() {
    story.style.height = `${metrics.height + metrics.track}px`;
    pin.style.height = `${metrics.height}px`;
    wrap.style.top = `${metrics.top}px`;
    // Cards gliding up end just below the see-through header rather than showing through it.
    pin.style.setProperty('--deck-clip', `${metrics.clip}px`);
    cards.forEach((card, i) => { card.style.zIndex = i + 1; });
  }

  function apply() {
    const m = metrics, q = value;
    const fan = smooth(q / .28), deal = smooth((q - .28) / .3);
    let opened = 0;
    cards.forEach((card, i) => {
      const k = m.keys[i];
      const x = lerp(lerp(k.sx, k.fx, fan), 0, deal), y = lerp(lerp(k.sy, k.fy, fan), 0, deal);
      const r = lerp(lerp(k.sr, k.fr, fan), 0, deal), s = lerp(m.scale, 1, deal);
      card.style.transform = deal < 1 ? `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${r.toFixed(2)}deg) scale(${s.toFixed(3)})` : '';
      // Cards open in turn, left to right (top to bottom in a single column).
      const grow = smooth((q - .6 - i * .05) / .14);
      card.style.setProperty('--grow', grow.toFixed(3));
      opened += grow;
    });
    wrap.style.transform = m.overflow ? `translateY(${(-m.overflow * opened / cards.length).toFixed(1)}px)` : '';
    const step = !q ? 'stack' : fan < 1 ? 'fan' : deal < 1 ? 'deal' : opened < cards.length ? 'open' : 'done';
    if (pin.dataset.deckStep !== step) pin.dataset.deckStep = step;
    state.progress = q;
  }

  const progress = () => clamp(-story.getBoundingClientRect().top / metrics.track, 0, 1);
  function tick(now) {
    raf = 0;
    const dt = last ? Math.min(.1, (now - last) / 1000) : 1 / 60;
    last = now;
    target = progress();
    // Ease toward the scroll position; long jumps (anchor links) only replay their end.
    value = clamp(value, target - .25, target + .25);
    value += (target - value) * (1 - Math.exp(-dt * 8));
    if (Math.abs(target - value) < .0005) value = target;
    apply();
    if (value !== target) raf = requestAnimationFrame(tick); else last = 0;
  }
  function onScroll() { if (!raf) raf = requestAnimationFrame(tick); }

  function enable() {
    root.classList.add('deck-on');
    // A stale stylesheet without the pin rules would strand the cards; keep the static grid.
    if (getComputedStyle(pin).position !== 'sticky' || !(metrics = measure())) { disable(); return; }
    layout();
    value = target = progress();
    addEventListener('scroll', onScroll, { passive: true });
    state.on = true; apply();
  }
  function disable() {
    cancelAnimationFrame(raf); raf = last = 0;
    removeEventListener('scroll', onScroll);
    root.classList.remove('deck-on');
    for (const element of [story, pin, wrap, ...cards]) element.removeAttribute('style');
    pin.classList.remove('deck-list');
    delete pin.dataset.deckStep;
    metrics = null;
    Object.assign(state, { on: false, progress: 0 });
  }

  function sync() {
    pending = 0;
    if (!wanted) { if (state.on) disable(); return; }
    if (!state.on) { enable(); return; }
    const next = measure();
    if (!next) { disable(); return; }
    metrics = next; layout(); target = progress(); apply();
  }
  const schedule = () => { if (!pending) pending = requestAnimationFrame(sync); };
  if (cards.length) {
    // Viewport changes and late fonts change the card sizes.
    addEventListener('resize', schedule);
    document.fonts?.ready.then(schedule);
  }

  return {
    state,
    set enabled(on) {
      wanted = on && cards.length > 0;
      cancelAnimationFrame(pending); sync();
    },
  };
}
