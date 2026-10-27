import * as THREE from 'three';

// Stable-fluids simulation driven by the pointer. Output: `texture`, a dye field in the red channel,
// `dyeSize` cells wide. Threshold it into a mask (reveal-composite's MASK_GLSL reads it smoothly).
//
//   const fluid = new FluidTrail(renderer, { radius: 0.007 });
//   fluid.resize(width, height);          // CSS pixels of the area the dye maps onto
//   fluid.step(dt, pointer);              // pointer: { uv: {x, y}, delta: {x, y} }, uv 0..1 with y up
//   material.uniforms.tMask.value = fluid.texture;
//
// Velocity runs on a coarse grid; the dye runs on a finer one, so thin strokes stay crisp.
// Each step: curl -> vorticity confinement -> divergence -> pressure (Jacobi) -> subtract gradient
// -> advect velocity -> advect dye (MacCormack).
// The pointer is splatted as a segment from its last position, so fast moves leave a continuous stream.

const FULLSCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const STROKE = /* glsl */ `
  uniform sampler2D uTarget;
  uniform vec2 uFrom;
  uniform vec2 uTo;
  uniform vec3 uValue;
  uniform float uRadius;
  uniform float uAspect;
  varying vec2 vUv;
  void main() {
    vec2 s = vec2(uAspect, 1.0);
    vec2 pa = vUv * s - uFrom * s;
    vec2 ba = uTo * s - uFrom * s;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
    float d = length(pa - ba * h);
    vec3 add = uValue * exp(-(d * d) / (uRadius * uRadius));
    gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + add, 1.0);
  }
`;

// Semi-Lagrangian advection. uDirection = -1 runs it backward in time (for the MacCormack pass).
const ADVECT = /* glsl */ `
  uniform sampler2D uVelocity;
  uniform sampler2D uSource;
  uniform vec2 uTexel;
  uniform float uDt;
  uniform float uDecay;
  uniform float uDirection;
  varying vec2 vUv;
  void main() {
    vec2 back = vUv - uDirection * uDt * texture2D(uVelocity, vUv).xy * uTexel;
    gl_FragColor = vec4(texture2D(uSource, back).xyz * exp(-uDecay * uDt), 1.0);
  }
`;

// MacCormack correction: forward + half the round-trip error, clamped to the four source texels
// around the departure point. Plain semi-Lagrangian steps blur a thin stroke away within a second;
// this keeps its edges.
const CORRECT = /* glsl */ `
  uniform sampler2D uVelocity;
  uniform sampler2D uSource;
  uniform sampler2D uForward;
  uniform sampler2D uRoundTrip;
  uniform vec2 uTexel;
  uniform vec2 uDyeTexel;
  uniform float uDt;
  uniform float uDecay;
  uniform float uSharpness;
  varying vec2 vUv;
  void main() {
    vec2 back = vUv - uDt * texture2D(uVelocity, vUv).xy * uTexel;
    vec2 base = (floor(back / uDyeTexel - 0.5) + 0.5) * uDyeTexel;
    vec3 a = texture2D(uSource, base).xyz;
    vec3 b = texture2D(uSource, base + vec2(uDyeTexel.x, 0.0)).xyz;
    vec3 c = texture2D(uSource, base + vec2(0.0, uDyeTexel.y)).xyz;
    vec3 d = texture2D(uSource, base + uDyeTexel).xyz;
    vec3 lo = min(min(a, b), min(c, d));
    vec3 hi = max(max(a, b), max(c, d));
    vec3 forward = texture2D(uForward, vUv).xyz;
    vec3 corrected = forward + 0.5 * (texture2D(uSource, vUv).xyz - texture2D(uRoundTrip, vUv).xyz);
    // Sharpness 1 keeps every filament; lower values let the plain (softer) step smooth out the specks.
    vec3 dye = mix(forward, clamp(corrected, lo, hi), uSharpness);
    gl_FragColor = vec4(dye * exp(-uDecay * uDt), 1.0);
  }
`;

const CURL = /* glsl */ `
  uniform sampler2D uVelocity;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    float l = texture2D(uVelocity, vUv - vec2(uTexel.x, 0.0)).y;
    float r = texture2D(uVelocity, vUv + vec2(uTexel.x, 0.0)).y;
    float b = texture2D(uVelocity, vUv - vec2(0.0, uTexel.y)).x;
    float t = texture2D(uVelocity, vUv + vec2(0.0, uTexel.y)).x;
    gl_FragColor = vec4(0.5 * ((r - l) - (t - b)), 0.0, 0.0, 1.0);
  }
`;

// Push velocity around the local spin, which keeps small eddies alive instead of letting them smear out.
const VORTICITY = /* glsl */ `
  uniform sampler2D uVelocity;
  uniform sampler2D uCurl;
  uniform vec2 uTexel;
  uniform float uStrength;
  uniform float uDt;
  varying vec2 vUv;
  void main() {
    float l = abs(texture2D(uCurl, vUv - vec2(uTexel.x, 0.0)).x);
    float r = abs(texture2D(uCurl, vUv + vec2(uTexel.x, 0.0)).x);
    float b = abs(texture2D(uCurl, vUv - vec2(0.0, uTexel.y)).x);
    float t = abs(texture2D(uCurl, vUv + vec2(0.0, uTexel.y)).x);
    float c = texture2D(uCurl, vUv).x;
    vec2 n = vec2(t - b, r - l);
    n /= length(n) + 1e-5;
    vec2 force = vec2(n.x, -n.y) * c * uStrength;
    vec2 v = texture2D(uVelocity, vUv).xy + force * uDt;
    gl_FragColor = vec4(clamp(v, vec2(-2000.0), vec2(2000.0)), 0.0, 1.0);
  }
`;

const DIVERGENCE = /* glsl */ `
  uniform sampler2D uVelocity;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    vec2 c = texture2D(uVelocity, vUv).xy;
    float l = texture2D(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
    float r = texture2D(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
    float b = texture2D(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
    float t = texture2D(uVelocity, vUv + vec2(0.0, uTexel.y)).y;
    // Walls: reflect the velocity component that points out of the box.
    if (vUv.x - uTexel.x < 0.0) l = -c.x;
    if (vUv.x + uTexel.x > 1.0) r = -c.x;
    if (vUv.y - uTexel.y < 0.0) b = -c.y;
    if (vUv.y + uTexel.y > 1.0) t = -c.y;
    gl_FragColor = vec4(0.5 * (r - l + t - b), 0.0, 0.0, 1.0);
  }
`;

const PRESSURE = /* glsl */ `
  uniform sampler2D uPressure;
  uniform sampler2D uDivergence;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    float l = texture2D(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
    float r = texture2D(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
    float b = texture2D(uPressure, vUv - vec2(0.0, uTexel.y)).x;
    float t = texture2D(uPressure, vUv + vec2(0.0, uTexel.y)).x;
    float div = texture2D(uDivergence, vUv).x;
    gl_FragColor = vec4((l + r + b + t - div) * 0.25, 0.0, 0.0, 1.0);
  }
`;

const GRADIENT = /* glsl */ `
  uniform sampler2D uPressure;
  uniform sampler2D uVelocity;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    float l = texture2D(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
    float r = texture2D(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
    float b = texture2D(uPressure, vUv - vec2(0.0, uTexel.y)).x;
    float t = texture2D(uPressure, vUv + vec2(0.0, uTexel.y)).x;
    vec2 v = texture2D(uVelocity, vUv).xy - 0.5 * vec2(r - l, t - b);
    gl_FragColor = vec4(v, 0.0, 1.0);
  }
`;

const SCALE = /* glsl */ `
  uniform sampler2D uSource;
  uniform float uScale;
  varying vec2 vUv;
  void main() {
    gl_FragColor = vec4(texture2D(uSource, vUv).xyz * uScale, 1.0);
  }
`;

export const FLUID_DEFAULTS = {
  simScale: 0.14, // velocity grid relative to the viewport
  maxSimSize: 224, // cap on the velocity grid's longest side, in cells
  dyeScale: 0.4, // dye grid relative to the viewport
  maxDyeSize: 720,
  stepRate: 60, // simulation steps per second, independent of the display's refresh rate
  force: 1400, // velocity added per unit of pointer travel; higher blows the stroke into wide plumes
  forceRadius: 0.02, // width of the push around the stroke (fraction of the canvas height)
  radius: 0.007, // width of the dye stroke (fraction of the canvas height); smaller = thinner stream
  dyeAmount: 1.2, // dye per stroke width of travel
  curl: 10, // vorticity confinement; higher = curlier
  velocityDecay: 0.6, // per second; low keeps the flow moving after the pointer passes
  dyeDecay: 0.45, // per second; low keeps the trail longer
  sharpness: 0.6, // 0 = soft, smoky trail; 1 = crisp ink with fine filaments
  pressureIterations: 16,
  pressureFade: 0.8,
};

function pingPong(create) {
  const pair = { read: create(), write: create() };
  pair.swap = () => {
    const tmp = pair.read;
    pair.read = pair.write;
    pair.write = tmp;
  };
  pair.dispose = () => {
    pair.read.dispose();
    pair.write.dispose();
  };
  return pair;
}

export function supportsFluid(renderer) {
  const ext = renderer.extensions;
  return ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
}

export class FluidTrail {
  constructor(renderer, options = {}) {
    this.renderer = renderer;
    this.options = { ...FLUID_DEFAULTS, ...options };
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.texel = new THREE.Vector2();
    this.aspect = 1;
    this.size = null;
    this.dyeSize = null;

    const pass = (fragmentShader, uniforms) =>
      new THREE.ShaderMaterial({
        vertexShader: FULLSCREEN_VERT,
        fragmentShader,
        uniforms,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
      });

    this.materials = {
      stroke: pass(STROKE, {
        uTarget: { value: null },
        uFrom: { value: new THREE.Vector2() },
        uTo: { value: new THREE.Vector2() },
        uValue: { value: new THREE.Vector3() },
        uRadius: { value: 0.01 },
        uAspect: { value: 1 },
      }),
      advect: pass(ADVECT, {
        uVelocity: { value: null },
        uSource: { value: null },
        uTexel: { value: this.texel },
        uDt: { value: 0 },
        uDecay: { value: 0 },
        uDirection: { value: 1 },
      }),
      correct: pass(CORRECT, {
        uVelocity: { value: null },
        uSource: { value: null },
        uForward: { value: null },
        uRoundTrip: { value: null },
        uTexel: { value: this.texel },
        uDyeTexel: { value: new THREE.Vector2() },
        uDt: { value: 0 },
        uDecay: { value: 0 },
        uSharpness: { value: 0.6 },
      }),
      curl: pass(CURL, { uVelocity: { value: null }, uTexel: { value: this.texel } }),
      vorticity: pass(VORTICITY, {
        uVelocity: { value: null },
        uCurl: { value: null },
        uTexel: { value: this.texel },
        uStrength: { value: 0 },
        uDt: { value: 0 },
      }),
      divergence: pass(DIVERGENCE, { uVelocity: { value: null }, uTexel: { value: this.texel } }),
      pressure: pass(PRESSURE, {
        uPressure: { value: null },
        uDivergence: { value: null },
        uTexel: { value: this.texel },
      }),
      gradient: pass(GRADIENT, {
        uPressure: { value: null },
        uVelocity: { value: null },
        uTexel: { value: this.texel },
      }),
      scale: pass(SCALE, { uSource: { value: null }, uScale: { value: 1 } }),
    };
  }

  static gridSize(viewWidth, viewHeight, scale, max) {
    const s = Math.min(scale, max / Math.max(viewWidth, viewHeight));
    return { w: Math.max(32, Math.round(viewWidth * s)), h: Math.max(32, Math.round(viewHeight * s)) };
  }

  resize(viewWidth, viewHeight) {
    const o = this.options;
    const sim = FluidTrail.gridSize(viewWidth, viewHeight, o.simScale, o.maxSimSize);
    const dye = FluidTrail.gridSize(viewWidth, viewHeight, o.dyeScale, o.maxDyeSize);
    if (this.size && this.size.w === sim.w && this.size.h === sim.h && this.dyeSize.w === dye.w && this.dyeSize.h === dye.h) return;
    this.disposeTargets();

    const target = ({ w, h }) => () =>
      new THREE.WebGLRenderTarget(w, h, {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
      });
    this.velocity = pingPong(target(sim));
    this.pressure = pingPong(target(sim));
    this.divergence = target(sim)();
    this.curl = target(sim)();
    this.dye = pingPong(target(dye));
    this.dyeForward = target(dye)();
    this.dyeRoundTrip = target(dye)();
    this.size = sim;
    this.dyeSize = dye;
    this.texel.set(1 / sim.w, 1 / sim.h);
    this.materials.correct.uniforms.uDyeTexel.value.set(1 / dye.w, 1 / dye.h);
    this.aspect = viewWidth / viewHeight;
  }

  run(material, output) {
    this.quad.material = material;
    this.renderer.setRenderTarget(output);
    this.renderer.render(this.scene, this.camera);
  }

  stroke(from, to, delta, strength) {
    const o = this.options;
    const m = this.materials.stroke;
    m.uniforms.uFrom.value.set(from.x, from.y);
    m.uniforms.uTo.value.set(to.x, to.y);
    m.uniforms.uAspect.value = this.aspect;

    m.uniforms.uTarget.value = this.velocity.read.texture;
    m.uniforms.uRadius.value = o.forceRadius;
    m.uniforms.uValue.value.set(delta.x * o.force, delta.y * o.force, 0);
    this.run(m, this.velocity.write);
    this.velocity.swap();

    m.uniforms.uTarget.value = this.dye.read.texture;
    m.uniforms.uRadius.value = o.radius;
    m.uniforms.uValue.value.set(strength * o.dyeAmount, 0, 0);
    this.run(m, this.dye.write);
    this.dye.swap();
  }

  step(dt, pointer) {
    if (!this.size) return;
    const o = this.options;
    const moved = Math.hypot(pointer.delta.x * this.aspect, pointer.delta.y);
    if (moved > 1e-6) {
      const from = { x: pointer.uv.x - pointer.delta.x, y: pointer.uv.y - pointer.delta.y };
      // Dye per unit of distance, not per frame: overlapping strokes then sum to the same density
      // at 60 Hz, 144 Hz or 480 fps, and slow strokes are as solid as fast ones.
      this.stroke(from, pointer.uv, pointer.delta, Math.min(1, moved / (1.77 * o.radius)));
    }

    // Fixed-rate simulation: the same look on every display, and less numerical blur on fast ones.
    const h = 1 / o.stepRate;
    this.accumulator = Math.min((this.accumulator || 0) + dt, h * 2);
    while (this.accumulator >= h) {
      this.substep(h);
      this.accumulator -= h;
    }
    this.renderer.setRenderTarget(null);
  }

  substep(dt) {
    const o = this.options;
    this.materials.curl.uniforms.uVelocity.value = this.velocity.read.texture;
    this.run(this.materials.curl, this.curl);

    const vorticity = this.materials.vorticity;
    vorticity.uniforms.uVelocity.value = this.velocity.read.texture;
    vorticity.uniforms.uCurl.value = this.curl.texture;
    vorticity.uniforms.uStrength.value = o.curl;
    vorticity.uniforms.uDt.value = dt;
    this.run(vorticity, this.velocity.write);
    this.velocity.swap();

    this.materials.divergence.uniforms.uVelocity.value = this.velocity.read.texture;
    this.run(this.materials.divergence, this.divergence);

    const scale = this.materials.scale;
    scale.uniforms.uSource.value = this.pressure.read.texture;
    scale.uniforms.uScale.value = o.pressureFade;
    this.run(scale, this.pressure.write);
    this.pressure.swap();

    const pressure = this.materials.pressure;
    pressure.uniforms.uDivergence.value = this.divergence.texture;
    for (let i = 0; i < o.pressureIterations; i += 1) {
      pressure.uniforms.uPressure.value = this.pressure.read.texture;
      this.run(pressure, this.pressure.write);
      this.pressure.swap();
    }

    const gradient = this.materials.gradient;
    gradient.uniforms.uPressure.value = this.pressure.read.texture;
    gradient.uniforms.uVelocity.value = this.velocity.read.texture;
    this.run(gradient, this.velocity.write);
    this.velocity.swap();

    // All advections step in velocity-grid texels, the unit the velocity is stored in.
    const advect = this.materials.advect;
    advect.uniforms.uDt.value = dt;
    advect.uniforms.uDirection.value = 1;
    advect.uniforms.uVelocity.value = this.velocity.read.texture;
    advect.uniforms.uSource.value = this.velocity.read.texture;
    advect.uniforms.uDecay.value = o.velocityDecay;
    this.run(advect, this.velocity.write);
    this.velocity.swap();

    // Dye: forward, then back again, then correct by half the round-trip error.
    advect.uniforms.uVelocity.value = this.velocity.read.texture;
    advect.uniforms.uDecay.value = 0;
    advect.uniforms.uSource.value = this.dye.read.texture;
    this.run(advect, this.dyeForward);
    advect.uniforms.uDirection.value = -1;
    advect.uniforms.uSource.value = this.dyeForward.texture;
    this.run(advect, this.dyeRoundTrip);
    advect.uniforms.uDirection.value = 1;

    const correct = this.materials.correct;
    correct.uniforms.uVelocity.value = this.velocity.read.texture;
    correct.uniforms.uSource.value = this.dye.read.texture;
    correct.uniforms.uForward.value = this.dyeForward.texture;
    correct.uniforms.uRoundTrip.value = this.dyeRoundTrip.texture;
    correct.uniforms.uDt.value = dt;
    correct.uniforms.uDecay.value = o.dyeDecay;
    correct.uniforms.uSharpness.value = o.sharpness;
    this.run(correct, this.dye.write);
    this.dye.swap();
  }

  // Wipes the trail and stops all motion.
  clear() {
    if (!this.size) return;
    const renderer = this.renderer;
    const color = renderer.getClearColor(new THREE.Color());
    const alpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    const targets = [
      this.velocity.read, this.velocity.write, this.pressure.read, this.pressure.write, this.divergence, this.curl,
      this.dye.read, this.dye.write, this.dyeForward, this.dyeRoundTrip,
    ];
    for (const target of targets) {
      renderer.setRenderTarget(target);
      renderer.clear();
    }
    renderer.setRenderTarget(null);
    renderer.setClearColor(color, alpha);
  }

  get texture() {
    return this.dye ? this.dye.read.texture : null;
  }

  disposeTargets() {
    if (!this.size) return;
    this.velocity.dispose();
    this.pressure.dispose();
    this.divergence.dispose();
    this.curl.dispose();
    this.dye.dispose();
    this.dyeForward.dispose();
    this.dyeRoundTrip.dispose();
    this.size = null;
    this.dyeSize = null;
  }

  dispose() {
    this.disposeTargets();
    Object.values(this.materials).forEach((m) => m.dispose());
    this.quad.geometry.dispose();
  }
}
