import { propose } from './providers.ts';
import type { Challenge, LiveConfig, Rescue, RescueWorker } from './types.ts';
import { WORKERS } from './types.ts';
import { publicChallenge } from './challenges.ts';
import { getSandbox } from './sandbox.ts';
import { verify, runCase } from './verification.ts';
import { store } from './store.ts';
export type MaydayEnv = { DB: D1Database; OPENROUTER_API_KEY?:string; ANTHROPIC_API_KEY?:string; MAYDAY_MODELS?:string; MAYDAY_API_TOKEN?:string; MAYDAY_NOTIFICATION_KEY?:string; MAYDAY_MCP_URL?:string; MAYDAY_MCP_RESOURCE?:string; MAYDAY_ORIGIN?:string };
export function liveSettings(env:MaydayEnv, input?:LiveConfig): LiveConfig | null {
 const provider=input?.provider??(env.OPENROUTER_API_KEY?'openrouter':'anthropic');
 const apiKey=input?.apiKey?.trim() || (provider==='openrouter'?env.OPENROUTER_API_KEY:env.ANTHROPIC_API_KEY);
 if (!apiKey) return null;
 const configured=input?.models?.filter(Boolean) ?? env.MAYDAY_MODELS?.split(',').map(s=>s.trim()).filter(Boolean);
 const models=configured?.length?configured:(provider==='openrouter'?['anthropic/claude-sonnet-4.5','openai/gpt-5-mini','google/gemini-2.5-flash']:['claude-sonnet-4-5-20250929']);
 return {provider,apiKey,models};
}
export async function createRescue(db:D1Database, challenge:Challenge, mode:'demo'|'live'|'network'):Promise<Rescue> {
 const module=await getSandbox(); const original=verify(module,challenge.code,challenge.tests);
 if (original.passed) throw new Error('This code already passes every test. Add a failing test before requesting rescue.');
 const rescue:Rescue={id:crypto.randomUUID(),title:challenge.title,challengeId:challenge.id,status:'racing',mode,createdAt:Date.now(),challenge:publicChallenge(challenge),original,workers:WORKERS.map(w=>({id:w.id,name:w.name,role:w.role,color:w.color,status:'queued'})),events:[]};
 await store(db).create(rescue); return rescue;
}
export async function race(db:D1Database, rescue:Rescue, challenge:Challenge, config:LiveConfig|null) {
 const s=store(db); const module=await getSandbox(); let winner:string|undefined;
 await s.event(rescue.id,'BUILDER','blocked',`Builder paused: ${rescue.original.total-rescue.original.passedCount} acceptance tests failed.`);
 await s.event(rescue.id,'DISPATCH','dispatch',`SOS received. ${rescue.mode==='demo'?'Three scripted rehearsal':'Three live AI'} workers dispatched.`);
 await Promise.all(WORKERS.map(async (spec,index)=>{
  const worker:RescueWorker={id:spec.id,name:spec.name,role:spec.role,color:spec.color,status:'working'};
  const started=Date.now();
  try {
   await s.worker(rescue.id,worker); await s.event(rescue.id,spec.name,'working',rescue.mode==='demo'?`Rehearsing: ${spec.role.toLowerCase()}.`:`Investigating with ${config?.models?.[index]??config?.models?.[0]}.`);
   const patch=rescue.mode==='demo'
    ? await (async()=>{await new Promise(r=>setTimeout(r,[1600,4400,6600][index]));return {code:challenge.demoPatches![index],explanation:challenge.demoNotes![index],model:'scripted rehearsal'};})()
    : await propose(challenge,index,config!);
   worker.code=patch.code;worker.explanation=patch.explanation;worker.model=patch.model;worker.status='testing';
   await s.worker(rescue.id,worker); await s.event(rescue.id,spec.name,'testing','Patch submitted. Running every acceptance test in the sandbox.');
   const report=verify(module,patch.code,challenge.tests);worker.report=report;worker.elapsedMs=Date.now()-started;
   worker.status=report.passed?'verified':'rejected';
   await s.worker(rescue.id,worker);
   await s.event(rescue.id,spec.name,report.passed?'passed':'rejected',`${report.passedCount}/${report.total} tests passed. ${patch.explanation}`);
   if(report.passed&&!winner) {
    // The continuation executes the repaired function, rather than trusting a model's success claim.
    const continuation=runCase(module,patch.code,{name:'Resume the original task',args:challenge.continuation,expected:null});
    if(continuation.error) throw new Error(`The patch passed the tests but the resumed task failed: ${continuation.error}`);
    const receipt=await sha256(JSON.stringify({rescueId:rescue.id,code:patch.code,tests:challenge.tests,result:continuation.actual}));
    const claimed=await s.finish(rescue.id,{status:'resumed',completedAt:Date.now(),winnerId:spec.id,patch:patch.code,result:continuation.actual,receipt});
    if(claimed) {
     winner=spec.id;worker.status='winner';await s.worker(rescue.id,worker);
     await s.event(rescue.id,'VERIFIER','winner',`${spec.name} wins. All tests passed. Patch returned to the builder.`);
     await s.event(rescue.id,'BUILDER','resumed',`Builder applied the patch and resumed. Output: ${JSON.stringify(continuation.actual).slice(0,300)}`);
    }
   }
  } catch(error) {
   worker.status='error';worker.error=error instanceof Error?error.message:'Worker failed';worker.elapsedMs=Date.now()-started;
   await s.worker(rescue.id,worker);await s.event(rescue.id,spec.name,'error',worker.error!);
  }
 }));
 if(!winner) { const message='No worker produced a verified repair. The builder remains paused; no patch was applied.'; await s.finish(rescue.id,{status:'failed',completedAt:Date.now(),error:message});await s.event(rescue.id,'DISPATCH','failed',message); }
}
export async function sha256(value:string) {const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes)).map(x=>x.toString(16).padStart(2,'0')).join('');}
