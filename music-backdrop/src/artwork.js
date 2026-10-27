  export function prepareArtwork(source){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=300;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    const w=source.naturalWidth||source.width,h=source.naturalHeight||source.height,side=Math.min(w,h);
    if(!w||!h)throw new TypeError('Decode the image first; its dimensions must be positive.');
    ctx.drawImage(source,(w-side)/2,(h-side)/2,side,side,0,0,300,300);
    const {data}=ctx.getImageData(0,0,300,300);let sum=0;
    // Composite transparency onto an opaque neutral backing before making a GL texture.
    for(let i=0;i<data.length;i+=4){
      const a=data[i+3]/255;sum+=(.2126*(data[i]*a+32*(1-a))+.7152*(data[i+1]*a+32*(1-a))+.0722*(data[i+2]*a+32*(1-a)))/255;
    }
    ctx.globalCompositeOperation='destination-over';ctx.fillStyle='#202020';ctx.fillRect(0,0,300,300);
    return {canvas,luminance:sum/(300*300)};
  }
