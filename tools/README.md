# 3D beer hero

The static site serves a Blender-authored beer mug, chrome beer tower tap, and
rounded ice mesh locally through Three.js. There are no on-screen animation
controls.

The mug is heavy glass: a thick base, twelve flutes round the lower half, a
bead, a smooth band carrying the printed logo, a rolled rim, and a D-shaped
handle. The tower has a base flange, domed cap, shank, hex coupling nut,
faucet body, spout, and lever bonnet; the tall black tap handle sits on a brass
ferrule and carries a Hippies badge. The mug print and badge use the site's
fonts (Anton wordmark with the amber full stop, Inter small caps) and are
redrawn once those fonts load.

- `Assets/models/beer.blend`: editable Blender source.
- `tools/create-beer.py`: deterministic geometry generator (Blender 4.3+).
- `Assets/models/beer.glb`: web model (~180 KiB, 8,484 triangles).
- `src/beer-hero.js`: scene, lightweight materials, and animation.
- `src/pour-story.js`: scroll choreography that pins the mug over the taps heading.
- `Assets/js/beer-hero.js`: committed browser bundle, including Three.js.

Rebuild the model from the repository root:

```sh
blender --background --python tools/create-beer.py
```

Without a Blender install, the `bpy` module from PyPI (Blender 5.2) runs the
same script with `python tools/create-beer.py`. Mug and spout dimensions are
mirrored as constants at the top of `src/beer-hero.js`; keep them in step.

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
staggered ice drops. The tap handle pulls forward toward the spout. The mug
holds, exits below the card, then returns empty for the next pour. Liquid
geometry follows the mug's taper while filling. Drag or
arrow keys gently change the viewing angle; Home restores it. Touch scrolling
is retained. Reduced motion renders one still, full mug with ice.

## Scroll story

With motion allowed, the script moves the stage into a sticky viewport inside
`#taps` (`.pour-pin`) as soon as it runs; the hero keeps a same-sized
placeholder. On scroll the mug glides from the hero to the centre of the screen
while the hero copy fades, and the looping mug drops away and an empty one
rises in its place. Once pinned, scrolling eases in the eyebrow and title
beneath it, grows frost up the mug from the base, reveals the subtitle, then
pulls the tap and pours a beer with rising bubbles. The pin then releases and
the beer cards scroll up as usual, followed by the ticker and slideshow.
Scrolling back to the top returns the stage to the hero and resumes the loop.

The pin holds for 2.5 viewport heights after the glide (`REVEAL_VIEWPORTS`).
Vertical pinning is native `position: sticky`; scripts only animate the glide,
the text reveals, and the scene, from a scroll position eased toward the real
one. Layout is measured on resize and font load. Reduced motion, WebGL or model
failure, a stylesheet without the pin rules, and screens too short to fit the
mug above the heading (landscape phones) all keep the static page: the stage
in the hero and the heading above the cards.

## Performance and delivery

There are no runtime lights, environment maps, refraction, shadows, or
postprocessing. Beer and foam use unlit MeshBasicMaterial with a directional
tint baked into vertex colors at load time. Chrome, brass, the black grip, and
ice use MeshMatcapMaterial: one texture lookup per pixel, with small matcaps
painted on a canvas at load time (no image downloads). The glass uses a short
shader with a Fresnel rim and two strip reflections that catch the flutes.
Beer, foam, tap, handle, and ice are opaque; the glass and the mug print are
alpha blended. The model is about four times its earlier size to carry the mug
and tap detail.
Condensation, foam-crown detail, headline particles, and animated headline glows
have been removed. The scroll story adds one transparent frost shell (procedural
noise on the mug geometry, no textures) and 90 point-sprite bubbles; both are
hidden in the looping hero.

Antialiasing smooths the silhouettes. The drawing buffer follows device pixel
ratio up to 1.25, with a maximum dimension of 1024 pixels. This avoids the previous
below-native resolution while keeping a modest pixel budget. Active animation
uses requestAnimationFrame directly, so automatic playback and dragging follow
the same display cadence. Timers are used only to sleep during the three-second
full-mug hold and the empty beat. In the scroll story, frames follow scroll
changes; only the poured beer's rising bubbles keep the display clock running
while the stage is on screen. Rendering also stops offscreen, in hidden tabs,
and under reduced motion (except explicit view changes). The 12-second pour-and-ice sequence is retained.

CSS, JavaScript, and model URLs include content hashes to avoid mixed cached
versions after deployment. Canvas dimensions come from its container rather than
its drawing buffer, avoiding high-DPI resize feedback if CSS is unavailable.
The SVG illustration remains a static fallback for WebGL or model-load failure.

Browser tests cover a complete repeat cycle using a controlled clock, no control
buttons, equal automatic/dragging frame cadence, reduced motion, keyboard view
changes, actual WebGL draw-call suspension during holds and offscreen, the render resolution budget, enabled antialiasing,
model failure, versioned styles, and high-DPI sizing. Scroll story tests walk
every step in order, check the mug stays centred and pinned above the heading,
that bubbles stop rendering once the story scrolls away, that the loop resumes at
the top, and that reduced motion, model failure, and landscape phones keep the
static layout. A model test checks the mug has its handle and the tap handle
keeps its chrome, brass, and grip parts. Hardware-specific
performance still needs checking on the deployed page and target devices.
