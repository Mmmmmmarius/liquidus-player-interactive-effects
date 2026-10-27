# 液态玻璃

这是可独立运行的 Liquid glass 效果包。核心接口、全部参数表和最小接入代码见 [README.md](README.md)。

## 启动

安装 Node.js 20 或更新版本后，在解压目录运行以下命令。无需安装依赖。

```sh
node scripts/serve.mjs --port 4172
```

打开 [本地 demo](http://127.0.0.1:4172/)。Windows 也可以双击 `start-demo.cmd`。终端需要保持运行，按 Ctrl+C 停止服务。不要直接双击 HTML 文件。

## 调参

右侧可以切换预设、拖动滑块或输入准确数值。左上角可以暂停、恢复和重置。系统开启减少动态效果时，首次进入会暂停，点击 Resume motion 即可启动。

展开 Save & load parameters 后，可以导出 JSON、导入文件或直接编辑参数。错误格式不会替换当前状态。超出范围的有效数字会被限制在支持范围内。导出仅包含效果参数，不包含本地图片、文件名和 demo 中的物体位置。

示例图片由程序生成。选择的图片仅在当前浏览器标签页中处理，不上传，也不持久保存。更换为自己的图片前，应自行确认其使用权。

## 验证与边界

运行 `node --test tests/*.test.mjs` 检查参数与本地服务器。打开 [浏览器检查](http://127.0.0.1:4172/tests/browser.html) 可验证 WebGL 渲染、参数、JSON、图片加载和窄屏布局。

本版检查范围是 Windows 和 macOS 上的 Chromium 浏览器。桌面窄屏不等于实体手机测试，其他浏览器、移动 GPU 和长时间运行表现仍需验证。

玻璃只折射传入 canvas 的背景，不能直接折射任意 DOM。选择 Shape placement 可以调节形状，也可拖动，或聚焦画布后使用方向键。形状位置不会进入光学参数 JSON。

## 许可

自有代码与程序生成的示例采用 MIT。来源与第三方许可见 [SOURCES.md](SOURCES.md)。
