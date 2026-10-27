import * as API from '../src/index.js';
import {artwork} from '../demo/assets.js';
const effectId=document.querySelector('meta[name=effect]').content;
const results=[],output=document.getElementById('results');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const check=(name,condition,details='')=>{results.push({name,pass:Boolean(condition),details});output.textContent=JSON.stringify({effect:effectId,complete:false,results},null,2);if(!condition)throw new Error(name+' '+details);};
const sample=canvas=>{const gl=canvas.getContext('webgl2');const pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let hash=2166136261,min=255,max=0;for(let i=0;i<pixels.length;i+=16){hash=Math.imul(hash^pixels[i],16777619)>>>0;min=Math.min(min,pixels[i]);max=Math.max(max,pixels[i]);}return{hash,min,max,glError:gl.getError()};};
let fx;
try{
  const canvas=document.getElementById('probe');canvas.style.width='360px';canvas.style.height='240px';
  if(effectId==='fluid-reveal'){
    fx=API.createFluidReveal(canvas);fx.setImages(artwork(0),artwork(1));fx.render();const a=sample(canvas);
    fx.setParameters({wipe:1});fx.render();const b=sample(canvas);
    check('Two layers produce distinct nonblank frames',a.hash!==b.hash&&a.max-a.min>30&&b.max-b.min>30);
    fx.setParameters({wipe:0});fx.clear();for(let i=1;i<35;i++)fx.render(1/60,{uv:{x:.2+i*.012,y:.5},delta:{x:.012,y:0}});const c=sample(canvas);
    check('Fluid trail changes the reveal mask',c.hash!==a.hash);
    check('No WebGL error after fluid simulation',a.glError===0&&b.glError===0&&c.glError===0);
  }else if(effectId==='liquid-glass'){
    fx=API.createLiquidGlass(canvas);fx.setBackground(artwork(0));fx.setShapes([{x:180,y:120,w:180,h:150,r:65}]);fx.render(0);const a=sample(canvas);
    fx.setShapes([]);fx.render(0);const b=sample(canvas);
    check('Glass optics change nonblank background pixels',a.hash!==b.hash&&a.max-a.min>30);
    let rejected=false;try{fx.setShapes([{x:NaN,y:0,w:2,h:3}]);}catch{rejected=true;}check('Invalid geometry is rejected',rejected);
    check('No WebGL error after glass render',a.glError===0&&b.glError===0);
  }else{
    fx=new API.BackdropRenderer(canvas,()=>{},{maxFps:60});fx.setPaused(true);fx.setImage(artwork(0),{animate:false});await delay(60);fx.render();const a=sample(canvas);
    fx.setParameters({hue:120,blur:0});fx.render();const b=sample(canvas);check('Color and blur controls change nonblank pixels',a.hash!==b.hash&&a.max-a.min>15);
    const t=fx.diagnostics().time;await delay(150);check('Pause freezes the animation clock',fx.diagnostics().time===t);
    fx.setPaused(false);await delay(180);check('Resume advances the animation clock',fx.diagnostics().time>t);fx.setPaused(true);
    const blob=await fx.snapshot();check('PNG snapshot is available',blob.type==='image/png'&&blob.size>100);
    check('No WebGL error after background render',a.glError===0&&b.glError===0);
  }
  fx.destroy();fx.destroy();check('Destroy is idempotent',true);fx=null;
  const frame=document.getElementById('demo');frame.src='../demo/';
  const until=Date.now()+25000;while(!frame.contentWindow?.playground&&Date.now()<until)await delay(100);
  const win=frame.contentWindow,doc=frame.contentDocument,pg=win.playground;
  check('Independent demo initializes',Boolean(pg));
  check('Reduced motion preference is respected',pg.paused===win.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const paused=pg.paused;doc.getElementById('pause').click();check('Pause button toggles renderer state',pg.paused!==paused);
  if(!pg.paused)doc.getElementById('pause').click();
  const name=Object.keys(API.SCHEMA).find(k=>!API.SCHEMA[k].type),rule=API.SCHEMA[name],value=rule.default===rule.max?rule.min:rule.max;
  const field=doc.getElementById('param-'+name+'-value');field.value=value;field.dispatchEvent(new win.Event('change',{bubbles:true}));check('Number control updates parameters',pg.parameters[name]===value);
  const chooser=doc.getElementById('preset');for(const option of chooser.options){chooser.value=option.value;chooser.dispatchEvent(new win.Event('change',{bubbles:true}));await delay(70);}check('All presets render without WebGL errors',pg.diagnostics().glError===0&&doc.getElementById('error').hidden);
  doc.getElementById('show-json').click();const exported=JSON.parse(doc.getElementById('json').value);check('JSON export contains only version, effect and parameters',Object.keys(exported).sort().join(',')==='effect,format,parameters'&&exported.effect===effectId);
  const before=JSON.stringify(pg.parameters);doc.getElementById('json').value='{"format":1,"effect":"'+effectId+'","parameters":{"bad":true}}';doc.getElementById('apply-json').click();check('Invalid JSON leaves renderer state intact',JSON.stringify(pg.parameters)===before&&doc.getElementById('status').dataset.error==='true');
  exported.parameters[name]=value;doc.getElementById('json').value=JSON.stringify(exported);doc.getElementById('apply-json').click();check('JSON import applies a valid preset',pg.parameters[name]===value&&doc.getElementById('status').dataset.error==='false');
  const dt=new win.DataTransfer();dt.items.add(new win.File([JSON.stringify(exported)],'fixture-preset.json',{type:'application/json'}));const file=doc.getElementById('import');file.files=dt.files;file.dispatchEvent(new win.Event('change',{bubbles:true}));await delay(90);check('File preset import works',doc.getElementById('status').textContent.includes('imported'));
  const png=await new Promise(r=>artwork(2).toBlob(r,'image/png'));const images=new win.DataTransfer();images.items.add(new win.File([png],'fixture-image.png',{type:'image/png'}));const image=doc.getElementById('image-0');image.files=images.files;image.dispatchEvent(new win.Event('change',{bubbles:true}));
  const imageDeadline=Date.now()+3000;while(!doc.getElementById('status').textContent.includes('Local image loaded')&&Date.now()<imageDeadline)await delay(50);
  check('Local image decoding works',doc.getElementById('status').textContent.includes('Local image loaded'));
  doc.getElementById('reset').click();check('Restore defaults restores all parameters',JSON.stringify(pg.parameters)===JSON.stringify(API.DEFAULTS));
  frame.style.width='390px';frame.style.height='760px';await delay(160);check('Narrow layout has no horizontal overflow',doc.documentElement.scrollWidth<=doc.documentElement.clientWidth+1);
  const range=doc.getElementById('param-'+name);range.focus();check('Controls are keyboard focusable',doc.activeElement===range);
  const resources=win.performance.getEntriesByType('resource').map(e=>e.name);check('Demo resources are all local',resources.every(url=>url.startsWith(location.origin)||url.startsWith('data:')||url.startsWith('blob:')));
  check('No render error after interactions',pg.diagnostics().glError===0&&doc.getElementById('error').hidden);
  win.scrollTo(0,0);
  // Leave the iframe in its narrow layout so it can be inspected visually.
}catch(error){results.push({name:'Unexpected failure',pass:false,details:error.stack||error.message});fx?.destroy();}
output.textContent=JSON.stringify({effect:effectId,complete:true,passed:results.every(r=>r.pass),results},null,2);
document.title=(results.every(r=>r.pass)?'PASS':'FAIL')+' · '+effectId;
