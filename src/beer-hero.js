import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createPourStory } from './pour-story.js';

const stage = document.querySelector('.hero-stage');
const canvas = stage.querySelector('.beer-canvas');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const LOOP_SECONDS = 12;
const BUBBLES = 90;
let renderer;

try {
  // Smooth silhouettes at native resolution; surfaces stay unlit and matte.
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 20);
  camera.position.set(0, 1.2, 8);
  camera.lookAt(0, 0, 0);
  const glassMaterial = new THREE.MeshBasicMaterial({ color: 0xa7c2c8, transparent: true, opacity: .16, depthWrite: false });
  const beerMaterial = new THREE.MeshBasicMaterial({ color: 0xd79827, vertexColors: true, transparent: false, opacity: 1 });
  const foamMaterial = new THREE.MeshBasicMaterial({ color: 0xffefd0, vertexColors: true, transparent: false, opacity: 1 });
  const tapMaterial = new THREE.MeshBasicMaterial({ color: 0x9e9586, vertexColors: true, transparent: false, opacity: 1 });
  const iceMaterial = new THREE.MeshBasicMaterial({ color: 0xb5e8ff, vertexColors: true, transparent: false, opacity: 1 });
  const handleMaterial = new THREE.MeshBasicMaterial({ color: 0x704222, vertexColors: true, transparent: false, opacity: 1 });
  const glassTint = new THREE.Color(0xa7c2c8), frostTint = new THREE.Color(0xe4f6ff);
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
        float height = vPosition.y / 2.46 + (patchy - 0.5) * 0.28, front = frost * 1.3 - 0.15;
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
  const pivot = new THREE.Group(); pivot.position.y = -1.85; scene.add(pivot);
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
      const y = .26 + rise * Math.max(0, surface - .32);
      // The beer's radius follows the glass taper; bubbles sit just outside it.
      const radius = .538 + .0956 * (y - .19), a = angle + Math.sin(bubbleTime * 1.6 + sway) * .035;
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
    // Halfway through the scroll glide, out of frame, an empty glass replaces the looping pint;
    // scroll then frosts it and pours.
    const scrolled = glide > .5, poured = ease((pour - .55) / .31);
    const fill = scrolled ? .06 + .94 * poured : .06 + .94 * ease((t - .65) / 4.1);
    const pouring = scrolled ? pour > .55 && pour < .86 : !glide && loopPouring;
    // The full pint leaves below the frame; an empty one returns before the tap opens.
    let y = t >= 10 ? -4.5 * ease((t - 10) / 1.1) : -4.5 * (1 - ease(t / .6));
    if (motion.matches) y = 0;
    if (scrolled) y = -4.5 * (1 - ease((glide - .5) / .5));
    else y += (-4.5 - y) * ease(glide / .5);
    pint.position.y = y;
    pint.visible = scrolled || t < 11.15 || motion.matches;
    pivot.rotation.set(pitch, yaw, 0);
    const surface = .19 + 2.03 * fill;
    // Keep the liquid inside the taper at every fill height, not just when full.
    if (fill !== previousFill) {
      const positions = liquid.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const y = liquidBase[i * 3 + 1];
        const level = clamp((y - .19) / 2.03, 0, 1);
        const radiusScale = (.53 + .194 * level * fill) / (.53 + .194 * level);
        positions.setXYZ(i, liquidBase[i * 3] * radiusScale, .19 + (y - .19) * fill, liquidBase[i * 3 + 2] * radiusScale);
      }
      positions.needsUpdate = true; previousFill = fill;
    }
    liquid.visible = !scrolled || poured > 0;
    // Narrow the foam as it descends into the tapered glass.
    const foamRadius = (.53 + .194 * fill) / .724;
    foam.scale.set(foamRadius, 1, foamRadius);
    foam.position.y = foamBase - 2.03 * (1 - fill);
    foam.visible = fill > .1;
    stream.visible = pouring;
    stream.position.set(-.24, (3.06 + surface) / 2, 0);
    stream.scale.set(1, 3.06 - surface, 1);
    handle.rotation.x = scrolled ? -.5 * (ease((pour - .52) / .05) - ease((pour - .85) / .04))
      : -.5 * (ease((t - .25) / .4) - ease((t - 4.65) / .35)) * (1 - ease(glide / .25));
    ice.forEach((cube, i) => {
      const age = t - (4.85 + i * .58);
      cube.visible = !scrolled && age >= 0 && t < 11.15;
      const drop = clamp(age / .65, 0, 1);
      const landing = 2.32;
      const bob = age > .65 && t < 7 ? Math.sin((age - .65) * 10) * .10 * Math.exp(-(age - .65) * 1.7) : 0;
      cube.position.set(iceX[i], 3.85 - (3.85 - landing) * drop * drop + bob, iceZ[i]);
      cube.rotation.set(.35 + drop * .8 + i, .4 + drop * .7, .2 + i * .7);
    });
    const frosted = scrolled ? ease((pour - .12) / .28) : 0;
    frost.visible = frosted > 0; frostMaterial.uniforms.frost.value = frosted;
    frostMaterial.uniforms.wet.value = scrolled ? poured : 0; frostMaterial.uniforms.beerTop.value = surface + .12;
    glassMaterial.color.lerpColors(glassTint, frostTint, frosted);
    glassMaterial.opacity = .16 + .1 * frosted;
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
    // The loop clock pauses while the scroll story owns the pint.
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
    camera.position.z = camera.aspect < .8 ? 8.7 : 8;
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
    model.traverse(o => {
      if (!o.isMesh) return;
      shadeGeometry(o.geometry);
      if (o.name === 'Glass') o.material = glassMaterial;
      else if (o.name === 'Liquid') o.material = beerMaterial;
      else if (o.name === 'Head') o.material = foamMaterial;
      else if (o.name === 'Tap') o.material = tapMaterial;
      else if (o.name === 'Ice') o.material = iceMaterial;
      else o.material = handleMaterial;
    });
    // Separate the stationary tap from the pint that leaves at the end of a loop.
    for (const child of [...model.children]) {
      if (['Tap', 'TapHandle'].includes(child.name)) pivot.add(child);
      else if (!['Ice', 'Condensation', 'FoamCrown'].includes(child.name)) pint.add(child);
    }
    liquid = pint.getObjectByName('Liquid'); foam = pint.getObjectByName('Head');
    const glass = pint.getObjectByName('Glass');
    frost = new THREE.Mesh(glass.geometry, frostMaterial); frost.renderOrder = 2; glass.add(frost);
    liquidBase = liquid.geometry.attributes.position.array.slice();
    foamBase = foam.position.y;
    handle = pivot.getObjectByName('TapHandle');
    const iceTemplate = model.getObjectByName('Ice');
    ice = Array.from({ length: 3 }, () => { const cube = iceTemplate.clone(); pint.add(cube); return cube; });
    stream = new THREE.Mesh(new THREE.CylinderGeometry(.038, .05, 1, 8), beerMaterial); pivot.add(stream);
    shadeGeometry(stream.geometry);
    const label = document.createElement('canvas'); label.width = 512; label.height = 256;
    const ctx = label.getContext('2d'); ctx.textAlign = 'center'; ctx.fillStyle = '#fff4d4';
    ctx.font = 'bold 60px Georgia'; ctx.fillText('HIPPIES', 256, 110);
    ctx.font = '14px sans-serif'; ctx.fillText('B A R   &   G R I L L', 256, 148);
    ctx.fillRect(160, 170, 192, 1);
    const texture = new THREE.CanvasTexture(label); texture.colorSpace = THREE.SRGBColorSpace;
    const print = new THREE.Mesh(new THREE.CylinderGeometry(.745, .685, .7, 24, 1, true, -.9, 1.8), new THREE.MeshBasicMaterial({ map: texture, alphaTest: .5, transparent: false, depthWrite: false }));
    print.position.y = 1.25; pint.add(print);
    canvas.tabIndex = 0; stage.classList.add('beer-ready'); requestDraw();
  }, undefined, fallback);
} catch {
  renderer?.dispose();
}
