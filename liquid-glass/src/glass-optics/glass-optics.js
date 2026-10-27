// Glass optics as GLSL functions: refraction along a surface normal, chromatic aberration offsets,
// colour adjustment, a key + fill rim light and a soft drop shadow.
// The caller supplies the distance to the edge and the outward normal (sdf-shapes gives both) and does
// the texture sampling, so this works with any background and any shape source.
// Independent WebGL approximation; see SOURCES.md for visual references.

export const GLASS_DEFAULTS = {
  height: 24,         // CSS px, width of the bevel that bends light
  curvature: 1.25,    // bevel profile exponent; >1 pulls the bend towards the rim
  refract: 1.0,       // bend strength in bevel widths; 0 = off
  aberration: 0.12,   // R/B offset spread as a fraction of the refraction offset; 0 = off
  saturation: 1.35,
  brightness: 0.04,
  tint: [1, 1, 1, 0], // rgb + strength
  keyAngle: 120,      // degrees, 90 = light from the top; fill is opposite
  keyAmount: 0.6,
  fillAmount: 0.35,
  fillRatio: 0.45,    // fill drawn this much dimmer than the key
  rimWidth: 2.5,      // CSS px, how deep the specular rim reaches
  rimSharpness: 2.0,  // exponent on N.L
  shadowOpacity: 0.22,
  shadowRadius: 22,   // CSS px
  shadowOffsetY: 8,   // CSS px; shift the SDF by shadowOffset() before calling glassShadow
};

export const GLASS_GLSL = `
uniform float uGlassHeight;   // device px
uniform float uGlassCurv;
uniform float uGlassRefract;
uniform float uGlassAberr;
uniform float uGlassSat;
uniform float uGlassLift;
uniform vec4 uGlassTint;
uniform vec2 uGlassKeyDir;    // unit vector towards the key light, top-left pixel space
uniform float uGlassKeyAmt;
uniform float uGlassFillAmt;
uniform float uGlassRimW;     // device px
uniform float uGlassRimSharp;
uniform float uGlassShadowOp;
uniform float uGlassShadowR;  // device px

// 0 at the rim, 1 past the bevel
float glassDepthT(float depth) { return clamp(depth / uGlassHeight, 0.0, 1.0); }

// quarter-circle bevel: steep at the rim, flat inside
float glassBend(float depth) {
  float t = 1.0 - glassDepthT(depth);
  return pow(1.0 - sqrt(1.0 - t * t), uGlassCurv);
}

// Sample offsets for the three channels. Sampling outward along the normal pulls content from beyond
// the rim into it, so the edge wraps the background like a thick lens.
void glassOffsets(vec2 n, float depth, out vec2 oR, out vec2 oG, out vec2 oB) {
  oG = n * glassBend(depth) * uGlassRefract * uGlassHeight;
  oR = oG * (1.0 + uGlassAberr);
  oB = oG * (1.0 - uGlassAberr);
}

vec3 glassColor(vec3 c) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uGlassSat) + uGlassLift;
  return mix(c, uGlassTint.rgb, uGlassTint.a);
}

// key light from uGlassKeyDir, fill from the opposite side, both fading in from the rim
float glassRim(vec2 n, float depth) {
  float rim = exp(-depth / max(uGlassRimW, 0.01));
  float key = pow(max(dot(n, uGlassKeyDir), 0.0), uGlassRimSharp) * uGlassKeyAmt;
  float fill = pow(max(dot(n, -uGlassKeyDir), 0.0), uGlassRimSharp) * uGlassFillAmt;
  return (key + fill) * rim + 0.06 * rim;
}

// dShifted: the SDF sampled at p - shadow offset
float glassShadow(float dShifted) {
  return uGlassShadowOp * (1.0 - smoothstep(-uGlassShadowR * 0.3, uGlassShadowR, dShifted));
}
`;

/**
 * Upload glass parameters to a program that includes GLASS_GLSL.
 * on: { refraction, aberration, highlight, shadow } switches, all true by default.
 */
export function setGlassUniforms(gl, u, params, { dpr = 1, on = {} } = {}) {
  const P = { ...GLASS_DEFAULTS, ...params };
  const is = (k) => on[k] !== false;
  const a = (P.keyAngle * Math.PI) / 180;
  gl.uniform1f(u.uGlassHeight, Math.max(P.height * dpr, 0.5));
  gl.uniform1f(u.uGlassCurv, P.curvature);
  gl.uniform1f(u.uGlassRefract, is('refraction') ? P.refract : 0);
  gl.uniform1f(u.uGlassAberr, is('aberration') && is('refraction') ? P.aberration : 0);
  gl.uniform1f(u.uGlassSat, P.saturation);
  gl.uniform1f(u.uGlassLift, P.brightness);
  gl.uniform4fv(u.uGlassTint, P.tint);
  // 90 degrees points up the screen, which is negative y in top-left pixel space
  gl.uniform2f(u.uGlassKeyDir, Math.cos(a), -Math.sin(a));
  gl.uniform1f(u.uGlassKeyAmt, is('highlight') ? P.keyAmount : 0);
  gl.uniform1f(u.uGlassFillAmt, is('highlight') ? P.fillAmount * P.fillRatio : 0);
  gl.uniform1f(u.uGlassRimW, P.rimWidth * dpr);
  gl.uniform1f(u.uGlassRimSharp, P.rimSharpness);
  gl.uniform1f(u.uGlassShadowOp, is('shadow') ? P.shadowOpacity : 0);
  gl.uniform1f(u.uGlassShadowR, P.shadowRadius * dpr);
}

/** Shadow offset in device px, to shift the SDF lookup: d = shapesSDF(p - offset). */
export function shadowOffset(params, dpr = 1) {
  return [0, (params.shadowOffsetY ?? GLASS_DEFAULTS.shadowOffsetY) * dpr];
}
