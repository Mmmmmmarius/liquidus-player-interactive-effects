import {createLiquidGlass, SCHEMA, DEFAULTS, normalizeParameters} from '../src/index.js';
import {mountPlayground} from './playground.js';

mountPlayground({
  id:'liquid-glass',schema:SCHEMA,defaults:DEFAULTS,normalize:normalizeParameters,
  presets:{'Clear lens':{},'Frosted':{blurRadius:15,frost:.9,refract:.7,aberration:.05,brightness:.08},'Prismatic':{aberration:.5,height:38,refract:1.8,blurRadius:1,keyAmount:.9},'Soft merge':{smoothness:85,height:30,shadowOpacity:.12,refract:1.3}},
  uploads:['Background image'],
  create(canvas,request){
    const fx=createLiquidGlass(canvas), toggle=document.getElementById('auto-motion');
    const initial=()=>[{x:.35,y:.46,w:.31,h:.38,r:.5},{x:.64,y:.5,w:.28,h:.31,r:.5},{x:.5,y:.72,w:.38,h:.11,r:.3}];
    let shapes=initial(),drawn=initial(),selected=0,auto=true,drag=null,notify=()=>{};
    const freeze=()=>{if(auto){shapes=drawn.map(s=>({...s}));auto=false;toggle.checked=false;}notify();};
    toggle.addEventListener('change',()=>{auto=toggle.checked;request();});
    const coordinates=e=>{const b=canvas.getBoundingClientRect();return{x:(e.clientX-b.left)/b.width,y:(e.clientY-b.top)/b.height};};
    const down=e=>{
      if(e.button!==0)return;const p=coordinates(e);
      const index=drawn.findLastIndex(s=>Math.abs(p.x-s.x)<s.w/2&&Math.abs(p.y-s.y)<s.h/2);
      if(index<0)return;freeze();selected=index;const s=shapes[index];drag={id:e.pointerId,x:p.x-s.x,y:p.y-s.y};canvas.setPointerCapture(e.pointerId);canvas.dataset.dragging='true';canvas.focus();notify();
    };
    const move=e=>{if(!drag||e.pointerId!==drag.id)return;const p=coordinates(e);Object.assign(shapes[selected],{x:Math.min(.95,Math.max(.05,p.x-drag.x)),y:Math.min(.95,Math.max(.05,p.y-drag.y))});notify();request();};
    const up=e=>{if(!drag||e.pointerId!==drag.id)return;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);drag=null;canvas.dataset.dragging='false';};
    const key=e=>{const keys={ArrowLeft:[-.015,0],ArrowRight:[.015,0],ArrowUp:[0,-.015],ArrowDown:[0,.015]};if(!keys[e.key])return;e.preventDefault();freeze();const d=keys[e.key],s=shapes[selected],m=e.shiftKey?4:1;s.x=Math.max(.05,Math.min(.95,s.x+d[0]*m));s.y=Math.max(.05,Math.min(.95,s.y+d[1]*m));notify();request();};
    canvas.dataset.draggable='true';canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('keydown',key);
    return {
      getParameters:()=>fx.params,setParameters:p=>fx.setParams(p),
      setSample:(i,make)=>fx.setBackground(make(i)),setImage:image=>fx.setBackground(image),
      render(dt,t){
        drawn=shapes.map((s,i)=>({...s,x:s.x+(auto?.045*Math.sin(t*.6+i*2):0),y:s.y+(auto?.035*Math.cos(t*.7+i*2):0)}));
        const w=canvas.clientWidth,h=canvas.clientHeight;
        fx.setShapes(drawn.map(s=>({x:s.x*w,y:s.y*h,w:s.w*w,h:s.h*h,r:s.r*Math.min(s.w*w,s.h*h)})));fx.render(t*1000);
      },
      reset(){shapes=initial();drawn=initial();auto=true;toggle.checked=true;selected=0;notify();},
      select(value){selected=value;notify();request();},get selection(){return selected;},
      get shape(){return {...shapes[selected]};},updateShape(key,value){freeze();shapes[selected][key]=value;notify();request();},onShapeChange(fn){notify=fn;},
      diagnostics:()=>({canvasSize:[canvas.width,canvas.height],shapes:drawn.map(s=>({...s})),glError:fx.gl.getError()}),
      destroy(){canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('keydown',key);fx.destroy();}
    };
  },
  sceneControls(root,effect){
    const details=document.createElement('details');details.className='section';const summary=document.createElement('summary');summary.textContent='Shape placement';details.append(summary);
    const label=document.createElement('label');label.textContent='Selected shape';label.htmlFor='selected-shape';
    const select=document.createElement('select');select.id='selected-shape';select.className='full-select';
    for(let i=0;i<3;i++){const o=document.createElement('option');o.value=i;o.textContent=`Shape ${i+1}`;select.append(o);}select.addEventListener('change',()=>effect.select(Number(select.value)));details.append(label,select);
    const fields=[];
    for(const [key,name,min,max] of [['x','Horizontal position',.05,.95],['y','Vertical position',.05,.95],['w','Width',.1,.65],['h','Height',.08,.7],['r','Corner radius',0,.5]]){
      const row=document.createElement('div');row.className='field';const l=document.createElement('label');l.textContent=name;l.htmlFor='shape-'+key;
      const input=document.createElement('input');input.type='range';input.id=l.htmlFor;input.min=min;input.max=max;input.step=.005;input.style.width='100%';input.addEventListener('input',()=>effect.updateShape(key,input.valueAsNumber));row.append(l,input);details.append(row);fields.push([key,input]);
    }
    const hint=document.createElement('p');hint.className='small';hint.textContent='Drag a shape, or focus the canvas and use arrow keys. Shift moves faster. Editing placement stops auto motion. Positions are demo state and are not in parameter exports.';details.append(hint);root.append(details);
    const sync=()=>{select.value=effect.selection;const s=effect.shape;fields.forEach(([k,input])=>input.value=s[k]);};effect.onShapeChange(sync);sync();
  }
});
