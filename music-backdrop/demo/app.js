import {BackdropRenderer, SCHEMA, DEFAULTS, normalizeParameters} from '../src/index.js';
import {mountPlayground} from './playground.js';

mountPlayground({
  id:'music-backdrop',schema:SCHEMA,defaults:DEFAULTS,normalize:normalizeParameters,
  presets:{'Ambient':{},'Vivid':{blur:65,warp:125,saturation:2.5,scrim:8,floor:.02},'Soft daylight':{blur:170,speed:.5,saturation:1.2,mode:'light',scrim:35},'Slow monochrome':{speed:.3,saturation:0,sourceSaturation:.2,blur:130,scrim:15}},
  uploads:['Source artwork'],
  create(canvas,request,report,isPaused){
    const fx=new BackdropRenderer(canvas,message=>report(message,Boolean(message)),{maxFps:60,preserveDrawingBuffer:true});
    return {
      getParameters:()=>({...fx.params}),setParameters:p=>fx.setParameters(p),setPaused:value=>fx.setPaused(value),
      setSample(i,make){fx.setImage(make(i),{animate:!isPaused()});},setImage(image){fx.setImage(image,{animate:!isPaused()});},
      reset:()=>fx.resetTime(),diagnostics:()=>fx.diagnostics(),destroy:()=>fx.destroy()
    };
  }
});
