import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { MaydayClient } from '../sdk/mayday.mjs';
const base=process.env.MAYDAY_URL??'http://127.0.0.1:5173';let sequence=0;
async function mcp(method,params){const r=await fetch(base+'/mcp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++sequence,method,params})});assert.equal(r.status,200);return (await r.json()).result;}
async function call(name,args,expectedError=false){const r=await mcp('tools/call',{name,arguments:args});assert.equal(r.isError,expectedError,r.content?.[0]?.text);return expectedError?r.content[0].text:JSON.parse(r.content[0].text);}
const initialized=await mcp('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'MAYDAY integration test',version:'1'}});
assert.match(initialized.instructions,/untrusted/);assert.equal(initialized.protocolVersion,'2025-06-18');
const listed=await mcp('tools/list',{});assert.equal(listed.tools.length,8);
const challenge={title:'MCP caller: normalize a name',goal:'Trim a string, collapse whitespace to one space and return lowercase. Empty input returns an empty string.',code:'function normalize(s){ return s.trim(); }',tests:[{name:'case',args:['HELLO'],expected:'hello'},{name:'spacing',args:['  ONE   TWO  '],expected:'one two'},{name:'tabs',args:['One\tTwo'],expected:'one two'},{name:'blank',args:['  '],expected:''}],continuation:['  NEW\n   INPUT  ']};
assert.equal((await call('check_function',{code:challenge.code,tests:challenge.tests})).passed,false);
const a=await call('join_rescue_network',{name:'MCP / PATCH'}),b=await call('join_rescue_network',{name:'MCP / CODEX'});
const sos=await call('send_sos',{mode:'network',challenge});
assert((await call('list_rescue_jobs',{workerToken:a.workerToken})).jobs.some(j=>j.id===sos.id));
const ca=await call('claim_rescue',{workerToken:a.workerToken,rescueId:sos.id}),cb=await call('claim_rescue',{workerToken:b.workerToken,rescueId:sos.id});assert.notEqual(ca.slotId,cb.slotId);
await call('submit_rescue_patch',{workerToken:'invalid',rescueId:sos.id,code:'function normalize(s){return s}'},true);
const bad=await call('submit_rescue_patch',{workerToken:a.workerToken,rescueId:sos.id,code:'function normalize(s){return s.trim().toLowerCase()}',explanation:'Partial repair: changes case but misses whitespace'});assert.equal(bad.won,false);assert.equal(bad.verification.passed,false);
const code='function normalize(s){return s.trim().replace(/\\s+/g," ").toLowerCase()}';
const good=await call('submit_rescue_patch',{workerToken:b.workerToken,rescueId:sos.id,code,explanation:'Normalize all whitespace and lowercase the trimmed value.'});assert.equal(good.won,true);assert.equal(good.verification.passed,true);
const replay=await call('submit_rescue_patch',{workerToken:b.workerToken,rescueId:sos.id,code});assert.equal(replay.replayed,true);assert.equal(replay.won,true);
const {rescue}=await call('get_rescue',{id:sos.id});assert.equal(rescue.status,'resumed');assert.equal(rescue.result,'new input');assert(!JSON.stringify(rescue).includes(a.workerToken));assert(!JSON.stringify(rescue).includes(b.workerToken));
assert.equal((await call('run_function',{code:rescue.patch,args:['   FRESH\tEXAMPLE  ']})).result,'fresh example');
await call('run_function',{code:'function steal(){return process.env}',args:[]},true);
const client=new MaydayClient({baseUrl:base});const wrapped=await client.run({...challenge,code});assert.equal(wrapped.rescued,false);assert.equal(wrapped.result,'new input');
const originRejected=await fetch(base+'/mcp',{method:'POST',headers:{'content-type':'application/json',origin:'https://evil.test'},body:'{}'});assert.equal(originRejected.status,403);
const unknown=await call('get_rescue',{id:'../../secrets'},true);assert.match(unknown,/UUID/);
await mkdir('work/integration',{recursive:true});await writeFile('work/integration/mcp-proof.json',JSON.stringify({testedAt:new Date().toISOString(),rescueUrl:sos.rescueUrl,receipt:rescue.receipt,verification:good.verification,continuation:rescue.result,checks:['stateless MCP','separate worker tokens','failed patch rejected','first verified repair won','idempotent replay','sandbox continuation','fresh input','host access blocked','cross-origin writes blocked']},null,2));
console.log(`PASS: remote MCP caller → two separately registered workers → rejected patch → verified winner → resumed output → fresh input.\nProof: ${sos.rescueUrl}`);
