import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getQuickJS } from 'quickjs-emscripten';
import { CHALLENGES } from '../lib/mayday/challenges.ts';
import { verify, runCase } from '../lib/mayday/verification.ts';
import { propose } from '../lib/mayday/providers.ts';
const module=await getQuickJS();
test('all three fixtures reject the original and incomplete repair, and accept both full repairs',()=>{
 for(const c of CHALLENGES){assert.equal(verify(module,c.code,c.tests).passed,false,c.id);assert.equal(verify(module,c.demoPatches![0],c.tests).passed,false,c.id+' incomplete');assert.equal(verify(module,c.demoPatches![1],c.tests).passed,true,c.id+' root cause');assert.equal(verify(module,c.demoPatches![2],c.tests).passed,true,c.id+' edge cases');}
});
test('repaired checkout produces a real result for an unseen cart',()=>{
 const c=CHALLENGES[0];const result=runCase(module,c.demoPatches![1],{name:'unseen cart',args:[[{price:10,quantity:3}],10],expected:27});assert.equal(result.passed,true);assert.equal(result.actual,27);
});
test('guest code cannot use network or host process, including constructor tricks',()=>{
 for(const code of ['function f(){return fetch("https://example.com")}','function f(){return process.env}','function f(){return [].constructor.constructor("return typeof process")()}']){const r=runCase(module,code,{name:'escape',args:[],expected:'object'});assert.equal(r.passed,false);}
});
test('CPU, stack, allocation, and getter loops are bounded and the next test still executes',()=>{
 for(const code of ['function f(){while(true){}}','function f(){return f()}','function f(){return "x".repeat(1000000000)}','function f(){return {get x(){while(true){}}}}']){const r=runCase(module,code,{name:'bounded',args:[],expected:1});assert.ok(r.error,code);}
 assert.equal(runCase(module,'function f(){return 42}',{name:'next',args:[],expected:42}).passed,true);
});
test('fresh contexts prevent prototype and global state contamination',()=>{
 const r=verify(module,'function f(){Object.prototype.poison=true;globalThis.count=(globalThis.count||0)+1;return globalThis.count}',[{name:'one',args:[],expected:1},{name:'two',args:[],expected:1}]);assert.equal(r.passed,true);assert.equal(({} as Record<string,unknown>).poison,undefined);
});
test('JSON comparison ignores object key order and rejects promises, undefined and cycles',()=>{
 assert.equal(runCase(module,'function f(){return {b:2,a:1}}',{name:'object',args:[],expected:{a:1,b:2}}).passed,true);
 for(const code of ['async function f(){return 1}','function f(){}','function f(){const x={};x.self=x;return x}'])assert.ok(runCase(module,code,{name:'invalid output',args:[],expected:1}).error);
});
test('OpenRouter and Anthropic adapters send the correct provider contract and extract repairs',async()=>{
 const originalFetch=globalThis.fetch;const captured:Array<{url:string;body:Record<string,unknown>;headers:Record<string,string>}> = [];
 try {
  globalThis.fetch=async (url,init)=>{captured.push({url:String(url),body:JSON.parse(String(init?.body)),headers:init?.headers as Record<string,string>});const patch=JSON.stringify({code:'function add(a,b){return a+b}',explanation:'Fixed the operator.'});return Response.json(String(url).includes('anthropic')?{content:[{type:'text',text:patch}]}:{choices:[{message:{content:patch}}]});};
  for(const provider of ['openrouter','anthropic'] as const){const r=await propose(CHALLENGES[0],0,{provider,apiKey:'test-secret',models:['test-model']});assert.match(r.code,/return a\+b/);assert.equal(r.model,'test-model');}
  assert.equal(captured[0].headers.authorization,'Bearer test-secret');assert.equal(captured[1].headers['x-api-key'],'test-secret');assert.equal(captured[1].headers['anthropic-version'],'2023-06-01');assert.equal(typeof captured[1].body.system,'string');assert.ok(!(captured[0].body.messages as Array<{content:string}>).some(x=>x.content.includes('test-secret')));
 } finally {globalThis.fetch=originalFetch;}
});
test('provider failures do not expose provider response bodies or keys',async()=>{
 const originalFetch=globalThis.fetch;try{globalThis.fetch=async()=>new Response('secret-private-response',{status:401});await assert.rejects(propose(CHALLENGES[0],0,{provider:'openrouter',apiKey:'not-real',models:['model']}),e=>e instanceof Error&&e.message.includes('HTTP 401')&&!e.message.includes('secret-private-response'));}finally{globalThis.fetch=originalFetch;}
});
