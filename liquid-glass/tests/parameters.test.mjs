import test from 'node:test';
import assert from 'node:assert/strict';
import {SCHEMA,DEFAULTS,normalizeParameters} from '../src/parameters.js';
import {parsePreset,serializePreset} from '../src/validation.js';

test('updates reject unknown keys and malformed objects atomically',()=>{
  const base=structuredClone(DEFAULTS), before=structuredClone(base);
  for(const bad of [null,[],3,'text',{unknown:1},JSON.parse('{"__proto__":{"polluted":true}}'),{constructor:4}]) assert.throws(()=>normalizeParameters(bad,base));
  assert.deepEqual(base,before);assert.equal({}.polluted,undefined);
});
test('numeric inputs clamp; strings and nonfinite numbers never reach shaders',()=>{
  for(const [key,rule] of Object.entries(SCHEMA)){
    if(rule.type)continue;
    assert.equal(normalizeParameters({[key]:-1e9})[key],rule.min);
    assert.equal(normalizeParameters({[key]:1e9})[key],rule.max);
    for(const bad of [NaN,Infinity,-Infinity,'1',null,undefined]) assert.throws(()=>normalizeParameters({[key]:bad}));
  }
});
test('typed values and vectors are validated without leaking mutable defaults',()=>{
  for(const [key,rule] of Object.entries(SCHEMA)){
    if(rule.type==='boolean')assert.throws(()=>normalizeParameters({[key]:1}));
    if(rule.type==='color'){assert.throws(()=>normalizeParameters({[key]:'url(https://invalid.example/)'}));assert.equal(normalizeParameters({[key]:'#ABCDEF'})[key],'#abcdef');}
    if(rule.type==='select')assert.throws(()=>normalizeParameters({[key]:'unrecognized'}));
    if(rule.type==='vector'){assert.throws(()=>normalizeParameters({[key]:[1,2]}));const next=normalizeParameters({});next[key][0]=.2;assert.deepEqual(DEFAULTS[key],rule.default);}
  }
});
test('preset round trips preserve values and reject the wrong effect or version',()=>{
  const text=serializePreset('example',normalizeParameters({}));
  assert.deepEqual(parsePreset(text,'example',normalizeParameters),normalizeParameters({}));
  assert.throws(()=>parsePreset(text,'other',normalizeParameters));
  assert.throws(()=>parsePreset('{"format":2,"effect":"example","parameters":{}}','example',normalizeParameters));
  assert.throws(()=>parsePreset('{"format":1,"effect":"example","parameters":null}','example',normalizeParameters));
  assert.throws(()=>parsePreset(' '.repeat(32769),'example',normalizeParameters));
});
