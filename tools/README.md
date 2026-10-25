# 3D beer hero

The static site serves a Blender-authored pint, draught tap, and rounded ice
mesh locally through Three.js. There are no on-screen animation controls.

- `Assets/models/beer.blend`: editable Blender source.
- `tools/create-beer.py`: deterministic geometry generator (Blender 4.3+).
- `Assets/models/beer.glb`: web model (~43 KiB, 1,540 triangles).
- `src/beer-hero.js`: scene, lightweight materials, and animation.
- `Assets/js/beer-hero.js`: committed browser bundle, including Three.js.

Rebuild the model from the repository root:

```sh
blender --background --python tools/create-beer.py
```

Rebuild browser assets after editing JavaScript, CSS, or the model:

```sh
npm ci
npm run build
npm run lint
npx playwright test
```

The Playwright config starts a static server on port 3000. In the managed cloud
environment use the external config documented in the startup instructions to
select installed Chromium.

## Animation

One 12-second clock drives the tap handle, stream, liquid height, foam, and three
staggered ice drops. The pint holds, exits below the card, then returns empty for
the next pour. Liquid geometry follows the glass taper while filling. Drag or
arrow keys gently change the viewing angle; Home restores it. Touch scrolling
is retained. Reduced motion renders one still, full pint with ice.

## Performance and delivery

All surfaces use unlit MeshBasicMaterial. A directional tint is baked into vertex
colors once at load time to keep the shape readable; there are no runtime lights,
reflection maps, specular highlights, refraction, shadows, or postprocessing.
Beer, foam, tap, handle, and ice are opaque. Only the glass shell uses alpha
blending; the printed label uses an opaque alpha-test cutout.
Condensation, rising bubbles, foam-crown detail, headline particles, and animated
headline glows have been removed.

Antialiasing smooths the silhouettes. The drawing buffer follows device pixel
ratio up to 1.25, with a maximum dimension of 1024 pixels. This avoids the previous
below-native resolution while keeping a modest pixel budget. Active animation
uses requestAnimationFrame directly, so automatic playback and dragging follow
the same display cadence. Timers are used only to sleep during the three-second
full-pint hold and the empty beat. Rendering also stops offscreen, in hidden tabs,
and under reduced motion (except explicit view changes). The 12-second pour-and-ice sequence is retained.

CSS, JavaScript, and model URLs include content hashes to avoid mixed cached
versions after deployment. Canvas dimensions come from its container rather than
its drawing buffer, avoiding high-DPI resize feedback if CSS is unavailable.
The SVG illustration remains a static fallback for WebGL or model-load failure.

Browser tests cover a complete repeat cycle using a controlled clock, no control
buttons, equal automatic/dragging frame cadence, reduced motion, keyboard view
changes, actual WebGL draw-call suspension during holds and offscreen, the render resolution budget, enabled antialiasing,
model failure, versioned styles, and high-DPI sizing. Hardware-specific
performance still needs checking on the deployed page and target devices.
