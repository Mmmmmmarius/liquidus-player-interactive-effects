import {defaultsFrom, normalize} from './validation.js';
const n = (label, group, value, min, max, step = .01, integer = false) => ({label, group, default:value, min, max, step, integer});
export const SCHEMA = Object.freeze({
  radius: n('Brush radius', 'Flow', .025, .003, .12, .001),
  force: n('Pointer force', 'Flow', 1400, 0, 3000, 50),
  forceRadius: n('Force spread', 'Flow', .035, .005, .12, .001),
  dyeAmount: n('Ink density', 'Flow', 1.8, .1, 4, .1),
  curl: n('Swirl', 'Flow', 10, 0, 35, 1),
  dyeDecay: n('Trail fade', 'Flow', .45, .05, 3, .05),
  velocityDecay: n('Velocity fade', 'Flow', .6, .1, 3, .05),
  sharpness: n('Advection sharpness', 'Flow', .6, 0, 1),
  threshold: n('Reveal threshold', 'Surface', .12, .01, 1),
  softness: n('Edge softness', 'Surface', 1.5, .5, 8, .1),
  edgeOpacity: n('Rim opacity', 'Surface', .65, 0, 1),
  edgeWidth: n('Rim width', 'Surface', 1.5, .5, 8, .1),
  edgeColor: {label:'Rim color',group:'Surface',type:'color',default:'#0920d8'},
  wipe: n('Full reveal', 'Surface', 0, 0, 1),
  maxSimSize: n('Velocity resolution', 'Quality', 192, 64, 256, 16, true),
  maxDyeSize: n('Dye resolution', 'Quality', 640, 128, 1024, 32, true),
  pressureIterations: n('Pressure iterations', 'Quality', 16, 4, 24, 1, true),
});
export const DEFAULTS = defaultsFrom(SCHEMA);
export const normalizeParameters = (partial = {}, base = DEFAULTS) => normalize(SCHEMA, partial, base);
