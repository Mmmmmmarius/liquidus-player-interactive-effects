import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {mkdtemp,writeFile,mkdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from '../scripts/serve.mjs';

test('server isolates the package root, redirects correctly, and refuses writes',async t=>{
  const temp=await mkdtemp(path.join(tmpdir(),'effect-server-test-'));
  const root=path.join(temp,'public');await mkdir(path.join(root,'demo'),{recursive:true});
  await writeFile(path.join(root,'demo/index.html'),'demo');await writeFile(path.join(root,'demo/app.js'),'export {};');await writeFile(path.join(temp,'outside.txt'),'private fixture');
  const server=await createServer({root,port:0});
  t.after(async()=>{await new Promise(r=>server.close(r));
    const target=path.resolve(temp),parent=path.resolve(tmpdir());
    assert.equal(path.dirname(target),parent);assert.ok(path.basename(target).startsWith('effect-server-test-'));
    await rm(target,{recursive:true,force:true});});
  const get=(url,method='GET')=>new Promise((resolve,reject)=>{
    const req=request({host:'127.0.0.1',port:server.address().port,path:url,method},res=>{let body='';res.on('data',x=>body+=x);res.on('end',()=>resolve({code:res.statusCode,headers:res.headers,body}));});req.on('error',reject);req.end();
  });
  const start=await get('/');assert.equal(start.code,302);assert.equal(start.headers.location,'/demo/');
  assert.equal((await get('/demo/')).body,'demo');
  assert.match((await get('/demo/app.js')).headers['content-type'],/javascript/);
  for(const url of ['/../outside.txt','/%2e%2e/outside.txt','/%2e%2e%5coutside.txt','/.env','/demo/%00','//../outside.txt'])assert.equal((await get(url)).code,403,url);
  assert.equal((await get('/%zz')).code,400);
  assert.equal((await get('/demo/','POST')).code,405);assert.equal((await get('/demo/app.js','HEAD')).body,'');
  const target=path.join(temp,'outside-folder');await mkdir(target);await writeFile(path.join(target,'file.txt'),'outside');
  await symlink(target,path.join(root,'linked'),process.platform==='win32'?'junction':'dir');
  assert.equal((await get('/linked/file.txt')).code,403);
  assert.equal((await get('/demo/')).headers['x-content-type-options'],'nosniff');
});
