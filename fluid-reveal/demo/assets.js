/** Original procedural demo images. No image files, fonts or network requests. */
export function artwork(kind = 0) {
  const c = document.createElement('canvas'); c.width = 1400; c.height = 1000;
  const x = c.getContext('2d'), W=c.width, H=c.height;
  const palettes = [ ['#000000','#0920d8','#990c08','#f3f0ea'], ['#0920d8','#e3e5ff','#990c08','#000000'], ['#f3f0ea','#d0cdc6','#990c08','#000000'] ];
  const p = palettes[kind % palettes.length];
  const g = x.createLinearGradient(0,0,W,H); g.addColorStop(0,p[0]); g.addColorStop(1,p[1]);
  x.fillStyle=g; x.fillRect(0,0,W,H);
  x.fillStyle=p[2]; x.beginPath(); x.arc(W*.65,H*.43,H*.34,0,Math.PI*2); x.fill();
  x.fillStyle=p[3]; x.beginPath(); x.arc(W*.67,H*.40,H*.18,0,Math.PI*2); x.fill();
  for (let i=0;i<13;i++) {
    x.beginPath(); x.moveTo(-100,H*.5+i*44);
    x.bezierCurveTo(W*.27,H*.1+i*45,W*.55,H*1.2+i*6,W+100,H*.64+i*39);
    x.strokeStyle=i%3===0?p[3]:p[0]; x.lineWidth=i%3===0?3:18; x.stroke();
  }
  x.fillStyle=p[3]; x.font='500 20px monospace'; x.fillText('FORM STUDY',64,72);
  x.font='18px monospace'; x.fillText(['01 · TIDAL','02 · ORBIT','03 · PAPER'][kind%3],64,H-60);
  x.globalAlpha=.18; x.strokeStyle=p[3]; x.lineWidth=1;
  for(let i=0;i<W;i+=80){ x.beginPath();x.moveTo(i,0);x.lineTo(i,H);x.stroke(); }
  x.globalAlpha=1; return c;
}

/** Decode locally; reject huge or unexpected files before uploading to WebGL. */
export async function readLocalImage(file) {
  if (!file || !['image/png','image/jpeg','image/webp'].includes(file.type)) throw new TypeError('Choose a PNG, JPEG or WebP image.');
  if (file.size > 15 * 1024 * 1024) throw new RangeError('Choose an image smaller than 15 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 40_000_000) throw new RangeError('Choose an image below 40 megapixels.');
    const scale = Math.min(1,2048/Math.max(bitmap.width,bitmap.height));
    const c = document.createElement('canvas'); c.width=Math.max(1,Math.round(bitmap.width*scale));c.height=Math.max(1,Math.round(bitmap.height*scale));
    c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height); return c;
  } finally { bitmap.close(); }
}
