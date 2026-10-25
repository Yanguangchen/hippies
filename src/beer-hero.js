import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createPourStory } from './pour-story.js';
import { createCardDeck } from './card-deck.js';

const stage = document.querySelector('.hero-stage');
const canvas = stage.querySelector('.beer-canvas');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const LOOP_SECONDS = 12;
const BUBBLES = 90;
// Mug and faucet dimensions from tools/create-beer.py, in glTF (y-up) units.
const BEER_BOTTOM = .314, BEER_HEIGHT = 1.886, BEER_RADIUS = .66, BEER_TAPER = .009, MUG_HEIGHT = 2.313;
const SPOUT_X = -.17, SPOUT_TIP = 2.814;
let renderer;

// The card deck needs no WebGL, so it starts before (and survives) the 3D setup.
const deck = createCardDeck();
deck.enabled = !motion.matches;
motion.addEventListener('change', () => { deck.enabled = !motion.matches; });

try {
  // Smooth silhouettes at native resolution.
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 20);
  camera.position.set(0, 1.2, 8.8);
  camera.lookAt(0, 0, 0);
  // A small bar of warm and cool light panels, prefiltered once, gives chrome and glass
  // something real to reflect. Image-based only: no runtime lights or image downloads.
  const studio = new THREE.Scene();
  studio.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: 0x3a3029, side: THREE.BackSide })));
  const barTop = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ color: 0x4f3622 }));
  barTop.rotation.x = -Math.PI / 2; barTop.position.y = -4.8; studio.add(barTop);
  for (const [w, h, color, power, x, y, z, rx, ry] of [
    [6, 3, 0xfff1dc, 4, 0, 4.9, 0, Math.PI / 2, 0], [.7, 8, 0xffe2b0, 6, -4.9, 0, 1, 0, Math.PI / 2],
    [.45, 8, 0xdfeaff, 4.5, 4.9, .5, -1, 0, -Math.PI / 2], [4, 1.2, 0xffb347, 2.5, 0, -1.5, -4.9, 0, 0],
    [2.2, 4, 0xffffff, 2.2, 2, 1, 4.9, 0, Math.PI]]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide }));
    panel.position.set(x, y, z); panel.rotation.set(rx, ry, 0); studio.add(panel);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studio, .02).texture;
  pmrem.dispose();
  studio.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  const chromeMaterial = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, metalness: 1, roughness: .07 });
  const brassMaterial = new THREE.MeshStandardMaterial({ color: 0xd9a95a, metalness: 1, roughness: .2 });
  const gripMaterial = new THREE.MeshStandardMaterial({ color: 0x151312, metalness: 0, roughness: .26 });
  const iceMaterial = new THREE.MeshStandardMaterial({ color: 0xd8f1ff, emissive: 0x2e5f7a, emissiveIntensity: .4, metalness: 0, roughness: .06 });
  // Clear glass: a black, very smooth dielectric whose reflections are added over the page
  // (premultiplied: colour plus a faint darkening), so edges and flutes catch the light
  // while the body stays see-through.
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x000000, metalness: 0, roughness: .03, ior: 1.5, envMapIntensity: 1.5, opacity: .06,
    transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const beerMaterial = new THREE.MeshBasicMaterial({ color: 0xd79827, vertexColors: true, transparent: false, opacity: 1 });
  const foamMaterial = new THREE.MeshBasicMaterial({ color: 0xffefd0, vertexColors: true, transparent: false, opacity: 1 });
  // Frost climbs the glass from the base during the scroll story, then thins where beer
  // fills behind it. 3D noise on the lathe's own positions needs no UVs and has no seam;
  // ridged noise reads as crystals.
  const frostMaterial = new THREE.ShaderMaterial({
    uniforms: { frost: { value: 0 }, wet: { value: 0 }, beerTop: { value: 0 } }, transparent: true, depthWrite: false,
    vertexShader: `varying vec3 vPosition; varying float vRim;
      void main() {
        vPosition = position;
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        vRim = 1.0 - abs(dot(normalize(normalMatrix * normal), normalize(-view.xyz)));
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: `uniform float frost, wet, beerTop; varying vec3 vPosition; varying float vRim;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1) * 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float noise(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
          mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
      }
      void main() {
        float patchy = noise(vPosition * 3.1), grain = noise(vPosition * 11.0 + 4.0);
        float crystal = pow(1.0 - abs(noise(vPosition * 7.0 + 9.0) * 2.0 - 1.0), 5.0);
        float height = vPosition.y / ${MUG_HEIGHT.toFixed(3)} + (patchy - 0.5) * 0.28, front = frost * 1.3 - 0.15;
        float covered = 1.0 - smoothstep(front - 0.07, front + 0.01, height);
        float edge = (1.0 - smoothstep(0.0, 0.045, abs(height - front))) * (1.0 - frost);
        float glint = step(0.93, hash(floor(vPosition * 64.0)));
        float behindBeer = wet * (1.0 - smoothstep(beerTop - 0.06, beerTop, vPosition.y));
        float cover = (0.16 + 0.26 * grain) * (1.0 - 0.72 * behindBeer) + 0.42 * crystal * (1.0 - 0.4 * behindBeer);
        float alpha = covered * (cover * (0.7 + 0.6 * vRim) + glint * 0.35) + edge * 0.5;
        gl_FragColor = vec4(mix(vec3(0.78, 0.9, 0.98), vec3(1.0), crystal * 0.7 + glint), min(alpha, 0.82));
      }`,
  });
  // Bubbles ride just outside the opaque beer, so the beer itself hides the far side.
  const bubbleMaterial = new THREE.ShaderMaterial({
    uniforms: { halfHeight: { value: 1 } }, transparent: true, depthWrite: false,
    vertexShader: `attribute float size; attribute float alpha; uniform float halfHeight; varying float vAlpha;
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * view;
        gl_PointSize = size * projectionMatrix[1][1] * halfHeight / -view.z;
        vAlpha = alpha;
      }`,
    fragmentShader: `varying float vAlpha;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0; float r = length(p);
        if (r > 1.0) discard;
        float rim = smoothstep(0.55, 0.9, r) * (1.0 - smoothstep(0.9, 1.0, r));
        float glint = 1.0 - smoothstep(0.0, 0.32, length(p + vec2(0.35, 0.35)));
        gl_FragColor = vec4(1.0, 0.95, 0.82, (rim * 0.75 + glint * 0.8 + 0.1) * vAlpha);
      }`,
  });
  // Bake a simple directional tint once, so depth is readable without per-frame lighting.
  function shadeGeometry(geometry) {
    const normals = geometry.attributes.normal;
    const colors = new Float32Array(normals.count * 3);
    for (let i = 0; i < normals.count; i++) {
      const shade = .72 + .28 * Math.max(0, normals.getX(i) * -.48 + normals.getY(i) * .64 + normals.getZ(i) * .60);
      colors.fill(shade, i * 3, i * 3 + 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  // Centre the tower-to-handle silhouette; the mug's axis stays the pivot for drag rotation.
  const pivot = new THREE.Group(); pivot.position.set(.24, -2.05, 0); scene.add(pivot);
  const pint = new THREE.Group(); pivot.add(pint);
  let model, liquid, foam, stream, handle, ice, frost;
  let foamBase, liquidBase, previousFill = -1;
  let visible = false, failed = false, raf = 0, timer = 0, last = 0, elapsed = 0, bubbleTime = 0;
  let yaw = -.12, pitch = 0, dragging = false, previousX = 0, previousY = 0;
  const iceX = [.22, -.25, .05], iceZ = [.30, .35, -.16];
  const clamp = THREE.MathUtils.clamp;
  const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  let seed = 7;
  const random = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  const bubbleGeometry = new THREE.BufferGeometry();
  bubbleGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BUBBLES * 3), 3).setUsage(THREE.DynamicDrawUsage));
  bubbleGeometry.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(BUBBLES), 1).setUsage(THREE.DynamicDrawUsage));
  bubbleGeometry.setAttribute('size', new THREE.BufferAttribute(Float32Array.from({ length: BUBBLES }, () => .04 + random() * .04), 1));
  const bubbleSeeds = Array.from({ length: BUBBLES }, () => [random() * Math.PI * 2, .22 + random() * .3, random(), random() * 6.3]);
  const bubbles = new THREE.Points(bubbleGeometry, bubbleMaterial);
  // Drawn after the frost so the fizz still reads through it.
  bubbles.frustumCulled = false; bubbles.renderOrder = 3; bubbles.visible = false; pint.add(bubbles);

  function riseBubbles(surface) {
    const positions = bubbleGeometry.attributes.position, alpha = bubbleGeometry.attributes.alpha;
    bubbleSeeds.forEach(([angle, speed, offset, sway], i) => {
      const rise = (offset + bubbleTime * speed) % 1;
      const y = BEER_BOTTOM + .05 + rise * Math.max(0, surface - BEER_BOTTOM - .11);
      // The beer's radius follows the mug's slight taper; bubbles sit just outside it.
      const radius = BEER_RADIUS + BEER_TAPER * (y - BEER_BOTTOM) / BEER_HEIGHT + .008;
      const a = angle + Math.sin(bubbleTime * 1.6 + sway) * .035;
      positions.setXYZ(i, Math.cos(a) * radius, y, Math.sin(a) * radius);
      alpha.setX(i, Math.min(1, rise * 12, (1 - rise) * 8));
    });
    positions.needsUpdate = alpha.needsUpdate = true;
  }

  function pose() {
    const t = motion.matches ? 8.5 : elapsed % LOOP_SECONDS;
    const { glide, pour } = story.state;
    const loopPouring = t >= .65 && t < 4.75;
    const phase = t < .65 ? 'ready' : loopPouring ? 'pouring' : t < 7 ? 'ice' : t < 10 ? 'hold' : 'reset';
    if (stage.dataset.beerPhase !== phase) stage.dataset.beerPhase = phase;
    const cycle = String(Math.floor(elapsed / LOOP_SECONDS));
    if (stage.dataset.beerCycle !== cycle) stage.dataset.beerCycle = cycle;
    // Halfway through the scroll glide, out of frame, an empty mug replaces the looping one;
    // scroll then frosts it and pours.
    const scrolled = glide > .5, poured = ease((pour - .55) / .31);
    const fill = scrolled ? .06 + .94 * poured : .06 + .94 * ease((t - .65) / 4.1);
    const pouring = scrolled ? pour > .55 && pour < .86 : !glide && loopPouring;
    // The full mug leaves below the frame; an empty one returns before the tap opens.
    let y = t >= 10 ? -4.5 * ease((t - 10) / 1.1) : -4.5 * (1 - ease(t / .6));
    if (motion.matches) y = 0;
    if (scrolled) y = -4.5 * (1 - ease((glide - .5) / .5));
    else y += (-4.5 - y) * ease(glide / .5);
    pint.position.y = y;
    pint.visible = scrolled || t < 11.15 || motion.matches;
    pivot.rotation.set(pitch, yaw, 0);
    const surface = BEER_BOTTOM + BEER_HEIGHT * fill;
    // Keep the liquid inside the mug's taper at every fill height, not just when full.
    if (fill !== previousFill) {
      const positions = liquid.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const y = liquidBase[i * 3 + 1];
        const level = clamp((y - BEER_BOTTOM) / BEER_HEIGHT, 0, 1);
        const radiusScale = (BEER_RADIUS + BEER_TAPER * level * fill) / (BEER_RADIUS + BEER_TAPER * level);
        positions.setXYZ(i, liquidBase[i * 3] * radiusScale, BEER_BOTTOM + (y - BEER_BOTTOM) * fill, liquidBase[i * 3 + 2] * radiusScale);
      }
      positions.needsUpdate = true; previousFill = fill;
    }
    liquid.visible = !scrolled || poured > 0;
    // Narrow the foam as it descends into the tapered mug.
    const foamRadius = (BEER_RADIUS + BEER_TAPER * fill) / (BEER_RADIUS + BEER_TAPER);
    foam.scale.set(foamRadius, 1, foamRadius);
    foam.position.y = foamBase - BEER_HEIGHT * (1 - fill);
    foam.visible = fill > .1;
    stream.visible = pouring;
    stream.position.set(SPOUT_X, (SPOUT_TIP + surface) / 2, 0);
    stream.scale.set(1, SPOUT_TIP - surface, 1);
    // The tap handle pulls forward, toward the spout, to open.
    handle.rotation.z = scrolled ? -.55 * (ease((pour - .52) / .05) - ease((pour - .85) / .04))
      : -.55 * (ease((t - .25) / .4) - ease((t - 4.65) / .35)) * (1 - ease(glide / .25));
    ice.forEach((cube, i) => {
      const age = t - (4.85 + i * .58);
      cube.visible = !scrolled && age >= 0 && t < 11.15;
      const drop = clamp(age / .65, 0, 1);
      const landing = BEER_BOTTOM + BEER_HEIGHT + .12;
      const bob = age > .65 && t < 7 ? Math.sin((age - .65) * 10) * .10 * Math.exp(-(age - .65) * 1.7) : 0;
      cube.position.set(iceX[i], 3.85 - (3.85 - landing) * drop * drop + bob, iceZ[i]);
      cube.rotation.set(.35 + drop * .8 + i, .4 + drop * .7, .2 + i * .7);
    });
    const frosted = scrolled ? ease((pour - .12) / .28) : 0;
    frost.visible = frosted > 0; frostMaterial.uniforms.frost.value = frosted;
    frostMaterial.uniforms.wet.value = scrolled ? poured : 0; frostMaterial.uniforms.beerTop.value = surface + .12;
    glassMaterial.opacity = .06 + .12 * frosted;
    bubbles.visible = scrolled && poured > .08;
    if (bubbles.visible) riseBubbles(surface);
    return t;
  }

  function stop() { cancelAnimationFrame(raf); clearTimeout(timer); raf = timer = 0; last = 0; }
  function requestDraw() {
    if (!model || failed || !visible || document.hidden || raf) return;
    clearTimeout(timer); timer = 0;
    raf = requestAnimationFrame(draw);
  }
  function draw(now) {
    raf = 0;
    if (!model || failed || !visible || document.hidden) return;
    // The loop clock pauses while the scroll story owns the mug.
    const looping = !story.state.glide, dt = last ? (now - last) / 1000 : 0;
    if (!motion.matches && looping) elapsed += dt; else bubbleTime += dt;
    last = now;
    const t = pose(); renderer.render(scene, camera);
    if (!motion.matches && !looping) {
      // Scroll supplies story frames; only rising bubbles need the display clock.
      if (bubbles.visible) requestDraw(); else last = 0;
    } else if (!motion.matches) {
      // Active motion follows the display clock, exactly like pointer updates.
      // Timers are only for still beats, where no GPU work is needed.
      if (t >= 7 && t < 10) timer = setTimeout(requestDraw, (10 - t) * 1000);
      else if (t >= 11.15) timer = setTimeout(requestDraw, (LOOP_SECONDS - t) * 1000);
      else requestDraw();
    }
  }

  function fitCanvas() {
    const width = stage.clientWidth, height = Math.max(1, stage.clientHeight - 52);
    if (!width) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25, 1024 / Math.max(width, height)));
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.position.z = camera.aspect < .8 ? 9.6 : 8.8;
    camera.updateProjectionMatrix(); bubbleMaterial.uniforms.halfHeight.value = canvas.height / 2; requestDraw();
  }
  const resize = new ResizeObserver(fitCanvas); resize.observe(stage); fitCanvas();
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible) stop(); else requestDraw();
  });
  intersection.observe(stage);
  const story = createPourStory(stage, requestDraw);
  story.enabled = !motion.matches;
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else requestDraw(); });
  motion.addEventListener('change', () => { stop(); story.enabled = !motion.matches && !failed; requestDraw(); });
  canvas.addEventListener('pointerdown', e => {
    dragging = true; previousX = e.clientX; previousY = e.clientY; canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    yaw = clamp(yaw + (e.clientX - previousX) * .006, -.65, .65);
    pitch = clamp(pitch + (e.clientY - previousY) * .003, -.15, .15);
    previousX = e.clientX; previousY = e.clientY; requestDraw();
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, () => { dragging = false; });
  canvas.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(e.key)) return;
    e.preventDefault();
    if (e.key === 'Home') { yaw = -.12; pitch = 0; }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') yaw = clamp(yaw + (e.key === 'ArrowLeft' ? -.15 : .15), -.65, .65);
    else pitch = clamp(pitch + (e.key === 'ArrowUp' ? -.08 : .08), -.15, .15);
    requestDraw();
  });
  function fallback() {
    failed = true; stop(); story.enabled = false; resize.disconnect(); intersection.disconnect();
    canvas.tabIndex = -1; stage.classList.remove('beer-ready'); renderer.dispose();
  }
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); fallback(); });
  new GLTFLoader().load(__BEER_MODEL_URL__, gltf => {
    if (failed) return;
    model = gltf.scene;
    // Materials follow the Blender material names; the tap handle mixes chrome, brass and grip.
    const materials = { Crystal: glassMaterial, Amber: beerMaterial, Foam: foamMaterial, IceMaterial: iceMaterial,
      Chrome: chromeMaterial, Brass: brassMaterial, HandleBlack: gripMaterial };
    model.traverse(o => {
      if (!o.isMesh) return;
      o.material = materials[o.material.name] || chromeMaterial;
      if (o.material.vertexColors) shadeGeometry(o.geometry);
    });
    // Separate the stationary tap from the mug that leaves at the end of a loop.
    for (const child of [...model.children]) {
      if (['Tap', 'TapHandle'].includes(child.name)) pivot.add(child);
      else if (child.name !== 'Ice') pint.add(child);
    }
    liquid = pint.getObjectByName('Liquid'); foam = pint.getObjectByName('Head');
    const mug = pint.getObjectByName('Mug');
    frost = new THREE.Mesh(mug.geometry, frostMaterial); frost.renderOrder = 2; mug.add(frost);
    liquidBase = liquid.geometry.attributes.position.array.slice();
    foamBase = foam.position.y;
    handle = pivot.getObjectByName('TapHandle');
    const iceTemplate = model.getObjectByName('Ice');
    ice = Array.from({ length: 3 }, () => { const cube = iceTemplate.clone(); pint.add(cube); return cube; });
    stream = new THREE.Mesh(new THREE.CylinderGeometry(.038, .05, 1, 8), beerMaterial); pivot.add(stream);
    shadeGeometry(stream.geometry);
    // The mug print and tap badge use the site's type: Anton for the wordmark, Inter for small caps.
    function spaced(ctx, text, x, y, spacing) {
      const widths = [...text].map(c => ctx.measureText(c).width);
      let cursor = x - (widths.reduce((sum, w) => sum + w, 0) + spacing * (text.length - 1)) / 2;
      [...text].forEach((c, i) => { ctx.fillText(c, cursor, y); cursor += widths[i] + spacing; });
    }
    function wordmark(ctx, x, y, size, color) {
      ctx.font = `400 ${size}px Anton, Impact, sans-serif`;
      const word = ctx.measureText('HIPPIES').width + size * .24, dot = ctx.measureText('.').width;
      const left = x - (word + dot) / 2;
      ctx.fillStyle = color; spaced(ctx, 'HIPPIES', left + word / 2, y, size * .04);
      ctx.fillStyle = '#e0a852'; ctx.fillText('.', left + word, y);
    }
    const printCanvas = document.createElement('canvas'); printCanvas.width = 512; printCanvas.height = 256;
    const badgeCanvas = document.createElement('canvas'); badgeCanvas.width = 128; badgeCanvas.height = 256;
    const printTexture = new THREE.CanvasTexture(printCanvas), badgeTexture = new THREE.CanvasTexture(badgeCanvas);
    printTexture.colorSpace = badgeTexture.colorSpace = THREE.SRGBColorSpace;
    function paintType() {
      const ctx = printCanvas.getContext('2d');
      ctx.clearRect(0, 0, 512, 256); ctx.textAlign = 'left';
      wordmark(ctx, 256, 132, 96, '#fbf7ef');
      ctx.font = '700 30px Inter, system-ui, sans-serif'; ctx.fillStyle = '#fbf7ef';
      spaced(ctx, 'BAR & GRILL', 256, 184, 7);
      const badge = badgeCanvas.getContext('2d');
      badge.fillStyle = '#13110e'; badge.fillRect(0, 0, 128, 256);
      badge.beginPath(); badge.ellipse(64, 128, 50, 108, 0, 0, Math.PI * 2); badge.fillStyle = '#e0a852'; badge.fill();
      badge.lineWidth = 4; badge.strokeStyle = '#13110e'; badge.beginPath(); badge.ellipse(64, 128, 41, 98, 0, 0, Math.PI * 2); badge.stroke();
      badge.save(); badge.translate(64, 128); badge.rotate(-Math.PI / 2); badge.textAlign = 'left';
      wordmark(badge, 0, 13, 38, '#13110e'); badge.restore();
      printTexture.needsUpdate = badgeTexture.needsUpdate = true;
    }
    paintType();
    document.fonts?.load('400 96px Anton').then(() => document.fonts.load('700 30px Inter')).then(() => { paintType(); requestDraw(); }, () => {});
    // Printed on the smooth band above the flutes, facing the camera; blended after the glass.
    const print = new THREE.Mesh(new THREE.CylinderGeometry(.764, .762, .64, 32, 1, true, -.85, 1.7), new THREE.MeshBasicMaterial({ map: printTexture, transparent: true, depthWrite: false }));
    print.position.y = 1.82; print.renderOrder = 1; pint.add(print);
    // Badge on the front of the tap handle, following its taper.
    const badge = new THREE.Mesh(new THREE.CylinderGeometry(.094, .085, .26, 16, 1, true, -.75, 1.5), new THREE.MeshBasicMaterial({ map: badgeTexture }));
    badge.position.y = .62; handle.add(badge);
    canvas.tabIndex = 0; stage.classList.add('beer-ready'); requestDraw();
  }, undefined, fallback);
} catch {
  renderer?.dispose();
}
