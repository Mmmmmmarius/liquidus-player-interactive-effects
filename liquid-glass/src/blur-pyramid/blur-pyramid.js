// Two blur levels from one source, for glass and other frosted surfaces.
// light: 1/2 resolution, one separable 9-tap gaussian.  heavy: 1/4 resolution, blurred again from light.
// Uses a passes object from ../gl-pass/gl-pass.js.

const FRAG_BLUR = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uOutRes;
uniform vec2 uDir;
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / uOutRes;
  // 9 taps folded into 5 reads through linear filtering
  vec3 c = texture(uSrc, uv).rgb * 0.2270270270;
  c += texture(uSrc, uv + uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture(uSrc, uv - uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture(uSrc, uv + uDir * 3.2307692308).rgb * 0.0702702703;
  c += texture(uSrc, uv - uDir * 3.2307692308).rgb * 0.0702702703;
  o = vec4(c, 1.0);
}`;

const FRAG_COPY = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uOutRes;
out vec4 o;
void main() { o = vec4(texture(uSrc, gl_FragCoord.xy / uOutRes).rgb, 1.0); }`;

/**
 * createBlurPyramid(passes) -> {
 *   resize(width, height)              full-resolution size of the source, device px
 *   run(source, radius, heavyRatio)    source = { tex, w, h }; radius in full-res device px at the light level;
 *                                      heavy is about heavyRatio times wider. Returns { light, heavy } targets.
 *   destroy()
 * }
 */
export function createBlurPyramid(passes) {
  const { gl } = passes;
  const blurProg = passes.program(FRAG_BLUR);
  const copyProg = passes.program(FRAG_COPY);
  let halfA, halfB, quarterA, quarterB;

  function resize(width, height) {
    [halfA, halfB, quarterA, quarterB].forEach(passes.free);
    const hw = Math.max(1, width >> 1), hh = Math.max(1, height >> 1);
    const qw = Math.max(1, width >> 2), qh = Math.max(1, height >> 2);
    halfA = passes.target(hw, hh); halfB = passes.target(hw, hh);
    quarterA = passes.target(qw, qh); quarterB = passes.target(qw, qh);
  }

  function copy(src, out) {
    passes.draw(copyProg, out, (u) => {
      passes.bind(0, src.tex, u.uSrc);
      gl.uniform2f(u.uOutRes, out.w, out.h);
    });
  }

  // Blur `io` in place, using `tmp` for the horizontal half. radius is in io's own pixels.
  function blur(io, tmp, radius) {
    // the kernel reaches about 3.2 steps each side
    const step = Math.max(radius / 3.2, 0.0001);
    passes.draw(blurProg, tmp, (u) => {
      passes.bind(0, io.tex, u.uSrc);
      gl.uniform2f(u.uOutRes, tmp.w, tmp.h);
      gl.uniform2f(u.uDir, step / io.w, 0);
    });
    passes.draw(blurProg, io, (u) => {
      passes.bind(0, tmp.tex, u.uSrc);
      gl.uniform2f(u.uOutRes, io.w, io.h);
      gl.uniform2f(u.uDir, 0, step / tmp.h);
    });
  }

  function run(source, radius, heavyRatio = 2.5) {
    if (!halfA) resize(source.w, source.h);
    copy(source, halfA);
    blur(halfA, halfB, radius / 2);
    copy(halfA, quarterA);
    blur(quarterA, quarterB, (radius * (heavyRatio - 1)) / 4);
    return { light: halfA, heavy: quarterA };
  }

  function destroy() {
    [halfA, halfB, quarterA, quarterB].forEach(passes.free);
  }

  return { resize, run, destroy };
}
