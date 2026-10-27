import {defaultsFrom, normalize} from './validation.js';
const n = (label, group, value, min, max, step = 1, integer = false) => ({label,group,default:value,min,max,step,integer});
export const SCHEMA = Object.freeze({
  blur:n('Blur radius','Motion',100,0,240),speed:n('Speed','Motion',1,0,3,.05),warp:n('Mesh distortion','Motion',100,0,180),
  saturation:n('Output saturation','Color',1.6,0,3,.05),sourceSaturation:n('Source saturation','Color',1.15,0,2.5,.05),
  scrim:n('Tone overlay','Color',18,0,65),hue:n('Hue rotation','Color',0,-180,180),
  tint:{label:'Tint color',group:'Color',type:'color',default:'#0920d8'},tintAmount:n('Tint strength','Color',0,0,75),
  floor:n('Black floor','Color',.03,0,.45,.01),ceiling:n('White ceiling','Color',.95,.55,1,.01),
  mode:{label:'Tone mode',group:'Color',type:'select',default:'dark',options:['dark','light','original']},
  quality:n('Offscreen resolution','Quality',384,128,1024,32,true),
});
export const DEFAULTS = defaultsFrom(SCHEMA);
export const normalizeParameters = (partial = {}, base = DEFAULTS) => normalize(SCHEMA,partial,base);
