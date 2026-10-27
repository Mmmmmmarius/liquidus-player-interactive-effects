import * as THREE from 'three';

// Two-layer reveal in one full-screen pass. `tBase` is always visible; `tAlt` shows wherever the reveal
// is on. The reveal is a mask texture (a fluid trail, a painted canvas, anything with a red channel)
// plus a wipe across the whole frame. Both layers are premultiplied textures, usually render targets.
// Bottom to top:
//   1. a flat background color, switching to the reveal color inside the reveal
//   2. base layer, shaded by revealShade under the reveal
//   3. alt layer through the reveal
//   4. optional rim along the reveal edge
//   5. rounded corners (uRadius in device pixels)
//
//   const comp = createRevealComposite({ palette: { bg: '#000000' } }, { pixelRatio });
//   comp.uniforms.tBase.value = rtA.texture;  comp.uniforms.tAlt.value = rtB.texture;
//   comp.uniforms.tMask.value = fluid.texture; comp.uniforms.uMaskSize.value.set(fluid.dyeSize.w, fluid.dyeSize.h);
//   renderer.render(comp.scene, comp.camera);
// Per frame also set uResolution (device pixels of the drawn area). Animate uWipe 0..1 for the wipe.

export const REVEAL_DEFAULTS = {
  palette: {
    bg: '#000000',
    reveal: '#e3e5ff',
  },
  mask: { threshold: 0.12, softness: 1.2 }, // softness: edge width in pixels
  wipe: { bulge: 0.18 },
  edge: { color: '#ffffff', opacity: 0, width: 1.5 },
  revealShade: 0.8,
};

// Reading a coarse mask so its thresholded outline is smooth and one pixel crisp at any zoom.
export const MASK_GLSL = /* glsl */ `
  // Cubic B-spline sampling from four bilinear taps. A mask from a coarse grid sampled bilinearly
  // and thresholded shows grid-sized steps along its outline; this one is smooth.
  float maskSample(sampler2D tex, vec2 texSize, vec2 uv) {
    vec2 st = uv * texSize - 0.5;
    vec2 i = floor(st);
    vec2 f = st - i;
    vec2 f2 = f * f;
    vec2 f3 = f2 * f;
    vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
    vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
    vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
    vec2 w3 = f3 / 6.0;
    vec2 g0 = w0 + w1;
    vec2 g1 = w2 + w3;
    vec2 p0 = (i - 0.5 + w1 / g0) / texSize;
    vec2 p1 = (i + 1.5 + w3 / g1) / texSize;
    return g0.y * (g0.x * texture2D(tex, vec2(p0.x, p0.y)).r + g1.x * texture2D(tex, vec2(p1.x, p0.y)).r)
         + g1.y * (g0.x * texture2D(tex, vec2(p0.x, p1.y)).r + g1.x * texture2D(tex, vec2(p1.x, p1.y)).r);
  }

  // Threshold with an edge softness pixels wide, however steep or shallow the mask's gradient is.
  float maskEdge(float value, float threshold, float softness) {
    float aa = max(fwidth(value), 1e-4) * softness;
    return smoothstep(threshold - aa, threshold + aa, value);
  }

  // Coverage of a line widthPx wide along the threshold contour.
  float maskRim(float value, float threshold, float widthPx) {
    float d = abs(value - threshold) / max(fwidth(value), 1e-4);
    return 1.0 - smoothstep(widthPx * 0.5 - 0.5, widthPx * 0.5 + 0.5, d);
  }
`;

// Wipe whose front rises from below the bottom edge to above the top as w goes 0 -> 1, bulging upward
// in the middle on the way and flattening out at both ends. x runs -1..1 across the frame.
export const WIPE_GLSL = /* glsl */ `
  float wipeFront(float x, float w, float bulge) {
    return mix(-bulge, 1.0 + bulge, w) + (1.0 - x * x) * bulge * sin(3.14159265 * w);
  }
`;

const FULLSCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec2 uResolution;
  uniform vec3 uBg;
  uniform vec3 uRevealBg;

  uniform sampler2D tBase;
  uniform sampler2D tAlt;
  uniform sampler2D tMask;
  uniform vec2 uMaskSize;
  uniform float uMaskThreshold;
  uniform float uMaskSoftness;
  uniform float uMaskStrength;
  uniform float uRevealShade;
  uniform float uWipe;
  uniform float uWipeBulge;
  uniform vec3 uEdgeColor;
  uniform float uEdgeOpacity;
  uniform float uEdgeWidth;
  uniform float uRadius;

  varying vec2 vUv;

  ${MASK_GLSL}
  ${WIPE_GLSL}

  void main() {
    vec2 uv = vUv;

    float dye = maskSample(tMask, uMaskSize, uv);
    float mask = maskEdge(dye, uMaskThreshold, uMaskSoftness) * uMaskStrength;
    float front = wipeFront(uv.x * 2.0 - 1.0, uWipe, uWipeBulge);
    float wipe = 1.0 - smoothstep(front - 0.004, front + 0.004, uv.y);
    float reveal = clamp(mask + wipe, 0.0, 1.0);

    vec3 col = mix(uBg, uRevealBg, reveal);

    vec4 base = texture2D(tBase, uv);
    base.rgb *= mix(1.0, uRevealShade, reveal);
    col = col * (1.0 - base.a) + base.rgb;

    vec4 alt = texture2D(tAlt, uv) * reveal;
    col = col * (1.0 - alt.a) + alt.rgb;

    // Rim on the reveal boundary: the mask outline (not where the wipe already covers it) and the wipe front.
    if (uEdgeOpacity > 0.0) {
      float maskLine = maskRim(dye, uMaskThreshold, uEdgeWidth) * uMaskStrength * (1.0 - wipe);
      float frontDist = abs(uv.y - front) / max(fwidth(uv.y), 1e-5);
      float frontLine = (1.0 - smoothstep(uEdgeWidth * 0.5 - 0.5, uEdgeWidth * 0.5 + 0.5, frontDist))
        * step(0.001, uWipe) * step(uWipe, 0.999);
      col = mix(col, uEdgeColor, clamp(maskLine + frontLine, 0.0, 1.0) * uEdgeOpacity);
    }

    vec2 px = (uv - 0.5) * uResolution;
    vec2 q = abs(px) - (uResolution * 0.5 - vec2(uRadius));
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
    float alpha = 1.0 - smoothstep(-0.75, 0.75, sd);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
    gl_FragColor = vec4(gl_FragColor.rgb * alpha, alpha);
  }
`;

const color = (hex) => new THREE.Color(hex);

// options: the groups of REVEAL_DEFAULTS, each merged over its defaults.
// pixelRatio scales the rim width to device pixels.
export function createRevealComposite(options = {}, { pixelRatio = 1 } = {}) {
  const palette = { ...REVEAL_DEFAULTS.palette, ...options.palette };
  const mask = { ...REVEAL_DEFAULTS.mask, ...options.mask };
  const wipe = { ...REVEAL_DEFAULTS.wipe, ...options.wipe };
  const edge = { ...REVEAL_DEFAULTS.edge, ...options.edge };
  const revealShade = options.revealShade ?? REVEAL_DEFAULTS.revealShade;

  // A missing layer or mask reads as fully transparent instead of opaque black.
  const clear = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  clear.needsUpdate = true;

  const uniforms = {
    uResolution: { value: new THREE.Vector2(1, 1) },
    uBg: { value: color(palette.bg) },
    uRevealBg: { value: color(palette.reveal) },

    tBase: { value: clear },
    tAlt: { value: clear },
    tMask: { value: clear },
    uMaskSize: { value: new THREE.Vector2(1, 1) },
    uMaskThreshold: { value: mask.threshold },
    uMaskSoftness: { value: mask.softness },
    uMaskStrength: { value: 1 },
    uRevealShade: { value: revealShade },
    uWipe: { value: 0 },
    uWipeBulge: { value: wipe.bulge },
    uEdgeColor: { value: color(edge.color) },
    uEdgeOpacity: { value: edge.opacity },
    uEdgeWidth: { value: edge.width * pixelRatio },
    uRadius: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: FRAGMENT,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  return {
    material,
    uniforms,
    scene,
    camera,
    dispose() {
      material.dispose();
      quad.geometry.dispose();
      clear.dispose();
    },
  };
}
