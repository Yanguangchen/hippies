# 3D beer hero

The hero uses a Blender-authored pint exported to glTF, rendered with Three.js.
The deployed site is still static; all runtime assets are served locally.

- `Assets/models/beer.blend`: editable Blender source.
- `tools/create-beer.py`: deterministic geometry generator (Blender 4.3+).
- `Assets/models/beer.glb`: web model (~442 KB).
- `src/beer-hero.js`: scene, materials, lighting and interactions.
- `Assets/js/beer-hero.js`: committed browser bundle, including Three.js.

Rebuild the model from the repository root:

```sh
blender --background --python tools/create-beer.py
```

Rebuild the browser bundle after editing JavaScript:

```sh
npm ci
npm run build
npm run lint
npx playwright test
```

The existing Playwright config starts a static server on port 3000. In the managed
cloud environment use the external config documented in the environment startup
instructions to select installed Chromium.

Drag horizontally or use arrow keys on the focused canvas to rotate. Home or
Reset view restores orientation. Pour a pint animates the fill and foam; Pause
freezes motion. Reduced motion starts paused and pours instantly. Vertical touch
scrolling is retained. Rendering pauses outside the viewport or in hidden tabs;
pixel ratio is capped at 1.5 and ambient rendering at 30 fps. One WebGL context owns the scene, with instanced
bubbles and merged Blender geometry. The existing illustration remains a static
fallback if WebGL or model loading fails. No external model/CDN request is needed.

The build stamps CSS and JavaScript URLs with content hashes so cached assets
cannot mix versions after a deployment. Canvas dimensions come from the hero
container and are set explicitly, avoiding intrinsic-size feedback on high-DPI
screens even if the canvas stylesheet is unavailable.
