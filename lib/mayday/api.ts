import { authenticateWorker, registerWorker, availableJobs, claimJob, submitRepair } from './network.ts';
import { CHALLENGES, publicChallenge } from './challenges.ts';
import { createRescue, liveSettings, race, type MaydayEnv } from './engine.ts';
import { getSandbox } from './sandbox.ts';
import { verify, runCase } from './verification.ts';
import { store } from './store.ts';
import type { Challenge, LiveConfig, TestCase } from './types.ts';
import { validateDiscordWebhook, saveNotification, notifyRescued } from './notifications.ts';
import { limitWrites } from './limits.ts';
import { networkActivity } from './activity.ts';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
function inputError(message:string) { return Object.assign(new Error(message),{status:400}); }
export function validateTests(value:unknown):TestCase[] {
 if(!Array.isArray(value)||value.length<1||value.length>20) throw inputError('Provide between 1 and 20 JSON test cases.');
 return value.map((t,i)=>{
  if(!t||typeof t!=='object'||!Array.isArray(t.args)||!Object.hasOwn(t,'expected')) throw inputError(`Test ${i+1} needs an args array and an expected value.`);
  if(JSON.stringify(t).length>32768) throw inputError('Each test must fit within 32 KB.');
  return {name:typeof t.name==='string'?t.name.slice(0,100):`Test ${i+1}`,args:t.args,expected:t.expected};
 });
}
function validateCode(value:unknown) { if(typeof value!=='string'||!value.trim()||value.length>16384) throw inputError('Provide one JavaScript function of up to 16 KB.');return value; }
export async function readJsonBody(request:Request) {
 const reader=request.body?.getReader(); if(!reader) throw inputError('A JSON request body is required.');
 const decoder=new TextDecoder();let text='',bytes=0;
 while(true) {const {done,value}=await reader.read();if(done) break;bytes+=value.byteLength;if(bytes>100000){await reader.cancel();throw Object.assign(new Error('Request exceeds 100 KB.'),{status:413});}text+=decoder.decode(value,{stream:true});}
 text+=decoder.decode();let value;try{value=JSON.parse(text);}catch{throw inputError('Request body must be valid JSON.');}
 if(!value||typeof value!=='object'||Array.isArray(value)) throw inputError('The JSON body must be an object.');return value;
}
const body=readJsonBody;
function customChallenge(input:Record<string,unknown>):Challenge {
 const tests=validateTests(input.tests); const continuation=Array.isArray(input.continuation)?input.continuation:tests[0].args;
 if(JSON.stringify(continuation).length>32768) throw inputError('Continuation arguments exceed 32 KB.');
 if(typeof input.goal!=='string'||!input.goal.trim()||input.goal.length>4000) throw inputError('Describe the intended behavior in the goal field (up to 4,000 characters).');
 return {id:'custom',title:typeof input.title==='string'?input.title.slice(0,100):'Rescue a custom function',filename:'function.js',goal:input.goal,code:validateCode(input.code),error:typeof input.error==='string'?input.error.slice(0,1000):'Acceptance tests are failing.',tests,continuation};
}
export async function handleApi(request:Request, env:MaydayEnv, ctx:ExecutionContext):Promise<Response> {
 const url=new URL(request.url),path=url.pathname;
 try {
  if(request.method==='POST') {
   const origin=request.headers.get('origin');if(origin&&origin!==url.origin) return json({error:'Cross-origin writes are not allowed.'},403);
   await limitWrites(request,env.DB,path);
  }
  if(path==='/api/config'&&request.method==='GET') return json({liveConfigured:!!(env.OPENROUTER_API_KEY||env.ANTHROPIC_API_KEY),provider:env.OPENROUTER_API_KEY?'openrouter':env.ANTHROPIC_API_KEY?'anthropic':null,discordConfigured:!!env.MAYDAY_NOTIFICATION_KEY,mcpUrl:env.MAYDAY_MCP_URL??new URL('/mcp',url).href,mcpResource:env.MAYDAY_MCP_RESOURCE??null,connectedWorkers:(await env.DB.prepare('SELECT COUNT(*) AS count FROM agents WHERE last_seen>?').bind(Date.now()-15000).first<{count:number}>())?.count??0});
  if(path==='/api/network'&&request.method==='GET')return json(await networkActivity(env.DB));
  if(path==='/api/workers/register'&&request.method==='POST') {const b=await body(request);return json(await registerWorker(env.DB,b.name),201);}
  if(path.startsWith('/api/workers/')) {
   const agent=await authenticateWorker(request,env.DB);
   if(path==='/api/workers/jobs'&&request.method==='GET') return json(await availableJobs(env.DB,agent));
   if(path==='/api/workers/claim'&&request.method==='POST') {const b=await body(request);if(typeof b.rescueId!=='string'||! /^[a-f0-9-]{36}$/.test(b.rescueId)) throw inputError('A valid rescueId is required.');return json(await claimJob(env.DB,agent,b.rescueId));}
   if(path==='/api/workers/submit'&&request.method==='POST') {const b=await body(request);const result=await submitRepair(env.DB,agent,{rescueId:String(b.rescueId),code:validateCode(b.code),explanation:typeof b.explanation==='string'?b.explanation.slice(0,600):undefined,model:typeof b.model==='string'?b.model.slice(0,100):undefined});if(result.won)ctx.waitUntil(notifyRescued(env,result.rescueId,env.MAYDAY_ORIGIN??url.origin));return json(result);}
   if(path==='/api/workers/disconnect'&&request.method==='POST') {await env.DB.prepare('UPDATE agents SET last_seen=0 WHERE id=?').bind(agent.id).run();return json({disconnected:true});}
  }
  if(path==='/api/challenges'&&request.method==='GET') return json({challenges:CHALLENGES.map(publicChallenge)});
  if(path==='/api/execute'&&request.method==='POST') { const b=await body(request); if(!Array.isArray(b.args)||JSON.stringify(b.args).length>32768) throw inputError('Provide a JSON args array of up to 32 KB.'); const result=runCase(await getSandbox(),validateCode(b.code),{name:'Fresh input',args:b.args,expected:null}); return result.error?json({error:result.error},422):json({result:result.actual}); }
  if(path==='/api/verify'&&request.method==='POST') { const b=await body(request);return json(verify(await getSandbox(),validateCode(b.code),validateTests(b.tests))); }
  if(path==='/api/rescues'&&request.method==='GET') return json({rescues:await store(env.DB).list()});
  if(path==='/api/rescues'&&request.method==='POST') {
   const b=await body(request);if(b.mode!==undefined&&b.mode!=='demo'&&b.mode!=='live'&&b.mode!=='network') throw inputError('Mode must be demo, live, or network.');
   const mode=b.mode==='network'?'network':b.mode==='live'?'live':'demo';
   const challenge=b.challenge?customChallenge(b.challenge):CHALLENGES.find(c=>c.id===(b.challengeId??'checkout'));
   if(!challenge) throw inputError('Unknown challenge.');
   let settings:LiveConfig|undefined;
   if(b.live) {
    if(!['anthropic','openrouter'].includes(b.live.provider)) throw inputError('Choose Anthropic or OpenRouter.');
    if(b.live.apiKey!==undefined&&(typeof b.live.apiKey!=='string'||b.live.apiKey.length>512)) throw inputError('Invalid model API key.');
    if(b.live.models!==undefined&&(!Array.isArray(b.live.models)||b.live.models.length<1||b.live.models.length>3||b.live.models.some((x:unknown)=>typeof x!=='string'||x.length>100))) throw inputError('Provide between one and three model names.');
    settings=b.live;
   }
   if(mode==='live'&&!settings?.apiKey?.trim() && (env.OPENROUTER_API_KEY||env.ANTHROPIC_API_KEY) && (!env.MAYDAY_API_TOKEN || request.headers.get('authorization')!==`Bearer ${env.MAYDAY_API_TOKEN}`)) return json({error:'A server-funded rescue needs a valid MAYDAY_API_TOKEN. Or connect your own provider key for this run.'},401);
   const config=mode==='live'?liveSettings(env,settings):null;
   if(mode==='live'&&!config) return json({error:'Connect an AI provider first. Your key is used for this run only and is never saved.'},422);
   if(mode==='demo'&&challenge.id==='custom') return json({error:'Custom rescues need live AI. You can still test a custom patch using /api/verify.'},422);
   if(await store(env.DB).activeCount()>=4) return json({error:'Four rescues are already active. Wait for one to finish.'},429);
   let webhook:string|undefined;if(b.notifications?.discordWebhook){if(!env.MAYDAY_NOTIFICATION_KEY)throw Object.assign(new Error('Discord notifications are not configured on this server.'),{status:422});webhook=validateDiscordWebhook(b.notifications.discordWebhook);}
   const rescue=await createRescue(env.DB,challenge,mode);
   if(webhook){try{await saveNotification(env,rescue.id,webhook);}catch{await store(env.DB).event(rescue.id,'DISPATCH','notification','Discord could not be connected for this rescue. The rescue will continue.');}}
   if(mode==='network') {await store(env.DB).event(rescue.id,'BUILDER','blocked',`Builder paused: ${rescue.original.total-rescue.original.passedCount} acceptance tests failed.`);await store(env.DB).event(rescue.id,'DISPATCH','dispatch','SOS broadcast. Waiting for independently connected rescue agents.');}
   else ctx.waitUntil(race(env.DB,rescue,challenge,config).then(()=>notifyRescued(env,rescue.id,env.MAYDAY_ORIGIN??url.origin)).catch(async()=>{await store(env.DB).finish(rescue.id,{status:'failed',error:'Dispatch was interrupted. Please retry.',completedAt:Date.now()});}));
   return json({id:rescue.id,status:rescue.status,statusUrl:`/api/rescues/${rescue.id}`,rescue},202);
  }
  const match=path.match(/^\/api\/rescues\/([a-f0-9-]{36})(\/artifact)?$/);
  if(match&&request.method==='GET') {
   const rescue=await store(env.DB).get(match[1]);if(!rescue) return json({error:'Rescue not found.'},404);
   if(match[2]) {if(rescue.status!=='resumed') return json({error:'A verified repair is required before downloading an artifact.'},409);const artifact={rescueId:rescue.id,title:rescue.title,code:rescue.patch,tests:rescue.challenge.tests,verification:rescue.workers.find(w=>w.id===rescue.winnerId)?.report,continuationArgs:rescue.challenge.continuation,continuationOutput:rescue.result,sha256:rescue.receipt};return new Response(JSON.stringify(artifact,null,2),{headers:{'content-type':'application/json','content-disposition':`attachment; filename="mayday-${rescue.id.slice(0,8)}.json"`,'cache-control':'no-store'}});}
   return json({rescue});
  }
  if(path==='/api/health') return json({status:'ok',service:'mayday',sandbox:'QuickJS WASM',storage:!!env.DB});
  return json({error:'Route not found.'},404);
 } catch(error) {
  const e=error as Error&{status?:number};
  const expected=e.status||e.message?.includes('already passes');
  if(!expected) console.error('MAYDAY API error:', e.message);
  return json({error:expected?e.message:'Dispatch is temporarily unavailable. Your input is preserved; please retry.'},e.status??(expected?400:503));
 }
}
