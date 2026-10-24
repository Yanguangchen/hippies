import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const stage = document.querySelector('.hero-stage');
const canvas = stage.querySelector('.beer-canvas');
const pause = stage.querySelector('[data-beer-pause]');
const pour = stage.querySelector('[data-beer-pour]');
const reset = stage.querySelector('[data-beer-reset]');
const status = stage.querySelector('.beer-status');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .85;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 30);
  camera.position.set(0, 1.8, 6.5);
  camera.lookAt(0, 0, 0);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .04);
  scene.environment = environment.texture;
  room.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xfff0cc, 0x65320e, 1));
  const key = new THREE.DirectionalLight(0xffe9bc, 2);
  key.position.set(-3, 4, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xb7ddff, 1.5);
  rim.position.set(3, 2, -2); scene.add(rim);
  const pivot = new THREE.Group(); scene.add(pivot);
  let model, liquid, foam, crown, bubbles, stream;
  let crownY = 0;
  let paused = motion.matches, visible = true, frame = 0, last = 0, time = 0;
  let yaw = -.28, pitch = -.08, dragging = false, previousX = 0, previousY = 0;
  let fill = 1, pouring = false;
  const seeds = Array.from({ length: 70 }, (_, i) => ({
    angle: i * 2.39996, radius: .12 + (i % 11) * .044,
    speed: .22 + (i % 7) * .035, phase: (i * .618) % 1,
  }));
  const dummy = new THREE.Object3D();
  function updateButtons() {
    pause.textContent = paused ? 'Play' : 'Pause';
    pause.setAttribute('aria-pressed', String(paused));
    pour.disabled = pouring;
  }
  function render(now = 0) {
    frame = 0;
    const dt = Math.max(0, (now - last) / 1000 || 0); last = now;
    if (!paused) time += dt;
    if (pouring && !paused) {
      fill = Math.min(1, fill + dt * .3);
      if (fill === 1) { pouring = false; status.textContent = 'Freshly poured. Cheers.'; updateButtons(); }
    }
    if (model) {
      pivot.rotation.set(pitch, yaw + (!paused && !dragging ? Math.sin(time * .35) * .12 : 0), -.09);
      pivot.position.y = paused ? 0 : Math.sin(time * .9) * .035;
      liquid.scale.y = fill;
      foam.position.y = -2.2 * (1 - fill);
      crown.position.y = crownY - 2.2 * (1 - fill);
      stream.visible = pouring;
      stream.scale.y = Math.max(.01, 3.4 - 2.2 * fill);
      stream.position.y = (3.4 + 2.2 * fill) / 2;
      bubbles.visible = fill > .15;
      seeds.forEach((s, i) => {
        const height = ((s.phase + time * s.speed) % 1) * 1.85 * fill + .23;
        const x = Math.cos(s.angle) * s.radius;
        const radius = .53 + .194 * (height - .19) / 2.03;
        dummy.position.set(x, height, Math.sqrt(Math.max(0, radius * radius - x * x)) + .006);
        dummy.scale.setScalar(.012 + (i % 4) * .003); dummy.updateMatrix();
        bubbles.setMatrixAt(i, dummy.matrix);
      });
      bubbles.instanceMatrix.needsUpdate = true;
    }
    renderer.render(scene, camera);
    if (visible && !document.hidden && !paused) frame = requestAnimationFrame(render);
  }
  function invalidate() {
    if (!frame && visible && !document.hidden) { last = performance.now(); frame = requestAnimationFrame(render); }
  }
  const resize = new ResizeObserver(() => {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false); camera.aspect = width / height;
    camera.position.z = camera.aspect < 1 ? 7.3 : 6.5;
    camera.updateProjectionMatrix(); invalidate();
  });
  resize.observe(canvas);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible) { cancelAnimationFrame(frame); frame = 0; } else invalidate();
  }).observe(stage);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else invalidate();
  });
  canvas.addEventListener('pointerdown', e => {
    dragging = true; previousX = e.clientX; previousY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    yaw += (e.clientX - previousX) * .009;
    pitch = THREE.MathUtils.clamp(pitch + (e.clientY - previousY) * .005, -.45, .45);
    previousX = e.clientX; previousY = e.clientY; invalidate();
  });
  const release = () => { dragging = false; };
  canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
  canvas.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(e.key)) return;
    e.preventDefault();
    if (e.key === 'Home') { yaw = -.28; pitch = -.08; }
    else if (e.key === 'ArrowLeft') yaw -= .15;
    else if (e.key === 'ArrowRight') yaw += .15;
    else pitch = THREE.MathUtils.clamp(pitch + (e.key === 'ArrowUp' ? -.1 : .1), -.45, .45);
    invalidate();
  });
  pause.addEventListener('click', () => { paused = !paused; updateButtons(); invalidate(); });
  reset.addEventListener('click', () => { yaw = -.28; pitch = -.08; invalidate(); });
  pour.addEventListener('click', () => {
    fill = motion.matches ? 1 : .07; pouring = !motion.matches;
    if (pouring) paused = false;
    status.textContent = pouring ? 'Pouring a fresh pint…' : 'Freshly poured. Cheers.';
    updateButtons(); invalidate();
  });
  motion.addEventListener('change', () => {
    paused = motion.matches; fill = 1; pouring = false; updateButtons(); invalidate();
  });
  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault(); cancelAnimationFrame(frame); frame = 0;
    paused = true; visible = false; canvas.tabIndex = -1;
    stage.classList.remove('beer-ready'); status.textContent = 'Cold beer. Good company.';
  });
  new GLTFLoader().load('/Assets/models/beer.glb', gltf => {
    model = gltf.scene; model.position.y = -1.2; pivot.add(model);
    liquid = model.getObjectByName('Liquid'); foam = model.getObjectByName('Head'); crown = model.getObjectByName('FoamCrown');
    crownY = crown.position.y;
    model.traverse(o => {
      if (!o.isMesh) return;
      if (o.name === 'Glass' || o.name === 'Condensation') {
        o.material = new THREE.MeshPhysicalMaterial({ color: 0xe2f5ff, roughness: .07, metalness: 0, transmission: 0, transparent: true, opacity: .22, depthWrite: false, thickness: .12, ior: 1.45, envMapIntensity: .8 });
      }
      if (o.name === 'Liquid') o.material = new THREE.MeshPhysicalMaterial({ color: 0xc16a06, roughness: .22, metalness: .12, clearcoat: 1 });
    });
    bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffe8a0, roughness: .25, metalness: .3 }), seeds.length);
    model.add(bubbles);
    stream = new THREE.Mesh(new THREE.CylinderGeometry(.035, .055, 1, 12), liquid.material);
    model.add(stream);
    // Curved lettering sits just outside the glass, like a printed pub glass.
    const label = document.createElement('canvas'); label.width = 1024; label.height = 512;
    const ctx = label.getContext('2d');
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff4d4';
    ctx.font = 'bold 92px Georgia'; ctx.fillText('HIPPIES', 512, 220);
    ctx.font = '24px sans-serif'; ctx.fillText('B A R   &   G R I L L', 512, 280);
    ctx.fillRect(340, 320, 344, 3); ctx.font = '22px sans-serif'; ctx.fillText('GOOD TIMES ON TAP', 512, 366);
    const texture = new THREE.CanvasTexture(label); texture.colorSpace = THREE.SRGBColorSpace;
    const print = new THREE.Mesh(new THREE.CylinderGeometry(.745, .685, .7, 48, 1, true, -.9, 1.8), new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    print.position.y = 1.25; model.add(print);
    canvas.tabIndex = 0; stage.classList.add('beer-ready'); status.textContent = 'Drag to spin · make yourself at home';
    updateButtons(); invalidate();
  }, undefined, () => { paused = true; visible = false; cancelAnimationFrame(frame); frame = 0; status.textContent = 'Cold beer. Good company.'; renderer.dispose(); resize.disconnect(); });
} catch {
  status.textContent = 'Cold beer. Good company.';
  renderer?.dispose();
}
