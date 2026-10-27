# Liquid glass

Rounded shapes refract a page-owned image with chromatic dispersion, layered blur, soft unions, rim lighting and a shadow.

[中文说明](README.zh-CN.md) · [Source and licenses](SOURCES.md)

## Run the demo

Requires Node.js 20 or newer to serve files. There is no build step and no dependency installation.

```sh
node scripts/serve.mjs --port 4172
```

Open [http://127.0.0.1:4172/](http://127.0.0.1:4172/). On Windows, double-click `start-demo.cmd` and open the printed address. Keep the terminal running; Ctrl+C stops it. Choose a different port if needed. Do not open the HTML with a file URL, because ES modules need an HTTP origin.

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

```js
import {createLiquidGlass} from './src/index.js';
const canvas = document.querySelector('canvas');
const effect = createLiquidGlass(canvas);
const image = new Image(); image.src = './background.png'; await image.decode();
effect.setBackground(image);
effect.setParams({height: 24, refract: 1.2, smoothness: 40});
function frame(now) {
  const w=canvas.clientWidth, h=canvas.clientHeight;
  effect.setShapes([{x:w*.5,y:h*.5,w:w*.4,h:h*.4,r:60}]);
  effect.render(now); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

`createLiquidGlass(canvas)` → controller. `setBackground(source)` accepts a decoded image, canvas, ImageBitmap or ready video. `setShapes(list)` takes up to eight `{x,y,w,h,r}` records in CSS pixels; x/y are centers, w/h full dimensions, r corner radius. Input is copied and validated. `setParams(partial)` validates an atomic update. `render(timeMs)` draws a frame. `resize()` refreshes dimensions. `params` returns a deep copy. `destroy()` releases resources and is idempotent.

Stop your own animation loop and remove your own event listeners before calling `destroy()`. For an application integration, pause while the page is hidden and honor reduced-motion preferences. The demo contains an example of those controls.

## Parameters

| Key | Default | Accepted range or type | Meaning |
| --- | --- | --- | --- |
| height | 24 | 1 … 80 | Bevel width |
| curvature | 1.25 | 0.1 … 4 | Bevel curve |
| refract | 1 | 0 … 3 | Refraction |
| aberration | 0.12 | 0 … 0.6 | Color dispersion |
| saturation | 1.35 | 0 … 3 | Saturation |
| brightness | 0.04 | -0.3 … 0.3 | Brightness |
| tint | [1,1,1,0] | 4 numbers, 0–1 | Tint RGBA |
| blurRadius | 3 | 0 … 24 | Blur radius |
| frost | 0.35 | 0 … 1 | Frost |
| keyAngle | 120 | 0 … 360 | Light direction |
| keyAmount | 0.6 | 0 … 2 | Key light |
| fillAmount | 0.35 | 0 … 2 | Fill light |
| fillRatio | 0.45 | 0 … 1 | Fill ratio |
| rimWidth | 2.5 | 0.1 … 12 | Rim width |
| rimSharpness | 2 | 0.1 … 8 | Rim sharpness |
| shadowOpacity | 0.22 | 0 … 0.8 | Shadow opacity |
| shadowRadius | 22 | 1 … 80 | Shadow softness |
| shadowOffsetY | 8 | -40 … 40 | Shadow offset |
| smoothness | 28 | 0 … 120 | Merge distance |
| pan | 12 | 0 … 50 | Background drift |
| refraction | true | boolean | Refraction pass |
| blur | true | boolean | Blur pass |
| highlight | true | boolean | Rim light pass |
| merge | true | boolean | Merge shapes |
| shadow | true | boolean | Shadow pass |

## Files and dependencies

- `src/index.js`: supported renderer entry point.
- `src/parameters.js`: canonical defaults, ranges and normalizer.
- `src/validation.js`: strict parameter and JSON format validation.
- `demo/`: adjustable UI and procedural sample images.
- `scripts/serve.mjs`: loopback-only static server.
- `tests/`: parameter, server and real-browser smoke checks.

No third-party runtime dependency. Uses browser WebGL 2 and Canvas APIs.

## Verify

```sh
node --test tests/*.test.mjs
```

With the server running, open [browser checks](http://127.0.0.1:4172/tests/browser.html). This draws real WebGL frames, compares changed pixels, checks controls, JSON, local image loading, pause behavior and a narrow iframe. Tests use generated fixtures only. The result stays visible as JSON.

Chromium rendering and interaction were checked on Windows and macOS for this release. A narrow desktop viewport is not a physical-phone test. Safari, Firefox, mobile GPUs, assistive technologies and sustained performance still need their own validation.

## Constraints

This is a screen-space optical approximation. It only samples content supplied to the canvas; it cannot refract arbitrary DOM elements or the desktop. The canvas needs a background image. Demo object placement is not included in optical parameter exports. If WebGL is unavailable, the demo shows an error. If the graphics context is lost, use Reload demo. This package is an effect implementation, not a native product replica.

## License

Own implementation and procedural samples: MIT, see [LICENSE](LICENSE). Third-party notices remain in their original license files. See [SOURCES.md](SOURCES.md) for provenance and the vendored dependency boundary.
