import {createFluidReveal, SCHEMA, DEFAULTS, normalizeParameters} from '../src/index.js';
import {mountPlayground} from './playground.js';

mountPlayground({
  id:'fluid-reveal',schema:SCHEMA,defaults:DEFAULTS,normalize:normalizeParameters,
  presets:{'Balanced':{},'Slow ink':{radius:.045,curl:5,dyeDecay:.15,force:900,edgeOpacity:.2},'Fine turbulence':{radius:.012,curl:28,dyeDecay:.8,force:2100,edgeWidth:1,threshold:.08},'Soft reveal':{radius:.065,softness:5,edgeOpacity:0,dyeDecay:.3}},
  uploads:['Base image','Revealed image'],
  create(canvas,request,report,isPaused){
    const fx=createFluidReveal(canvas);let images=[],pointer={x:.5,y:.5},previous={...pointer},hover=false,auto=true;
    const toggle=document.getElementById('auto-motion');
    toggle.addEventListener('change',()=>{auto=toggle.checked;previous={...pointer};request();});
    const position=e=>{const b=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-b.left)/b.width)),y:Math.max(0,Math.min(1,1-(e.clientY-b.top)/b.height))};};
    const enter=e=>{pointer=position(e);previous={...pointer};hover=true;};
    const move=e=>{pointer=position(e);hover=true;request();};
    const leave=()=>{hover=false;};
    canvas.addEventListener('pointerenter',enter);canvas.addEventListener('pointerdown',enter);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerleave',leave);
    return {
      getParameters:()=>fx.parameters,setParameters:p=>fx.setParameters(p),
      setSample(i,make){images=[make(i),make((i+1)%3)];fx.setImages(...images);fx.clear();},
      setImage(image,index){images[index]=image;fx.setImages(...images);fx.clear();},
      render(dt,t,paused){
        if(!hover&&auto&&!paused)pointer={x:.5+.27*Math.sin(t*.65),y:.5+.24*Math.sin(t*.94+.3)};
        const delta=paused?{x:0,y:0}:{x:pointer.x-previous.x,y:pointer.y-previous.y};
        fx.render(dt,{uv:pointer,delta});previous={...pointer};
      },
      reset(){fx.clear();auto=true;toggle.checked=true;previous={...pointer};},
      diagnostics:()=>fx.diagnostics(),
      destroy(){canvas.removeEventListener('pointerenter',enter);canvas.removeEventListener('pointerdown',enter);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerleave',leave);fx.destroy();images=[];}
    };
  }
});
