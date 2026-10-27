# Music backdrop

One image becomes an animated backdrop through rotating layers, Gaussian blur, mesh interpolation and color controls. It is image-driven, not audio-reactive.

[中文说明](README.zh-CN.md) · [Source and licenses](SOURCES.md)

## Run the demo

Requires Node.js 20 or newer to serve files. There is no build step and no dependency installation.

```sh
node scripts/serve.mjs --port 4173
```

Open [http://127.0.0.1:4173/](http://127.0.0.1:4173/). On Windows, double-click `start-demo.cmd` and open the printed address. Keep the terminal running; Ctrl+C stops it. Choose a different port if needed. Do not open the HTML with a file URL, because ES modules need an HTTP origin.

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
import {BackdropRenderer} from './src/index.js';
const canvas = document.querySelector('canvas');
const effect = new BackdropRenderer(canvas, message => console.info(message), {maxFps:60});
const image = new Image(); image.src = './artwork.png'; await image.decode();
effect.setImage(image, {animate:false});
effect.setParameters({blur:120, speed:.6, saturation:1.7});
effect.setPaused(matchMedia('(prefers-reduced-motion: reduce)').matches);
// When removing the effect: effect.destroy();
```

`new BackdropRenderer(canvas, onError?, {maxFps:60, preserveDrawingBuffer:true})`. `setImage(source, {animate:true})` prepares a local decoded image or canvas and optionally crossfades. `setParameters(partial)` validates an atomic update. `setPaused(boolean)` freezes the clock while allowing parameter edits. `resetTime()` restarts motion. `snapshot()` returns a PNG Blob. `diagnostics()` returns timing, dimensions, parameters and GL error state. `destroy()` stops scheduling and releases resources. The renderer owns its frame loop and resize observer.

Stop your own animation loop and remove your own event listeners before calling `destroy()`. For an application integration, pause while the page is hidden and honor reduced-motion preferences. The demo contains an example of those controls.

## Parameters

| Key | Default | Accepted range or type | Meaning |
| --- | --- | --- | --- |
| blur | 100 | 0 … 240 | Blur radius |
| speed | 1 | 0 … 3 | Speed |
| warp | 100 | 0 … 180 | Mesh distortion |
| saturation | 1.6 | 0 … 3 | Output saturation |
| sourceSaturation | 1.15 | 0 … 2.5 | Source saturation |
| scrim | 18 | 0 … 65 | Tone overlay |
| hue | 0 | -180 … 180 | Hue rotation |
| tint | "#0920d8" | color | Tint color |
| tintAmount | 0 | 0 … 75 | Tint strength |
| floor | 0.03 | 0 … 0.45 | Black floor |
| ceiling | 0.95 | 0.55 … 1 | White ceiling |
| mode | "dark" | dark, light, original | Tone mode |
| quality | 384 | 128 … 1024 | Offscreen resolution |

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

With the server running, open [browser checks](http://127.0.0.1:4173/tests/browser.html). This draws real WebGL frames, compares changed pixels, checks controls, JSON, local image loading, pause behavior and a narrow iframe. Tests use generated fixtures only. The result stays visible as JSON.

Chromium rendering and interaction were checked on Windows and macOS for this release. A narrow desktop viewport is not a physical-phone test. Safari, Firefox, mobile GPUs, assistive technologies and sustained performance still need their own validation.

## Constraints

The input is center-cropped to a square and prepared at a small resolution. Highly saturated images may clip at extreme settings. The animation is not driven by audio. The renderer can restore a lost GL context; the demo asks for a reload so all controls and clocks restart together. If WebGL is unavailable, the demo shows an error. If the graphics context is lost, use Reload demo. This package is an effect implementation, not a native product replica.

## License

Own implementation and procedural samples: MIT, see [LICENSE](LICENSE). Third-party notices remain in their original license files. See [SOURCES.md](SOURCES.md) for provenance and the vendored dependency boundary.
