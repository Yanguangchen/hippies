import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const stage = document.querySelector('.hero-stage');
const canvas = stage.querySelector('.beer-canvas');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const LOOP_SECONDS = 12;
let renderer;

try {
  // One CSS pixel per rendered pixel: no high-DPI multiplication or HDR passes.
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 20);
  camera.position.set(0, 1.2, 8);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xfff3d7, 0x614426, 2));
  const key = new THREE.DirectionalLight(0xffeed5, 2.5);
  key.position.set(-3, 5, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xc1e8ff, 1.4);
  rim.position.set(3, 3, -2); scene.add(rim);
  // Tiny studio reflection map instead of PMREM generation and physical shaders.
  const reflection = new THREE.CubeTexture(Array.from({ length: 6 }, (_, i) => {
    const face = document.createElement('canvas'); face.width = face.height = 32;
    const ctx = face.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 32, 16);
    gradient.addColorStop(0, '#342b20'); gradient.addColorStop(.35, '#867b67');
    gradient.addColorStop(.43, i % 2 ? '#f4f0dd' : '#b6c9d0');
    gradient.addColorStop(.55, '#655c4d'); gradient.addColorStop(1, '#2b251e');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 32, 32); return face;
  }));
  reflection.colorSpace = THREE.SRGBColorSpace; reflection.needsUpdate = true;
  const glassMaterial = new THREE.MeshPhongMaterial({ color: 0xb9d8e3, specular: 0xffffff, shininess: 90, transparent: true, opacity: .19, depthWrite: false, envMap: reflection, reflectivity: .35 });
  const beerMaterial = new THREE.MeshPhongMaterial({ color: 0xd1840c, specular: 0xffd67c, shininess: 65 });
  const foamMaterial = new THREE.MeshLambertMaterial({ color: 0xffefd0 });
  const chromeMaterial = new THREE.MeshPhongMaterial({ color: 0x9d9179, specular: 0xffffff, shininess: 100, envMap: reflection, reflectivity: .65 });
  const iceMaterial = new THREE.MeshPhongMaterial({ color: 0xb5e8ff, specular: 0xffffff, shininess: 100, envMap: reflection, reflectivity: .35, transparent: true, opacity: .8 });
  const pivot = new THREE.Group(); pivot.position.y = -1.85; scene.add(pivot);
  const pint = new THREE.Group(); pivot.add(pint);
  let model, liquid, foam, crown, bubbles, stream, handle, ice;
  let crownBase, foamBase, liquidBase, previousFill = -1;
  let visible = false, failed = false, raf = 0, timer = 0, last = 0, elapsed = 0;
  let yaw = -.12, pitch = 0, dragging = false, previousX = 0, previousY = 0;
  let slowFrames = 0, pixelRatio = 1;
  const dummy = new THREE.Object3D();
  const iceX = [.22, -.25, .05], iceZ = [.30, .35, -.16];
  const clamp = THREE.MathUtils.clamp;
  const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

  function pose() {
    const t = motion.matches ? 8.5 : elapsed % LOOP_SECONDS;
    const fill = .06 + .94 * ease((t - .65) / 4.1);
    const pouring = t >= .65 && t < 4.75;
    const phase = t < .65 ? 'ready' : pouring ? 'pouring' : t < 7 ? 'ice' : t < 10 ? 'hold' : 'reset';
    stage.dataset.beerPhase = phase;
    stage.dataset.beerCycle = String(Math.floor(elapsed / LOOP_SECONDS));
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
    crown.scale.x = crown.scale.z = foamRadius;
    crown.position.y = crownBase - 2.03 * (1 - fill);
    foam.visible = crown.visible = fill > .1;
    stream.visible = pouring;
    stream.position.set(-.24, (3.06 + surface) / 2, 0);
    stream.scale.set(1 + Math.sin(t * 24) * .08, 3.06 - surface, 1);
    handle.rotation.x = -.5 * (ease((t - .25) / .4) - ease((t - 4.65) / .35));
    ice.forEach((cube, i) => {
      const age = t - (4.85 + i * .58);
      cube.visible = age >= 0 && t < 11.15;
      const drop = clamp(age / .65, 0, 1);
      const landing = 2.32;
      const bob = age > .65 ? Math.sin((age - .65) * 10) * .10 * Math.exp(-(age - .65) * 1.7) : 0;
      cube.position.set(iceX[i], 3.85 - (3.85 - landing) * drop * drop + bob, iceZ[i]);
      cube.rotation.set(.35 + drop * .8 + i, .4 + drop * .7, .2 + i * .7);
    });
    bubbles.visible = fill > .15;
    for (let i = 0; i < 24; i++) {
      const height = .22 + ((i * .618 + elapsed * (.15 + i % 3 * .04)) % 1) * 1.85 * fill;
      const x = Math.sin(i * 2.4) * .40;
      const radius = .53 + .194 * (height - .19) / (2.03 * fill);
      dummy.position.set(x, height, Math.sqrt(Math.max(0, radius * radius - x * x)) + .004);
      dummy.scale.setScalar(.012 + i % 3 * .004); dummy.updateMatrix(); bubbles.setMatrixAt(i, dummy.matrix);
    }
    bubbles.instanceMatrix.needsUpdate = true;
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
    pose(); renderer.render(scene, camera);
    const cost = performance.now() - start;
    // Back off resolution on slow GPUs, rather than queueing more work.
    slowFrames = cost > 24 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
    if (slowFrames >= 12 && pixelRatio > .7) {
      pixelRatio = Math.max(.7, pixelRatio - .15); renderer.setPixelRatio(pixelRatio);
      slowFrames = 0;
    }
    if (!motion.matches) timer = setTimeout(requestDraw, Math.max(0, 1000 / 30 - cost));
  }
  function fitCanvas() {
    const width = stage.clientWidth, height = Math.max(1, stage.clientHeight - 52);
    if (!width) return;
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
    model = gltf.scene;
    model.traverse(o => {
      if (!o.isMesh) return;
      if (['Glass', 'Condensation'].includes(o.name)) o.material = glassMaterial;
      else if (o.name === 'Liquid') o.material = beerMaterial;
      else if (['Head', 'FoamCrown'].includes(o.name)) o.material = foamMaterial;
      else if (o.name === 'Tap') o.material = chromeMaterial;
      else if (o.name === 'Ice') o.material = iceMaterial;
      else o.material = new THREE.MeshPhongMaterial({ color: 0x48240c, shininess: 45 });
    });
    // Separate the stationary tap from the pint that leaves at the end of a loop.
    for (const child of [...model.children]) {
      if (['Tap', 'TapHandle'].includes(child.name)) pivot.add(child);
      else if (child.name !== 'Ice') pint.add(child);
    }
    liquid = pint.getObjectByName('Liquid'); foam = pint.getObjectByName('Head'); crown = pint.getObjectByName('FoamCrown');
    liquidBase = liquid.geometry.attributes.position.array.slice();
    foamBase = foam.position.y; crownBase = crown.position.y;
    handle = pivot.getObjectByName('TapHandle');
    const iceTemplate = model.getObjectByName('Ice');
    ice = Array.from({ length: 3 }, () => { const cube = iceTemplate.clone(); pint.add(cube); return cube; });
    bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffe9b2 }), 24);
    pint.add(bubbles);
    stream = new THREE.Mesh(new THREE.CylinderGeometry(.038, .05, 1, 8), beerMaterial); pivot.add(stream);
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
