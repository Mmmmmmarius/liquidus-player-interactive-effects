import {artwork, readLocalImage} from './assets.js';
import {parsePreset, serializePreset} from '../src/validation.js';

/** The demo UI is separate from the reusable renderer. */
export function mountPlayground(config) {
  const $ = id => document.getElementById(id), canvas=$('canvas');
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let paused=media.matches, effect, dirty=true, frame=0, last=0, time=0, destroyed=false, failed=false, importTicket=0;
  const fields=new Map(), uploads=new Map();
  const report=(message='',error=false)=>{ $('status').textContent=message; $('status').dataset.error=String(error); };
  const fail=error=>{ failed=true; $('error').hidden=false; $('error-message').textContent=error.message || String(error); paused=true; effect?.setPaused?.(true); updatePause(); cancelAnimationFrame(frame); frame=0; };
  $('reload').addEventListener('click',()=>location.reload());
  function request(){dirty=true;if(!destroyed&&!failed&&!frame&&!document.hidden)frame=requestAnimationFrame(tick);}
  function tick(now) {
    frame=0;if(destroyed||failed||document.hidden)return;
    if(last&&!dirty&&now-last<14){frame=requestAnimationFrame(tick);return;}
    const dt=last?Math.min((now-last)/1000,.05):0; last=now;
    if(!paused)time+=dt;
    try { if(dirty||!paused){ effect.render?.(paused?0:dt,time,paused); dirty=false; } }
    catch(error){fail(error);return;}
    if(!paused&&effect.render)frame=requestAnimationFrame(tick);else last=0;
  }
  function updatePause(){ $('pause').textContent=paused?'Resume motion':'Pause motion';$('pause').setAttribute('aria-pressed',String(paused));$('motion-state').textContent=paused?'Motion paused':'Motion running'; }
  function sync(){
    const p=effect.getParameters();
    for(const [key,inputs] of fields){
      inputs.forEach((input,i)=>{ if(input.type==='checkbox')input.checked=p[key];else input.value=Array.isArray(p[key])?p[key][i]:p[key]; });
    }
  }
  function apply(partial){try{ effect.setParameters(partial);sync();request();report('Parameters updated.'); }catch(error){sync();report(error.message,true);} }
  try {
    effect=config.create(canvas,request,report,()=>paused);
    effect.setParameters(config.defaults);
    effect.setSample(0,artwork);
    effect.setPaused?.(paused);
  } catch(error) {fail(error);$('inspector').inert=true;return;}

  const groups=new Map();
  for(const [key,rule] of Object.entries(config.schema)){
    if(!groups.has(rule.group)){
      const details=document.createElement('details');details.className='section';details.open=groups.size<2;
      const summary=document.createElement('summary');summary.textContent=rule.group;details.append(summary);$('parameters').append(details);groups.set(rule.group,details);
    }
    const field=document.createElement('div');field.className='field';const id=`param-${key}`;
    const label=document.createElement('label');label.htmlFor=id;label.textContent=rule.label;
    const inputs=[];
    const input=(type, suffix='')=>{const v=document.createElement('input');v.type=type;v.id=id+suffix;inputs.push(v);return v;};
    if(rule.type==='boolean'){
      label.className='toggle';const c=input('checkbox');label.prepend(c);c.addEventListener('change',()=>apply({[key]:c.checked}));field.append(label);
    }else if(rule.type==='select'){
      field.append(label);const select=document.createElement('select');select.id=id;inputs.push(select);
      rule.options.forEach(value=>{const option=document.createElement('option');option.value=value;option.textContent=value;select.append(option);});select.addEventListener('change',()=>apply({[key]:select.value}));field.append(select);
    }else if(rule.type==='color'){
      field.append(label);const color=input('color');color.addEventListener('input',()=>apply({[key]:color.value}));field.append(color);
    }else if(rule.type==='vector'){
      field.append(label);label.removeAttribute('for');const row=document.createElement('div');row.className='vectors';
      for(let i=0;i<rule.default.length;i++){const number=input('number',`-${i}`);number.min=rule.min;number.max=rule.max;number.step=rule.step;number.setAttribute('aria-label',rule.label+' '+['red','green','blue','strength'][i]);
        const sub=document.createElement('label');sub.textContent=['R','G','B','Mix'][i];sub.append(number);row.append(sub);
        number.addEventListener('change',()=>apply({[key]:inputs.map(v=>v.valueAsNumber)}));}
      field.append(row);
    }else{
      field.append(label);const row=document.createElement('div');row.className='numeric';const range=input('range'),number=input('number','-value');
      for(const v of [range,number]){v.min=rule.min;v.max=rule.max;v.step=rule.step;}
      number.setAttribute('aria-label',rule.label+' value');range.addEventListener('input',()=>apply({[key]:range.valueAsNumber}));number.addEventListener('change',()=>apply({[key]:number.valueAsNumber}));row.append(range,number);field.append(row);
    }
    fields.set(key,inputs);groups.get(rule.group).append(field);
  }
  const presets=$('preset');
  for(const name of Object.keys(config.presets)){const option=document.createElement('option');option.textContent=name;option.value=name;presets.append(option);}
  presets.addEventListener('change',()=>{apply({...config.defaults,...config.presets[presets.value]});report(`Loaded ${presets.value}.`);});
  $('pause').addEventListener('click',()=>{paused=!paused;effect.setPaused?.(paused);last=0;updatePause();request();report(paused?'Motion paused. Parameters remain editable.':'Motion resumed.');});
  $('reset').addEventListener('click',()=>{
    importTicket++;uploads.forEach((value,key)=>uploads.set(key,value+1));
    effect.setParameters(config.defaults);effect.reset?.();time=0;last=0;
    effect.setSample(0,artwork);document.querySelectorAll('[type=file]').forEach(i=>i.value='');
    document.querySelectorAll('[data-sample]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.sample==='0')));
    presets.selectedIndex=0;sync();request();report('Default parameters and sample restored.');
  });
  document.querySelectorAll('[data-sample]').forEach(button=>button.addEventListener('click',()=>{
    uploads.forEach((value,key)=>uploads.set(key,value+1));effect.setSample(Number(button.dataset.sample),artwork);
    document.querySelectorAll('[data-sample]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));request();report('Procedural sample loaded.');
  }));
  for(const [index,title] of config.uploads.entries()){
    uploads.set(index,0);const field=document.createElement('div');field.className='file-control';const label=document.createElement('label');label.textContent=title;label.htmlFor=`image-${index}`;
    const file=document.createElement('input');file.id=label.htmlFor;file.type='file';file.accept='image/png,image/jpeg,image/webp';field.append(label,file);$('uploads').append(field);
    file.addEventListener('change',async()=>{
      const selected=file.files[0];if(!selected)return;const ticket=uploads.get(index)+1;uploads.set(index,ticket);
      try{const image=await readLocalImage(selected);if(destroyed||uploads.get(index)!==ticket)return;effect.setImage(image,index);request();report('Local image loaded. Nothing was uploaded.');}
      catch(error){if(uploads.get(index)===ticket)report(error.message,true);}finally{file.value='';}
    });
  }
  const json=$('json');
  $('show-json').addEventListener('click',()=>{json.value=serializePreset(config.id,effect.getParameters());report('Current parameters copied into the editor.');});
  $('apply-json').addEventListener('click',()=>{
    try{const values=parsePreset(json.value,config.id,config.normalize);effect.setParameters(values);sync();request();report('JSON parameters applied.');}catch(error){report(error.message,true);}
  });
  $('export').addEventListener('click',()=>{
    const text=serializePreset(config.id,effect.getParameters());json.value=text;
    const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`${config.id}-preset.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);report('Parameter file exported.');
  });
  $('import').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;const ticket=++importTicket;
    try{if(file.size>32768)throw new Error('Preset must be under 32 KB.');const text=await file.text();const values=parsePreset(text,config.id,config.normalize);
      if(destroyed||ticket!==importTicket)return;effect.setParameters(values);json.value=text;sync();request();report('Parameter file imported.');}
    catch(error){if(ticket===importTicket)report(error.message,true);}finally{event.target.value='';}
  });
  const visibility=()=>{last=0;if(document.hidden){cancelAnimationFrame(frame);frame=0;}else request();};document.addEventListener('visibilitychange',visibility);
  const reduced=()=>{if(media.matches){paused=true;effect.setPaused?.(true);updatePause();request();report('Motion paused to match your system preference.');}};media.addEventListener('change',reduced);
  const observer=new ResizeObserver(()=>request());observer.observe(canvas);
  const lost=event=>{event.preventDefault();fail(new Error('Graphics context lost. Reload the demo to rebuild its resources.'));};canvas.addEventListener('webglcontextlost',lost);
  function destroy(){if(destroyed)return;destroyed=true;cancelAnimationFrame(frame);observer.disconnect();document.removeEventListener('visibilitychange',visibility);media.removeEventListener('change',reduced);canvas.removeEventListener('webglcontextlost',lost);effect.destroy();}
  addEventListener('pagehide',event=>{if(!event.persisted)destroy();});
  // Diagnostics expose only parameters and renderer state, never selected files or filenames.
  window.playground={get parameters(){return effect.getParameters();},get paused(){return paused;},diagnostics:()=>effect.diagnostics?.(),destroy};
  config.sceneControls?.($('scene-controls'),effect,request);
  updatePause();sync();request();report(media.matches?'Motion starts paused because reduced motion is enabled.':'Ready. Adjust a parameter to explore.');
}
