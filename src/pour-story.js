// Scroll choreography for the hero beer mug. Once scrolling starts, the stage moves
// into a sticky viewport inside #taps, glides to its centre, and the taps
// heading eases in beneath it. The renderer reads `state` to frost the glass
// and pour while the pin holds. Vertical pinning is native sticky positioning;
// scripts only animate the glide and the reveals.
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeOut = t => 1 - (1 - clamp(t, 0, 1)) ** 3;
// Scroll distance, in viewport heights, from the centred mug to the pin release.
const REVEAL_VIEWPORTS = 2.5;

export function createPourStory(stage, onChange) {
  const root = document.documentElement;
  const story = document.querySelector('.pour-story');
  const pin = story?.querySelector('.pour-pin');
  const copy = pin?.querySelector('.pour-copy');
  const taps = story?.parentElement;
  const slot = stage.parentElement;
  const heroText = document.querySelector('.hero-inner');
  const header = document.querySelector('header');
  const state = { on: false, glide: 0, pour: 0 };
  let wanted = false, metrics = null, target = 0, value = 0, raf = 0, last = 0, pending = 0;

  // Document-pixel layout for the current viewport, or null when the mug and
  // heading cannot share one screen (landscape phones keep the static page).
  function measure() {
    const y = scrollY, height = root.clientHeight, width = root.clientWidth;
    const box = slot.getBoundingClientRect();
    const top = (header ? header.getBoundingClientRect().bottom : 0) + 8;
    const room = height - top - Math.max(20, height * .04) - copy.offsetHeight - 8;
    const scale = Math.min(1, room / box.height);
    if (!(scale >= .45)) return null;
    const toX = (width - box.width * scale) / 2, toY = top + (room - box.height * scale) / 2;
    const slotTop = box.top + y;
    // The pin sticks when the stage, still riding the hero, reaches its centred height.
    const stick = Math.max(0, slotTop - toY);
    const glide = Math.max(stick, height * .45), reveal = height * REVEAL_VIEWPORTS;
    return {
      width: box.width, height: box.height, viewport: height, scale, glide, reveal,
      fromX: box.left, fromY: slotTop - stick, toX, toY, copyTop: toY + box.height * scale + 8,
      pull: stick - (taps.getBoundingClientRect().top + y), length: height + glide - stick + reveal,
      fade: Math.abs(box.left - toX) > 40,
    };
  }

  function layout() {
    story.style.marginTop = `${metrics.pull}px`;
    story.style.height = `${metrics.length}px`;
    pin.style.height = `${metrics.viewport}px`;
    pin.style.setProperty('--pour-copy-top', `${metrics.copyTop}px`);
    stage.style.width = `${metrics.width}px`;
    stage.style.height = `${metrics.height}px`;
  }

  function apply() {
    const m = metrics;
    const glide = clamp(value / m.glide, 0, 1), pour = clamp((value - m.glide) / m.reveal, 0, 1);
    const e = smooth(glide);
    stage.style.transform = `translate3d(${m.fromX + (m.toX - m.fromX) * e}px,${m.fromY + (m.toY - m.fromY) * e}px,0) scale(${1 + (m.scale - 1) * e})`;
    // The hero copy steps aside only when the mug crosses it on the way to the centre.
    heroText.style.opacity = m.fade ? (1 - smooth(glide * 1.4)).toFixed(3) : '';
    const title = easeOut(pour / .2), sub = easeOut((pour - .38) / .14);
    pin.style.setProperty('--pour-title', title.toFixed(3));
    pin.style.setProperty('--pour-sub', sub.toFixed(3));
    copy.classList.toggle('is-shown', title > .5);
    const step = !glide ? 'hero' : glide < 1 ? 'glide' : pour < .12 ? 'title' : pour < .4 ? 'frost'
      : pour < .52 ? 'subtitle' : pour < .86 ? 'pour' : 'poured';
    if (stage.dataset.pourStep !== step) stage.dataset.pourStep = step;
    state.glide = glide; state.pour = pour;
  }

  function tick(now) {
    raf = 0;
    const dt = last ? Math.min(.1, (now - last) / 1000) : 1 / 60;
    last = now;
    // Ease toward the scroll position so scrubbed motion settles rather than steps;
    // long jumps (anchor links) only replay their final viewport.
    value = clamp(value, target - metrics.viewport, target + metrics.viewport);
    value += (target - value) * (1 - Math.exp(-dt * 8));
    if (Math.abs(target - value) < .5) value = target;
    apply(); onChange();
    if (value !== target) raf = requestAnimationFrame(tick); else last = 0;
  }
  function onScroll() {
    target = scrollY;
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function enable() {
    root.classList.add('pour-on');
    pin.prepend(stage);
    // A stale stylesheet without the pin rules would strand the stage; keep the static page.
    if (getComputedStyle(pin).position !== 'sticky' || !(metrics = measure())) { disable(); return; }
    layout();
    value = target = scrollY;
    addEventListener('scroll', onScroll, { passive: true });
    state.on = true; apply(); onChange();
  }
  function disable() {
    cancelAnimationFrame(raf); raf = last = 0;
    removeEventListener('scroll', onScroll);
    root.classList.remove('pour-on');
    slot.append(stage);
    for (const property of ['transform', 'width', 'height']) stage.style.removeProperty(property);
    story.removeAttribute('style'); pin.removeAttribute('style');
    heroText.style.removeProperty('opacity');
    copy.classList.remove('is-shown');
    delete stage.dataset.pourStep;
    metrics = null;
    const changed = state.on;
    Object.assign(state, { on: false, glide: 0, pour: 0 });
    if (changed) onChange();
  }

  function sync() {
    pending = 0;
    const next = wanted && measure();
    if (!next) { if (state.on) disable(); return; }
    if (!state.on) { enable(); return; }
    if (Object.keys(next).every(key => Math.abs(next[key] - metrics[key]) < .5)) return;
    metrics = next; layout(); target = scrollY; apply(); onChange();
  }
  const schedule = () => { if (!pending) pending = requestAnimationFrame(sync); };
  if (pin && copy && heroText) {
    // Fonts and viewport changes move the hero slot and resize the heading.
    const resize = new ResizeObserver(schedule);
    for (const element of [slot, heroText, copy]) resize.observe(element);
    addEventListener('resize', schedule);
  }

  return {
    state,
    set enabled(on) {
      wanted = on && !!(pin && copy && heroText);
      cancelAnimationFrame(pending); sync();
    },
  };
}
