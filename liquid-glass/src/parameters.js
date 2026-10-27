import {defaultsFrom, normalize} from './validation.js';
const n = (label, group, value, min, max, step = .01) => ({label,group,default:value,min,max,step});
const b = (label) => ({label,group:'Passes',type:'boolean',default:true});
export const SCHEMA = Object.freeze({
  height:n('Bevel width','Optics',24,1,80,1), curvature:n('Bevel curve','Optics',1.25,.1,4,.05),
  refract:n('Refraction','Optics',1,0,3), aberration:n('Color dispersion','Optics',.12,0,.6),
  saturation:n('Saturation','Optics',1.35,0,3), brightness:n('Brightness','Optics',.04,-.3,.3),
  tint:{label:'Tint RGBA','group':'Optics',type:'vector',default:[1,1,1,0],min:0,max:1,step:.01},
  blurRadius:n('Blur radius','Optics',3,0,24,.5), frost:n('Frost','Optics',.35,0,1),
  keyAngle:n('Light direction','Light',120,0,360,1), keyAmount:n('Key light','Light',.6,0,2),
  fillAmount:n('Fill light','Light',.35,0,2), fillRatio:n('Fill ratio','Light',.45,0,1),
  rimWidth:n('Rim width','Light',2.5,.1,12,.1), rimSharpness:n('Rim sharpness','Light',2,.1,8,.1),
  shadowOpacity:n('Shadow opacity','Light',.22,0,.8), shadowRadius:n('Shadow softness','Light',22,1,80,1),
  shadowOffsetY:n('Shadow offset','Light',8,-40,40,1),
  smoothness:n('Merge distance','Motion',28,0,120,1), pan:n('Background drift','Motion',12,0,50,1),
  refraction:b('Refraction pass'),blur:b('Blur pass'),highlight:b('Rim light pass'),merge:b('Merge shapes'),shadow:b('Shadow pass'),
});
export const DEFAULTS = defaultsFrom(SCHEMA);
export const normalizeParameters = (partial = {}, base = DEFAULTS) => normalize(SCHEMA,partial,base);

export function normalizeShapes(list) {
  if (!Array.isArray(list) || list.length > 8) throw new TypeError('Provide up to eight shapes.');
  return list.map(s => {
    if (!s || !['x','y','w','h'].every(k => typeof s[k] === 'number' && Number.isFinite(s[k]))) throw new TypeError('Shapes require finite x, y, w and h.');
    if (s.w <= 0 || s.h <= 0 || s.w > 8192 || s.h > 8192 || Math.abs(s.x) > 16384 || Math.abs(s.y) > 16384) throw new RangeError('Shape is outside the supported bounds.');
    const r = s.r ?? Math.min(s.w,s.h)/2;
    if (!Number.isFinite(r) || r < 0) throw new TypeError('Corner radius must be a nonnegative number.');
    return {x:s.x,y:s.y,w:s.w,h:s.h,r:Math.min(r,s.w/2,s.h/2)};
  });
}
