// Raw WebGL 2 full-screen passes: one shared triangle, programs with a uniform map, and off-screen targets.
// No three.js. Every pass draws a single triangle that covers the viewport; the fragment shader does the work.

export const FULLSCREEN_VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

/** WebGL 2 context with the defaults these passes expect, or null when the browser has none. */
export function getGL(canvas, attrs = {}) {
  return canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, ...attrs });
}

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s) || 'shader compile failed';
    gl.deleteShader(s);
    throw new Error(log);
  }
  return s;
}

/**
 * createPasses(gl) -> {
 *   program(fragSrc)            { p, u }  u maps uniform names to locations; array uniforms drop the [0]
 *   target(w, h, opts)          { tex, fb, w, h }  RGBA8, linear, clamped
 *   free(target)
 *   draw(prog, out, setup, w, h) out = target or null for the canvas (then w, h are the canvas size)
 *   bind(unit, tex, loc)         bind a texture to a unit and point a sampler uniform at it
 *   destroy()
 * }
 */
export function createPasses(gl) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const programs = [];

  function program(fragSrc) {
    const p = gl.createProgram();
    const vs = compile(gl, gl.VERTEX_SHADER, FULLSCREEN_VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link failed');
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
    }
    const prog = { p, u };
    programs.push(prog);
    return prog;
  }

  function target(w, h, { filter = gl.LINEAR } = {}) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fb, w, h };
  }

  function free(t) {
    if (!t) return;
    gl.deleteTexture(t.tex);
    gl.deleteFramebuffer(t.fb);
  }

  function draw(prog, out, setup, w, h) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.fb : null);
    gl.viewport(0, 0, out ? out.w : w, out ? out.h : h);
    gl.useProgram(prog.p);
    gl.bindVertexArray(vao);
    setup(prog.u);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function bind(unit, tex, loc) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc, unit);
  }

  function destroy() {
    programs.forEach((x) => gl.deleteProgram(x.p));
    gl.deleteBuffer(vbo);
    gl.deleteVertexArray(vao);
  }

  return { gl, program, target, free, draw, bind, destroy };
}

/**
 * Upload an image, canvas, video or ImageBitmap as a texture. Row 0 of the source stays at v = 0,
 * so shaders that work in top-left pixel space can sample it without flipping.
 */
export function uploadTexture(gl, source, tex = gl.createTexture(), { wrap = gl.CLAMP_TO_EDGE } = {}) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  const w = source.videoWidth || source.naturalWidth || source.width;
  const h = source.videoHeight || source.naturalHeight || source.height;
  return { tex, w, h };
}

/** Match the canvas backing store to its CSS size. Returns { width, height, dpr, changed }. */
export function fitCanvas(canvas, maxDpr = 2) {
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr, 2048 / Math.max(1, canvas.clientWidth, canvas.clientHeight));
  const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
  const changed = canvas.width !== width || canvas.height !== height;
  if (changed) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height, dpr, changed };
}
