import * as THREE from 'three';
import {FluidTrail, supportsFluid} from './fluid-trail/fluid-trail.js';
import {createRevealComposite} from './reveal-composite/reveal-composite.js';
import {DEFAULTS, normalizeParameters} from './parameters.js';
export {DEFAULTS, SCHEMA, normalizeParameters} from './parameters.js';

/** A two-image fluid mask. Call render(deltaSeconds, pointer) from your own frame loop. */
export function createFluidReveal(canvas) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias:false, alpha:false, powerPreference:'low-power'});
  if (!supportsFluid(renderer)) { renderer.dispose(); throw new Error('Floating-point render targets are unavailable. Enable hardware acceleration.'); }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const fluid = new FluidTrail(renderer);
  const composite = createRevealComposite({palette:{bg:'#000000'}, revealShade:0});
  const u = composite.uniforms;
  let params = {...DEFAULTS}, sources = [], textures = [], width = 0, height = 0, destroyed = false;
  const guard = () => { if (destroyed) throw new Error('Fluid reveal has been destroyed.'); };
  const copy = source => {
    const w = source.naturalWidth || source.width, h = source.naturalHeight || source.height;
    if (!w || !h) throw new TypeError('Decode the image before setImages().');
    const surface = document.createElement('canvas');
    surface.width = width; surface.height = height;
    const ctx = surface.getContext('2d');
    ctx.fillStyle = '#000000'; ctx.fillRect(0,0,width,height);
    const scale = Math.max(width / w, height / h);
    ctx.drawImage(source,(width - w * scale)/2,(height - h * scale)/2,w * scale,h * scale);
    const tex = new THREE.CanvasTexture(surface);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  function refreshImages(nextSources = sources) {
    if (!nextSources.length) return;
    const next = [];
    try { nextSources.forEach(source => next.push(copy(source))); }
    catch (error) { next.forEach(t=>t.dispose()); throw error; }
    textures.forEach(t => t.dispose()); textures = next;
    sources = nextSources;
    [u.tBase.value, u.tAlt.value] = textures;
  }
  function resize() {
    guard();
    const ratio = Math.min(devicePixelRatio || 1, 1.5, 2048 / Math.max(1,canvas.clientWidth,canvas.clientHeight));
    const w = Math.max(1,Math.round(canvas.clientWidth * ratio));
    const h = Math.max(1,Math.round(canvas.clientHeight * ratio));
    if (w !== width || h !== height) {
      width = w; height = h; renderer.setSize(w,h,false); u.uResolution.value.set(w,h); refreshImages();
    }
    fluid.resize(w,h);
    fluid.aspect = w / h;
    u.uMaskSize.value.set(fluid.dyeSize.w,fluid.dyeSize.h);
    u.uEdgeWidth.value = params.edgeWidth * ratio;
  }
  function setParameters(partial) {
    guard(); const next = normalizeParameters(partial,params);
    for (const key of ['radius','force','forceRadius','dyeAmount','curl','dyeDecay','velocityDecay','sharpness','maxSimSize','maxDyeSize','pressureIterations']) fluid.options[key] = next[key];
    params = next;
    u.uMaskThreshold.value = params.threshold; u.uMaskSoftness.value = params.softness;
    u.uEdgeOpacity.value = params.edgeOpacity; u.uEdgeColor.value.set(params.edgeColor); u.uWipe.value = params.wipe;
    resize();
  }
  function render(deltaSeconds = 0, pointer = {uv:{x:.5,y:.5},delta:{x:0,y:0}}) {
    guard();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new TypeError('deltaSeconds must be a nonnegative finite number.');
    if (![pointer?.uv?.x,pointer?.uv?.y,pointer?.delta?.x,pointer?.delta?.y].every(Number.isFinite)) throw new TypeError('Pointer requires finite uv and delta coordinates.');
    resize();
    fluid.step(Math.min(deltaSeconds,.05),pointer);
    u.tMask.value = fluid.texture;
    renderer.setRenderTarget(null); renderer.render(composite.scene,composite.camera);
  }
  setParameters({});
  return {
    setParameters, render, resize,
    setImages(base, alternate) { guard(); refreshImages([base,alternate]); },
    clear() { guard(); fluid.clear(); fluid.accumulator = 0; },
    get parameters() { return {...params}; },
    diagnostics() { return {canvasSize:[width,height],dyeSize:fluid.dyeSize,glError:renderer.getContext().getError()}; },
    destroy() { if (destroyed) return; destroyed = true; textures.forEach(t=>t.dispose()); sources=[]; fluid.dispose(); composite.dispose(); renderer.dispose(); }
  };
}
