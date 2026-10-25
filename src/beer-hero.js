import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const stage = document.querySelector('.hero-stage');
const canvas = stage.querySelector('.beer-canvas');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const LOOP_SECONDS = 12;
let renderer;

try {
  // Keep the render target small and use unlit colors: no lights or reflections.
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(.85);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 20);
  camera.position.set(0, 1.2, 8);
  camera.lookAt(0, 0, 0);
  const glassMaterial = new THREE.MeshBasicMaterial({ color: 0xa7c2c8, transparent: true, opacity: .16, depthWrite: false });
  const beerMaterial = new THREE.MeshBasicMaterial({ color: 0xd79827, vertexColors: true });
  const foamMaterial = new THREE.MeshBasicMaterial({ color: 0xffefd0, vertexColors: true });
  const tapMaterial = new THREE.MeshBasicMaterial({ color: 0x9e9586, vertexColors: true });
  const iceMaterial = new THREE.MeshBasicMaterial({ color: 0xb5e8ff, vertexColors: true });
  const handleMaterial = new THREE.MeshBasicMaterial({ color: 0x704222, vertexColors: true });
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
  let model, liquid, foam, stream, handle, ice;
  let foamBase, liquidBase, previousFill = -1;
  let visible = false, failed = false, raf = 0, timer = 0, last = 0, elapsed = 0;
  let yaw = -.12, pitch = 0, dragging = false, previousX = 0, previousY = 0;
  const iceX = [.22, -.25, .05], iceZ = [.30, .35, -.16];
  const clamp = THREE.MathUtils.clamp;
  const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

  function pose() {
    const t = motion.matches ? 8.5 : elapsed % LOOP_SECONDS;
    const fill = .06 + .94 * ease((t - .65) / 4.1);
    const pouring = t >= .65 && t < 4.75;
    const phase = t < .65 ? 'ready' : pouring ? 'pouring' : t < 7 ? 'ice' : t < 10 ? 'hold' : 'reset';
    if (stage.dataset.beerPhase !== phase) stage.dataset.beerPhase = phase;
    const cycle = String(Math.floor(elapsed / LOOP_SECONDS));
    if (stage.dataset.beerCycle !== cycle) stage.dataset.beerCycle = cycle;
    // The full pint leaves below the frame; an empty one returns before the tap opens.
    pint.position.y = t >= 10 ? -4.5 * ease((t - 10) / 1.1) : -4.5 * (1 - ease(t / .6));
    if (motion.matches) pint.position.y = 0;
    pint.visible = t < 11.15 || motion.matches;
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
    // Narrow the foam as it descends into the tapered glass.
    const foamRadius = (.53 + .194 * fill) / .724;
    foam.scale.set(foamRadius, 1, foamRadius);
    foam.position.y = foamBase - 2.03 * (1 - fill);
    foam.visible = fill > .1;
    stream.visible = pouring;
    stream.position.set(-.24, (3.06 + surface) / 2, 0);
    stream.scale.set(1, 3.06 - surface, 1);
    handle.rotation.x = -.5 * (ease((t - .25) / .4) - ease((t - 4.65) / .35));
    ice.forEach((cube, i) => {
      const age = t - (4.85 + i * .58);
      cube.visible = age >= 0 && t < 11.15;
      const drop = clamp(age / .65, 0, 1);
      const landing = 2.32;
      const bob = age > .65 && t < 7 ? Math.sin((age - .65) * 10) * .10 * Math.exp(-(age - .65) * 1.7) : 0;
      cube.position.set(iceX[i], 3.85 - (3.85 - landing) * drop * drop + bob, iceZ[i]);
      cube.rotation.set(.35 + drop * .8 + i, .4 + drop * .7, .2 + i * .7);
    });
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
    if (!motion.matches && last) elapsed += (now - last) / 1000;
    last = now;
    const start = performance.now();
    const t = pose(); renderer.render(scene, camera);
    if (!motion.matches) {
      // The hold and empty-glass beats are stills; sleep until the next action.
      const delay = t >= 7 && t < 10 ? (10 - t) * 1000
        : t >= 11.15 ? (LOOP_SECONDS - t) * 1000
        : Math.max(0, 1000 / 24 - (performance.now() - start));
      timer = setTimeout(requestDraw, delay);
    }
  }

  function fitCanvas() {
    const width = stage.clientWidth, height = Math.max(1, stage.clientHeight - 52);
    if (!width) return;
    renderer.setPixelRatio(Math.min(.85, 420 / Math.max(width, height)));
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.position.z = camera.aspect < .8 ? 8.7 : 8;
    camera.updateProjectionMatrix(); requestDraw();
  }
  const resize = new ResizeObserver(fitCanvas); resize.observe(stage); fitCanvas();
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible) stop(); else requestDraw();
  });
  intersection.observe(stage);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else requestDraw(); });
  motion.addEventListener('change', () => { stop(); requestDraw(); });
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
    failed = true; stop(); resize.disconnect(); intersection.disconnect();
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
    const print = new THREE.Mesh(new THREE.CylinderGeometry(.745, .685, .7, 24, 1, true, -.9, 1.8), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
    print.position.y = 1.25; pint.add(print);
    canvas.tabIndex = 0; stage.classList.add('beer-ready'); requestDraw();
  }, undefined, fallback);
} catch {
  renderer?.dispose();
}
