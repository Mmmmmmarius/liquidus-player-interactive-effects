# Fluid reveal

A pointer-driven fluid mask reveals a second image. A velocity grid and a finer dye grid preserve thin moving trails.

[中文说明](README.zh-CN.md) · [Source and licenses](SOURCES.md)

## Run the demo

Requires Node.js 20 or newer to serve files. There is no build step and no dependency installation.

```sh
node scripts/serve.mjs --port 4171
```

Open [http://127.0.0.1:4171/](http://127.0.0.1:4171/). On Windows, double-click `start-demo.cmd` and open the printed address. Keep the terminal running; Ctrl+C stops it. Choose a different port if needed. Do not open the HTML with a file URL, because ES modules need an HTTP origin.

The server binds only to 127.0.0.1 and serves this package. A regular static host can also serve the folder; start at `demo/index.html`. The bundled server is for local development.

## Explore

- Choose a preset and change sliders or exact numeric values. Changes appear immediately.
- Pause or resume motion. Motion starts paused when the system requests reduced motion.
- Choose a generated sample or load your own PNG, JPEG or WebP. Inputs remain in the browser and are not persisted or uploaded. Demo image decoding limits are 15 MB and 40 megapixels; textures are resized to at most 2048 pixels.
- Open **Save & load parameters**. Export a JSON file, import one, or edit JSON directly. Wrong effect names, unknown keys and invalid types are rejected without changing the running effect. Finite numbers outside the supported range are clamped.
- Restore defaults resets parameters, sample image and demo state. It preserves your current pause choice.

Exports contain effect parameters only. They never include selected images, filenames or object placement. There is no analytics, remote font, external media request or saved browser preference.

## Integrate

Give the canvas an explicit CSS width and height. The renderer caps backing dimensions at 2048 pixels on the longest side. Use decoded, same-origin or CORS-enabled images. Supply your own image paths in the example below.

Before your module script, include a local import map:

```html
<script type="importmap">{"imports":{"three":"./vendor/three.module.js"}}</script>
```

```js
import {createFluidReveal} from './src/index.js';
const canvas = document.querySelector('canvas');
const effect = createFluidReveal(canvas);
const base = new Image(), alternate = new Image();
base.src = './base.png'; alternate.src = './alternate.png';
await Promise.all([base.decode(), alternate.decode()]);
effect.setImages(base, alternate);
effect.setParameters({radius: .03, dyeDecay: .4});
let last = 0, previous = {x: .5, y: .5}, point = {...previous};
canvas.addEventListener('pointermove', event => {
  const r = canvas.getBoundingClientRect();
  point = {x: (event.clientX-r.left)/r.width, y: 1-(event.clientY-r.top)/r.height};
});
function frame(now) {
  const dt = last ? Math.min((now-last)/1000, .05) : 0;
  effect.render(dt, {uv: point, delta: {x:point.x-previous.x, y:point.y-previous.y}});
  previous = {...point}; last = now; requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

`createFluidReveal(canvas)` → controller. `setImages(base, alternate)` accepts decoded images or canvases. `setParameters(partial)` validates an atomic update. `render(deltaSeconds, pointer)` draws a frame. Pointer coordinates are normalized, with Y increasing upward. `clear()` clears dye and velocity. `resize()` refreshes dimensions. `parameters` returns a copy. `diagnostics()` reads render dimensions and GL error state. `destroy()` releases GPU resources and is idempotent.

Stop your own animation loop and remove your own event listeners before calling `destroy()`. For an application integration, pause while the page is hidden and honor reduced-motion preferences. The demo contains an example of those controls.

## Parameters

| Key | Default | Accepted range or type | Meaning |
| --- | --- | --- | --- |
| radius | 0.025 | 0.003 … 0.12 | Brush radius |
| force | 1400 | 0 … 3000 | Pointer force |
| forceRadius | 0.035 | 0.005 … 0.12 | Force spread |
| dyeAmount | 1.8 | 0.1 … 4 | Ink density |
| curl | 10 | 0 … 35 | Swirl |
| dyeDecay | 0.45 | 0.05 … 3 | Trail fade |
| velocityDecay | 0.6 | 0.1 … 3 | Velocity fade |
| sharpness | 0.6 | 0 … 1 | Advection sharpness |
| threshold | 0.12 | 0.01 … 1 | Reveal threshold |
| softness | 1.5 | 0.5 … 8 | Edge softness |
| edgeOpacity | 0.65 | 0 … 1 | Rim opacity |
| edgeWidth | 1.5 | 0.5 … 8 | Rim width |
| edgeColor | "#0920d8" | color | Rim color |
| wipe | 0 | 0 … 1 | Full reveal |
| maxSimSize | 192 | 64 … 256 | Velocity resolution |
| maxDyeSize | 640 | 128 … 1024 | Dye resolution |
| pressureIterations | 16 | 4 … 24 | Pressure iterations |

## Files and dependencies

- `src/index.js`: supported renderer entry point.
- `src/parameters.js`: canonical defaults, ranges and normalizer.
- `src/validation.js`: strict parameter and JSON format validation.
- `demo/`: adjustable UI and procedural sample images.
- `scripts/serve.mjs`: loopback-only static server.
- `tests/`: parameter, server and real-browser smoke checks.

Three.js 0.170.0, vendored locally under its MIT license. There is no CDN request and no runtime package installation.

## Verify

```sh
node --test tests/*.test.mjs
```

With the server running, open [browser checks](http://127.0.0.1:4171/tests/browser.html). This draws real WebGL frames, compares changed pixels, checks controls, JSON, local image loading, pause behavior and a narrow iframe. Tests use generated fixtures only. The result stays visible as JSON.

Chromium rendering and interaction were checked on Windows and macOS for this release. A narrow desktop viewport is not a physical-phone test. Safari, Firefox, mobile GPUs, assistive technologies and sustained performance still need their own validation.

## Constraints

Needs WebGL 2 with floating-point render targets. Resizing the simulation clears its trail. The sample is a generic two-image mask, not a portrait or scroll-layout component. No physics or high-refresh equivalence guarantee is made. If WebGL is unavailable, the demo shows an error. If the graphics context is lost, use Reload demo. This package is an effect implementation, not a native product replica.

## License

Own implementation and procedural samples: MIT, see [LICENSE](LICENSE). Third-party notices remain in their original license files. See [SOURCES.md](SOURCES.md) for provenance and the vendored dependency boundary.
