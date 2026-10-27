// Rounded-rectangle shapes as one signed distance field, merged with a polynomial smooth min.
// GLSL works in top-left device pixels: p = vec2(gl_FragCoord.x, height - gl_FragCoord.y).
// Negative distance is inside, positive outside, zero on the edge.

export const MAX_SHAPES = 8;

export const SDF_GLSL = `
#define SDF_MAX_SHAPES ${MAX_SHAPES}
uniform int uShapeCount;
uniform vec4 uShape[SDF_MAX_SHAPES];        // centre xy, half size xy
uniform float uShapeRadius[SDF_MAX_SHAPES]; // corner radius
uniform float uSmooth;                      // smooth-min radius; 0 = hard union

float sdRoundBox(vec2 p, vec2 b, float r) {
  r = min(r, min(b.x, b.y));
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// polynomial smooth min: within k of each other the two fields blend into a rounded neck
float smin(float a, float b, float k) {
  if (k <= 0.0) return min(a, b);
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float shapesSDF(vec2 p) {
  float d = 1e5;
  for (int i = 0; i < SDF_MAX_SHAPES; i++) {
    if (i >= uShapeCount) break;
    float di = sdRoundBox(p - uShape[i].xy, uShape[i].zw, uShapeRadius[i]);
    d = (i == 0) ? di : smin(d, di, uSmooth);
  }
  return d;
}

// outward unit normal from central differences; zero far inside where the field is flat
vec2 shapesNormal(vec2 p) {
  const float e = 1.0;
  vec2 n = vec2(shapesSDF(p + vec2(e, 0.0)) - shapesSDF(p - vec2(e, 0.0)),
                shapesSDF(p + vec2(0.0, e)) - shapesSDF(p - vec2(0.0, e)));
  return length(n) > 1e-5 ? normalize(n) : vec2(0.0);
}
`;

/**
 * Upload shapes to a program that includes SDF_GLSL.
 * shapes: [{ x, y, w, h, r }] in CSS px (centre, full size, corner radius; r defaults to a pill).
 * smoothness is in CSS px.
 */
export function setShapeUniforms(gl, u, shapes, { dpr = 1, smoothness = 0 } = {}) {
  const list = shapes.slice(0, MAX_SHAPES);
  const data = new Float32Array(MAX_SHAPES * 4);
  const radii = new Float32Array(MAX_SHAPES);
  list.forEach((s, i) => {
    data.set([s.x * dpr, s.y * dpr, (s.w / 2) * dpr, (s.h / 2) * dpr], i * 4);
    radii[i] = (s.r ?? Math.min(s.w, s.h) / 2) * dpr;
  });
  gl.uniform1i(u.uShapeCount, list.length);
  gl.uniform4fv(u.uShape, data);
  gl.uniform1fv(u.uShapeRadius, radii);
  gl.uniform1f(u.uSmooth, smoothness * dpr);
}

/**
 * Let the user drag shapes with mouse, pen or touch. Hit test is the shape's bounding box, topmost first.
 * element: the element receiving pointer events (usually the canvas, CSS px coordinates relative to the page).
 * getShapes: () => the live shapes array; positions are written back into it.
 * Returns detach().
 */
export function dragShapes(element, getShapes, { onChange } = {}) {
  let drag = null;
  const local = (e) => {
    const r = element.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const down = (e) => {
    const [x, y] = local(e);
    const shapes = getShapes();
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      if (Math.abs(x - s.x) <= s.w / 2 && Math.abs(y - s.y) <= s.h / 2) {
        drag = { s, dx: x - s.x, dy: y - s.y };
        element.setPointerCapture(e.pointerId);
        element.dataset.dragging = 'true';
        e.preventDefault();
        return;
      }
    }
  };
  const move = (e) => {
    if (!drag) return;
    const [x, y] = local(e);
    drag.s.x = x - drag.dx;
    drag.s.y = y - drag.dy;
    onChange?.(drag.s);
  };
  const up = () => {
    drag = null;
    delete element.dataset.dragging;
  };
  element.addEventListener('pointerdown', down);
  element.addEventListener('pointermove', move);
  element.addEventListener('pointerup', up);
  element.addEventListener('pointercancel', up);
  return () => {
    element.removeEventListener('pointerdown', down);
    element.removeEventListener('pointermove', move);
    element.removeEventListener('pointerup', up);
    element.removeEventListener('pointercancel', up);
  };
}
