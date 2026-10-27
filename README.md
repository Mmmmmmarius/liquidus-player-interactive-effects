# Liquidus Player · interactive effects

Three standalone WebGL effects from the Liquidus Player project. Each folder runs on its own, comes with a parameter playground, and needs no build step or package installation.

| Effect | What it does | Runtime |
| --- | --- | --- |
| [fluid-reveal](fluid-reveal/) | A pointer-driven fluid trail reveals a second image. | Three.js r170, bundled |
| [liquid-glass](liquid-glass/) | Rounded shapes refract an image with dispersion, layered blur, soft unions, rim light and a shadow. | WebGL 2 |
| [music-backdrop](music-backdrop/) | One image becomes a slowly evolving color field through rotating layers, blur and mesh warping. | WebGL 2 |

## Run a demo

Requires Node.js 20 or newer.

```sh
cd liquid-glass
node scripts/serve.mjs --port 4172
```

Then open http://127.0.0.1:4172/. Use port 4171 for fluid-reveal and 4173 for music-backdrop. Each folder's README covers the parameters, the integration API and the tests.

## Tested

Chromium on Windows and macOS. Safari, Firefox, phones and mobile GPUs have not been tested yet.

## 中文说明

Liquidus Player 项目里的三个交互效果，每个文件夹都能单独运行，并带一个可以直接调参数的 demo。安装 Node.js 20 或更新版本后，进入对应文件夹运行上面的命令即可，不需要安装依赖。各文件夹里有中文说明。

## License

MIT © 2026 Marius, see [LICENSE](LICENSE). fluid-reveal bundles Three.js r170 under its own MIT license in `fluid-reveal/vendor/LICENSE.three`. Each folder's `SOURCES.md` lists its visual references.
