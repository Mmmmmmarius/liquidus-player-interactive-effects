#!/usr/bin/env node
import http from 'node:http';
import {readFile,realpath,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
/** A loopback-only static server. It never accepts uploads or executes source files. */
export async function createServer({root,port=4171}={}) {
  const base=await realpath(root || path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
  const inside=target=>{const rel=path.relative(base,target);return !rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel);};
  const server=http.createServer(async(req,res)=>{
    const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store',
      'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'"};
    const send=(code,text)=>{res.writeHead(code,{...headers,'Content-Type':'text/plain; charset=utf-8'});res.end(req.method==='HEAD'?'':text);};
    if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');send(405,'Method not allowed.');return;}
    try{
      // Decode before normalization so encoded traversal cannot be hidden by URL parsing.
      const raw=decodeURIComponent((req.url||'/').split('?')[0]);
      if(!raw.startsWith('/')||raw.includes('\\')||raw.includes('\0')||raw.split('/').some(p=>p==='..'||p.startsWith('.'))){send(403,'Forbidden.');return;}
      if(raw==='/'){res.writeHead(302,{...headers,Location:'/demo/'});res.end();return;}
      const requested=raw==='/'?'/demo/index.html':raw.endsWith('/')?raw+'index.html':raw;
      const candidate=path.resolve(base,'.'+requested);
      if(!inside(candidate)){send(403,'Forbidden.');return;}
      const target=await realpath(candidate);
      if(!inside(target)){send(403,'Forbidden.');return;}
      if(!(await stat(target)).isFile()){send(404,'Not found.');return;}
      const data=await readFile(target);res.writeHead(200,{...headers,'Content-Type':TYPES[path.extname(target)]||'text/plain; charset=utf-8','Content-Length':data.length});res.end(req.method==='HEAD'?undefined:data);
    }catch(error){send(error instanceof URIError?400:404,'Not found.');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=process.argv.slice(2);const index=args.indexOf('--port');const value=index<0?4171:Number(args[index+1]);
  if(!Number.isInteger(value)||value<1024||value>65535)throw new Error('Choose --port between 1024 and 65535.');
  try{const server=await createServer({port:value});console.log(`Demo ready: http://127.0.0.1:${server.address().port}/`);console.log('Press Ctrl+C to stop.');}
  catch(error){console.error(error.code==='EADDRINUSE'?'Port is busy. Choose another --port.':error.message);process.exitCode=1;}
}
