// Liquid glass: assembles gl-pass, blur-pyramid, sdf-shapes and glass-optics into one renderer.
// Per frame: background -> scene target -> two blur levels -> one glass pass to the canvas.
import { getGL, createPasses, uploadTexture, fitCanvas } from './gl-pass/gl-pass.js';
import { createBlurPyramid } from './blur-pyramid/blur-pyramid.js';
import { SDF_GLSL, setShapeUniforms } from './sdf-shapes/sdf-shapes.js';
import { GLASS_GLSL, setGlassUniforms, shadowOffset } from './glass-optics/glass-optics.js';

import {DEFAULTS, normalizeParameters, normalizeShapes} from './parameters.js';
export {DEFAULTS} from './parameters.js';

// Background into the scene target, cover-fitted. Image row 0 is the top; target row 0 is the bottom.
const FRAG_SCENE = `#version 300 es
precision highp float;
uniform sampler2D uBg;
uniform vec2 uRes;
uniform vec2 uBgSize;
uniform vec2 uPan;
out vec4 o;
void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float s = max(uRes.x / uBgSize.x, uRes.y / uBgSize.y);
  vec2 uv = ((p - 0.5 * uRes) / s + 0.5 * uBgSize + uPan) / uBgSize;
  o = vec4(texture(uBg, uv).rgb, 1.0);
}`;

const FRAG_GLASS = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uLight;
uniform sampler2D uHeavy;
uniform vec2 uRes;
uniform float uBlurOn;
uniform float uFrost;
uniform vec2 uShadowOff;
out vec4 o;
${SDF_GLSL}
${GLASS_GLSL}

vec3 at(sampler2D t, vec2 p) { return texture(t, vec2(p.x, uRes.y - p.y) / uRes).rgb; }

vec3 at3(sampler2D t, vec2 p, vec2 oR, vec2 oG, vec2 oB) {
  return vec3(at(t, p + oR).r, at(t, p + oG).g, at(t, p + oB).b);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float d = shapesSDF(p);

  vec3 outside = at(uScene, p) * (1.0 - glassShadow(shapesSDF(p - uShadowOff)));
  if (d > 1.5) { o = vec4(outside, 1.0); return; }

  vec2 n = shapesNormal(p);
  float depth = max(-d, 0.0);
  vec2 oR, oG, oB;
  glassOffsets(n, depth, oR, oG, oB);

  vec3 sharp = at3(uScene, p, oR, oG, oB);
  vec3 light = at3(uLight, p, oR, oG, oB);
  vec3 heavy = at3(uHeavy, p, oR, oG, oB);
  // layered blur: light blur at the rim, fading towards the heavy level inside
  float t = glassDepthT(depth);
  vec3 col = mix(sharp, mix(light, heavy, uFrost * smoothstep(0.0, 1.0, t)), uBlurOn);

  col = glassColor(col) + glassRim(n, depth);
  float a = clamp(0.5 - d, 0.0, 1.0);
  o = vec4(mix(outside, clamp(col, 0.0, 1.0), a), 1.0);
}`;

/**
 * createLiquidGlass(canvas) -> controller
 *   setBackground(source)  image, canvas, video or ImageBitmap; only page-owned content
 *   setShapes(shapes)      [{ x, y, w, h, r }] in CSS px: centre, full size, corner radius
 *   setParams(partial)     any keys of DEFAULTS
 *   render(timeMs)         one frame; call from requestAnimationFrame
 *   resize()               re-read the canvas CSS size (render also does this)
 *   destroy()
 */
export function createLiquidGlass(canvas) {
  const gl = getGL(canvas);
  if (!gl) throw new Error('WebGL 2 is not available in this browser');
  const passes = createPasses(gl);
  const sceneProg = passes.program(FRAG_SCENE);
  const glassProg = passes.program(FRAG_GLASS);
  const pyramid = createBlurPyramid(passes);

  let bg = uploadTexture(gl, new ImageData(new Uint8ClampedArray([40, 40, 48, 255]), 1, 1), undefined, { wrap: gl.MIRRORED_REPEAT });
  let bgSource = null;
  const params = structuredClone(DEFAULTS);
  let shapes = [];
  let size = { width: 0, height: 0, dpr: 1 };
  let scene = null;
  let destroyed = false;
  const guard = () => { if (destroyed) throw new Error('Liquid glass has been destroyed.'); };

  function resize() {
    guard();
    const s = fitCanvas(canvas);
    if (scene && !s.changed && s.width === size.width) return;
    size = s;
    passes.free(scene);
    scene = passes.target(s.width, s.height);
    pyramid.resize(s.width, s.height);
  }

  function setBackground(source) {
    guard();
    if (!(source.videoWidth || source.naturalWidth || source.width) || !(source.videoHeight || source.naturalHeight || source.height)) throw new TypeError('Decode the background before setBackground().');
    bgSource = source;
    bg = uploadTexture(gl, source, bg.tex, { wrap: gl.MIRRORED_REPEAT });
  }

  function render(timeMs = performance.now()) {
    guard();
    if (!Number.isFinite(timeMs)) throw new TypeError('timeMs must be finite.');
    resize();
    if (bgSource && bgSource.tagName === 'VIDEO') setBackground(bgSource);
    const P = params;
    const { width: W, height: H, dpr } = size;

    passes.draw(sceneProg, scene, (u) => {
      passes.bind(0, bg.tex, u.uBg);
      gl.uniform2f(u.uRes, W, H);
      gl.uniform2f(u.uBgSize, bg.w, bg.h);
      gl.uniform2f(u.uPan, (P.pan * timeMs) / 1000, 0);
    });

    const { light, heavy } = pyramid.run(scene, P.blurRadius * dpr);

    passes.draw(glassProg, null, (u) => {
      passes.bind(0, scene.tex, u.uScene);
      passes.bind(1, light.tex, u.uLight);
      passes.bind(2, heavy.tex, u.uHeavy);
      gl.uniform2f(u.uRes, W, H);
      gl.uniform1f(u.uBlurOn, P.blur ? 1 : 0);
      gl.uniform1f(u.uFrost, P.frost);
      gl.uniform2fv(u.uShadowOff, shadowOffset(P, dpr));
      setShapeUniforms(gl, u, shapes, { dpr, smoothness: P.merge ? P.smoothness : 0 });
      setGlassUniforms(gl, u, P, { dpr, on: P });
    }, W, H);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    bgSource = null;
    pyramid.destroy();
    passes.free(scene);
    gl.deleteTexture(bg.tex);
    passes.destroy();
  }

  resize();
  return {
    gl,
    setBackground,
    setShapes: (list) => { guard(); shapes = normalizeShapes(list); },
    setParams: (p) => { guard(); Object.assign(params, normalizeParameters(p, params)); },
    render,
    resize,
    destroy,
    get params() { return structuredClone(params); },
  };
}
