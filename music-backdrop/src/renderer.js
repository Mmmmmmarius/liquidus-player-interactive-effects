import {prepareArtwork} from './artwork.js';
/* Independent browser approximation of an artwork-derived animated background.
 * Rotating layers, blur, mesh interpolation and tone controls; see SOURCES.md.
 * No native binaries, proprietary shaders, music or commercial artwork are bundled.
 */
import {DEFAULTS, normalizeParameters} from './parameters.js';
export {DEFAULTS, normalizeParameters} from './parameters.js';
  const FULLSCREEN_VERTEX = `#version 300 es
    in vec2 a_position;
    out vec2 v_uv;
    void main(){v_uv=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}`;
  const COMPOSITE_FRAGMENT = `#version 300 es
    precision highp float;
    in vec2 v_uv;
    out vec4 outColor;
    uniform sampler2D u_cover;
    uniform sampler2D u_previous;
    uniform float u_crossfade, u_time, u_aspect, u_saturation;
    mat2 rotation(float t){float c=cos(t),s=sin(t);return mat2(c,-s,s,c);}
    vec2 mirrorUV(vec2 p){return 1.-abs(mod(p,2.)-1.);}
    vec3 artwork(vec2 p){p=mirrorUV(p);return mix(texture(u_previous,p).rgb,texture(u_cover,p).rgb,u_crossfade);}
    void main(){
      vec2 p=v_uv;
      vec2 aspect=vec2(u_aspect,1.);
      vec2 a=rotation(6.2831853*u_time/48.+.25)*((p-vec2(.22,.30))*aspect)*.85+vec2(.27,.35);
      vec2 b=rotation(6.2831853*u_time/37.+2.1)*((p-vec2(.80,.38))*aspect)*.92+vec2(.72,.62);
      vec2 c=rotation(6.2831853*u_time/27.+4.2)*((p-vec2(.49,.85))*aspect)*1.05+vec2(.42,.75);
      vec3 weights=exp(-vec3(dot((p-vec2(.16,.23))*aspect,(p-vec2(.16,.23))*aspect),
        dot((p-vec2(.86,.37))*aspect,(p-vec2(.86,.37))*aspect),
        dot((p-vec2(.45,.94))*aspect,(p-vec2(.45,.94))*aspect))*3.7);
      weights/=max(dot(weights,vec3(1.)),.0001);
      vec3 color=artwork(a)*weights.x+artwork(b)*weights.y+artwork(c)*weights.z;
      float luminance=dot(color,vec3(.2126,.7152,.0722));
      outColor=vec4(luminance+(color-luminance)*u_saturation,1.);
    }`;
  const BLUR_FRAGMENT = `#version 300 es
    precision highp float;
    in vec2 v_uv;
    out vec4 outColor;
    uniform sampler2D u_image;
    uniform vec2 u_step;
    uniform float u_weights[49];
    void main(){
      vec3 color=texture(u_image,v_uv).rgb*u_weights[0];
      for(int i=1;i<=48;i++){
        vec2 d=float(i)*u_step;
        color+=(texture(u_image,v_uv+d).rgb+texture(u_image,v_uv-d).rgb)*u_weights[i];
      }
      outColor=vec4(color,1.);
    }`;
  const MESH_VERTEX = `#version 300 es
    precision highp float;
    in vec2 a_position;
    in vec2 a_from;
    in vec2 a_to;
    out vec2 v_uv;
    uniform float u_time,u_warp;
    void main(){
      float s=.5-.5*cos(6.2831853*u_time/5.2);
      vec2 p=mix(a_from,a_to,s);
      gl_Position=vec4(mix(a_position,p,u_warp),0.,1.);
      v_uv=a_position*.4+.5;
    }`;
  const FINAL_FRAGMENT = `#version 300 es
    precision highp float;
    in vec2 v_uv;
    out vec4 outColor;
    uniform sampler2D u_image;
    uniform float u_saturation,u_scrim,u_mode,u_floor,u_ceiling;
    uniform float u_hue,u_tintAmount;
    uniform vec3 u_tint;
    vec3 rotateHue(vec3 c,float angle){
      float y=dot(c,vec3(.299,.587,.114));
      float i=dot(c,vec3(.596,-.274,-.322));
      float q=dot(c,vec3(.211,-.523,.312));
      float cs=cos(angle),sn=sin(angle);
      float ni=i*cs-q*sn,nq=i*sn+q*cs;
      return vec3(y+.956*ni+.621*nq,y-.272*ni-.647*nq,y-1.106*ni+1.703*nq);
    }
    void main(){
      vec3 color=texture(u_image,v_uv).rgb;
      float l=dot(color,vec3(.2126,.7152,.0722));
      color=min(vec3(1.),l+(color-l)*u_saturation);
      if(abs(u_hue)>.0001)color=rotateHue(color,u_hue);
      color=mix(color,u_tint,u_tintAmount);
      if(u_mode<.5)color=mix(color,vec3(0.),u_scrim);
      else if(u_mode<1.5)color=mix(color,vec3(1.),u_scrim);
      outColor=vec4(clamp(color,vec3(u_floor),vec3(u_ceiling)),1.);
    }`;

  export class BackdropRenderer {
    constructor(canvas, onError = () => {}, {maxFps=0,preserveDrawingBuffer=true} = {}) {
      this.canvas=canvas;
      this.destroyed=false;this.resources=[];
      this.onError=onError;
      this.params={...DEFAULTS};
      this.time=0;
      this.paused=false;
      this.reducedMotion=false;
      this.ready=false;
      this.lost=false;
      this.lastFrame=0;
      this.frameInterval=Number.isFinite(maxFps)&&maxFps>0?1000/maxFps:0;
      // Tolerate early rAF callbacks on high-refresh displays.
      this.frameTolerance=Math.min(2,this.frameInterval/4);
      this.nextFrame=0;
      this.frameCount=0;
      this.transition=1;
      this.luminance=.5;
      this.raf=0;
      this.dirty=true;
      this.gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,
        stencil:false,preserveDrawingBuffer,powerPreference:'low-power'});
      if(!this.gl)throw new Error('WebGL 2 is unavailable. Use a browser with hardware acceleration enabled.');
      try{this.init();}catch(error){this.destroy();throw error;}
      this.resizeObserver=new ResizeObserver(()=>this.resize());
      this.resizeObserver.observe(canvas);
      this.onContextLost=event=>{
        event.preventDefault();this.lost=true;cancelAnimationFrame(this.raf);this.raf=0;
        this.onError('Graphics context lost. Waiting for recovery; reload if it does not recover.');
      };
      this.onContextRestored=()=>{
        try{
          this.resources=[];this.lost=false;this.ready=false;this.init();
          if(this.lastArtwork)this.setArtwork(this.lastArtwork,this.luminance,false);
          this.resize();this.onError('');this.requestFrame();
        }catch(error){this.onError(error.message);}
      };
      this.onVisibilityChange=()=>{
        this.lastFrame=0;
        if(document.hidden){cancelAnimationFrame(this.raf);this.raf=0;}
        else this.requestFrame();
      };
      canvas.addEventListener('webglcontextlost',this.onContextLost);
      canvas.addEventListener('webglcontextrestored',this.onContextRestored);
      document.addEventListener('visibilitychange',this.onVisibilityChange);
    }
    release(type,resource){this.gl['delete'+type](resource);this.resources=this.resources.filter(entry=>entry[1]!==resource);}
    own(type,resource){this.resources.push([type,resource]);return resource;}
    destroy(){
      if(this.destroyed)return;
      this.destroyed=true;this.ready=false;cancelAnimationFrame(this.raf);this.raf=0;
      this.resizeObserver?.disconnect();
      this.canvas.removeEventListener('webglcontextlost',this.onContextLost);
      this.canvas.removeEventListener('webglcontextrestored',this.onContextRestored);
      document.removeEventListener('visibilitychange',this.onVisibilityChange);
      for(const [type,resource] of this.resources)this.gl['delete'+type](resource);
      this.resources=[];this.lastArtwork=null;
    }
    assertAlive(){if(this.destroyed)throw new Error('BackdropRenderer has been destroyed.');}
    setImage(source,{animate=true}={}){
      this.assertAlive();const {canvas,luminance}=prepareArtwork(source);
      this.lastArtwork=canvas;this.luminance=luminance;
      this.setArtwork(canvas,luminance,animate);
    }
    setParameters(partial){this.update(partial);}
    compile(type,source){
      const gl=this.gl,shader=this.own('Shader',gl.createShader(type));
      gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){
        const message=gl.getShaderInfoLog(shader);this.release('Shader',shader);
        throw new Error('Background shader compilation failed: '+message);
      }
      return shader;
    }
    program(vertex,fragment){
      const gl=this.gl,vs=this.compile(gl.VERTEX_SHADER,vertex),fs=this.compile(gl.FRAGMENT_SHADER,fragment);
      const program=this.own('Program',gl.createProgram());gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
      this.release('Shader',vs);this.release('Shader',fs);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Background shader linking failed: '+gl.getProgramInfoLog(program));
      return {program,locations:new Map()};
    }
    uniform(program,name,type,...args){
      if(!program.locations.has(name))program.locations.set(name,this.gl.getUniformLocation(program.program,name));
      this.gl['uniform'+type](program.locations.get(name),...args);
    }
    init(){
      const gl=this.gl;
      this.composite=this.program(FULLSCREEN_VERTEX,COMPOSITE_FRAGMENT);
      this.blurProgram=this.program(FULLSCREEN_VERTEX,BLUR_FRAGMENT);
      this.finalProgram=this.program(MESH_VERTEX,FINAL_FRAGMENT);
      this.quad=this.own('Buffer',gl.createBuffer());gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      this.quadVAOs=new Map();
      for(const p of [this.composite,this.blurProgram]){
        const vao=this.own('VertexArray',gl.createVertexArray());gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);
        const pos=gl.getAttribLocation(p.program,'a_position');
        gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
        this.quadVAOs.set(p,vao);
      }
      this.makeMesh();
      this.targets=[];this.targetWidth=0;this.targetHeight=0;
      this.coverTexture=null;this.previousTexture=null;
      gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);
      this.resize();
    }
    makeMesh(){
      const gl=this.gl,vertices=[],indices=[],cols=24,rows=18;
      for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++){
        const u=x/cols,v=y/rows,px=u*2-1,py=v*2-1;
        const envelope=Math.sin(Math.PI*u)*Math.sin(Math.PI*v);
        const dx=.19*envelope*Math.sin(v*5.7+u*1.8);
        const dy=.15*envelope*Math.cos(u*5.4-v*1.2);
        vertices.push(px,py,px+dx,py+dy,px-dx*.85,py-dy*.9);
      }
      for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
        const i=y*(cols+1)+x;indices.push(i,i+1,i+cols+1,i+1,i+cols+2,i+cols+1);
      }
      this.meshVAO=this.own('VertexArray',gl.createVertexArray());gl.bindVertexArray(this.meshVAO);
      this.meshBuffer=this.own('Buffer',gl.createBuffer());gl.bindBuffer(gl.ARRAY_BUFFER,this.meshBuffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
      for(const [name,offset] of [['a_position',0],['a_from',8],['a_to',16]]){
        const location=gl.getAttribLocation(this.finalProgram.program,name);
        gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,2,gl.FLOAT,false,24,offset);
      }
      this.indexBuffer=this.own('Buffer',gl.createBuffer());gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
      this.indexCount=indices.length;
    }
    texture(source){
      const gl=this.gl,texture=this.own('Texture',gl.createTexture());gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
      return texture;
    }
    setArtwork(source,luminance,animate=true){
      if(this.destroyed||this.lost)return;
      const gl=this.gl,newTexture=this.texture(source);
      if(this.previousTexture&&this.previousTexture!==this.coverTexture)this.release('Texture',this.previousTexture);
      this.previousTexture=this.coverTexture||newTexture;
      this.coverTexture=newTexture;
      this.transition=this.ready&&animate?0:1;
      this.luminance=luminance;this.lastArtwork=source;
      this.ready=true;this.dirty=true;this.requestFrame();
    }
    target(width,height){
      const gl=this.gl,texture=this.own('Texture',gl.createTexture());gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      const framebuffer=this.own('Framebuffer',gl.createFramebuffer());gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('无法创建背景画布。请降低渲染精度或刷新。');
      return {texture,framebuffer};
    }
    resize(){
      if(this.destroyed||this.lost)return;
      const rect=this.canvas.getBoundingClientRect();
      if(!rect.width||!rect.height)return;
      const max=2048,ratio=Math.min(window.devicePixelRatio||1,2,max/Math.max(rect.width,rect.height));
      this.canvas.width=Math.max(1,Math.round(rect.width*ratio));
      this.canvas.height=Math.max(1,Math.round(rect.height*ratio));
      const scale=this.params.quality/Math.max(rect.width,rect.height);
      const w=Math.max(2,Math.round(rect.width*scale)),h=Math.max(2,Math.round(rect.height*scale));
      if(w!==this.targetWidth||h!==this.targetHeight){
        for(const target of this.targets){this.release('Texture',target.texture);this.release('Framebuffer',target.framebuffer);}
        this.targets=Array.from({length:3},()=>this.target(w,h));
        this.targetWidth=w;this.targetHeight=h;
      }
      this.updateKernel();this.dirty=true;this.requestFrame();
    }
    updateKernel(){
      const sigma=Math.hypot(this.targetWidth,this.targetHeight)*.05*this.params.blur/100;
      const stride=Math.max(1,sigma/16),weights=new Float32Array(49);
      let sum=1;weights[0]=1;
      for(let i=1;i<=48;i++){weights[i]=sigma>.001?Math.exp(-.5*(i*stride/sigma)**2):0;sum+=2*weights[i];}
      for(let i=0;i<weights.length;i++)weights[i]/=sum;
      this.weights=weights;this.sampleStride=stride;
    }
    update(params){
      const previous=this.params;
      this.assertAlive();
      this.params=normalizeParameters(params,this.params);
      if(this.params.quality!==previous.quality)this.resize();
      else if(this.params.blur!==previous.blur)this.updateKernel();
      this.dirty=true;this.requestFrame();
    }
    setPaused(paused){this.assertAlive();this.paused=Boolean(paused);this.lastFrame=0;this.nextFrame=0;this.dirty=true;this.requestFrame();}
    resetTime(){this.assertAlive();this.time=0;this.dirty=true;this.requestFrame();}
    requestFrame(){if(!this.destroyed&&this.ready&&!this.raf&&!this.lost&&!document.hidden)this.raf=requestAnimationFrame(now=>this.tick(now));}
    tick(now){
      this.raf=0;
      if(this.destroyed||this.lost||document.hidden)return;
      if(this.frameInterval&&this.nextFrame&&now<this.nextFrame-this.frameTolerance){this.requestFrame();return;}
      const delta=this.lastFrame?Math.min((now-this.lastFrame)/1000,.05):0;
      if(this.frameInterval)this.nextFrame=this.lastFrame
        ?this.nextFrame+Math.max(1,Math.floor((now-this.nextFrame)/this.frameInterval)+1)*this.frameInterval
        :now+this.frameInterval;
      this.lastFrame=now;
      const moving=!this.paused&&this.params.speed>0;
      const transitioning=this.transition<1;
      if(moving)this.time=(this.time+delta*this.params.speed*(this.reducedMotion ? .1 : 1))%1260;
      if(transitioning)this.transition=Math.min(1,this.transition+delta/.5);
      if(this.ready&&(moving||transitioning||this.dirty)){
        this.render();this.frameCount++;this.dirty=false;
      }
      if(moving||this.transition<1)this.requestFrame();
      else {this.lastFrame=0;this.nextFrame=0;}
    }
    bindTexture(texture,unit=0){const gl=this.gl;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);}
    begin(program,target){
      const gl=this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER,target?target.framebuffer:null);
      gl.viewport(0,0,target?this.targetWidth:this.canvas.width,target?this.targetHeight:this.canvas.height);
      gl.useProgram(program.program);
    }
    drawQuad(program){this.gl.bindVertexArray(this.quadVAOs.get(program));this.gl.drawArrays(this.gl.TRIANGLES,0,6);}
    render(){
      if(this.destroyed||!this.ready||this.lost||!this.targets.length)return;
      const gl=this.gl,p=this.params,composite=this.composite,blur=this.blurProgram,final=this.finalProgram;
      this.begin(composite,this.targets[0]);
      this.bindTexture(this.coverTexture,0);this.bindTexture(this.previousTexture,1);
      this.uniform(composite,'u_cover','1i',0);this.uniform(composite,'u_previous','1i',1);
      this.uniform(composite,'u_crossfade','1f',this.transition);
      this.uniform(composite,'u_time','1f',this.time);
      this.uniform(composite,'u_aspect','1f',this.canvas.width/this.canvas.height);
      this.uniform(composite,'u_saturation','1f',p.sourceSaturation);
      this.drawQuad(composite);
      let image=this.targets[0].texture;
      if(p.blur>0){
        for(let pass=0;pass<2;pass++){
          this.begin(blur,this.targets[pass+1]);this.bindTexture(image);
          this.uniform(blur,'u_image','1i',0);
          this.uniform(blur,'u_weights[0]','1fv',this.weights);
          this.uniform(blur,'u_step','2f',pass===0?this.sampleStride/this.targetWidth:0,pass===1?this.sampleStride/this.targetHeight:0);
          this.drawQuad(blur);image=this.targets[pass+1].texture;
        }
      }
      this.begin(final,null);this.bindTexture(image);
      this.uniform(final,'u_image','1i',0);this.uniform(final,'u_time','1f',this.time);
      this.uniform(final,'u_warp','1f',p.warp/100);this.uniform(final,'u_saturation','1f',p.saturation);
      this.uniform(final,'u_scrim','1f',p.scrim/100);
      this.uniform(final,'u_mode','1f',p.mode==='dark'?0:p.mode==='light'?1:2);
      this.uniform(final,'u_floor','1f',p.floor);this.uniform(final,'u_ceiling','1f',p.ceiling);
      this.uniform(final,'u_hue','1f',p.hue*Math.PI/180);
      this.uniform(final,'u_tintAmount','1f',p.tintAmount/100);
      const color=p.tint.slice(1).match(/../g).map(hex=>parseInt(hex,16)/255);
      this.uniform(final,'u_tint','3f',...color);
      gl.bindVertexArray(this.meshVAO);gl.drawElements(gl.TRIANGLES,this.indexCount,gl.UNSIGNED_SHORT,0);
    }
    snapshot(){
      this.assertAlive();
      if(!this.ready||this.lost)throw new Error('The background is not ready.');
      this.render();
      return new Promise((resolve,reject)=>this.canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not create a PNG snapshot.')),'image/png'));
    }
    diagnostics(){return {ready:this.ready,paused:this.paused,time:this.time,frameCount:this.frameCount,
      transition:this.transition,renderSize:[this.targetWidth,this.targetHeight],canvasSize:[this.canvas.width,this.canvas.height],
      reducedMotion:this.reducedMotion,glError:this.gl.getError(),params:{...this.params}};}
  }

