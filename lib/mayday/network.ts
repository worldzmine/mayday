import { sha256 } from './engine.ts';
import { store } from './store.ts';
import { getSandbox } from './sandbox.ts';
import { verify, runCase } from './verification.ts';
import type { RescueWorker } from './types.ts';
export type ConnectedAgent={id:string;name:string;last_seen:number};
export async function authenticateWorker(request:Request,db:D1Database):Promise<ConnectedAgent> {
 const token=request.headers.get('authorization')?.replace(/^Bearer /,'');
 if(!token||token.length>200) throw Object.assign(new Error('A registered worker token is required.'),{status:401});
 const agent=await db.prepare('SELECT id,name,last_seen FROM agents WHERE token_hash=? AND last_seen>?').bind(await sha256(token),Date.now()-86400000).first<ConnectedAgent>();
 if(!agent) throw Object.assign(new Error('Worker token is invalid.'),{status:401});
 await db.prepare('UPDATE agents SET last_seen=? WHERE id=?').bind(Date.now(),agent.id).run();return agent;
}
export async function registerWorker(db:D1Database,name:unknown) {
 if(typeof name!=='string'||!name.trim()||name.length>40) throw Object.assign(new Error('Worker name must be 1–40 characters.'),{status:400});
 const id=crypto.randomUUID(), token=`mdw_${crypto.randomUUID()}${crypto.randomUUID().replace(/-/g,'')}`;
 await db.prepare('INSERT INTO agents(id,name,token_hash,last_seen) VALUES(?,?,?,?)').bind(id,name.trim(),await sha256(token),Date.now()).run();
 return {workerId:id,token,name:name.trim()};
}
export async function availableJobs(db:D1Database,agent:ConnectedAgent) {
 const rows=await db.prepare("SELECT id,payload FROM rescues WHERE mode='network' AND status='racing' AND created_at>? AND id NOT IN(SELECT rescue_id FROM worker_claims WHERE agent_id=? AND submitted_at IS NOT NULL) ORDER BY created_at LIMIT 8").bind(Date.now()-120000,agent.id).all<{id:string;payload:string}>();
 return {jobs:rows.results.map(r=>{const p=JSON.parse(r.payload);return {id:r.id,title:p.title,goal:p.challenge.goal,createdAt:p.createdAt};})};
}
export async function claimJob(db:D1Database,agent:ConnectedAgent,rescueId:string) {
 const s=store(db),rescue=await s.get(rescueId);if(!rescue||rescue.mode!=='network'||rescue.status!=='racing') throw Object.assign(new Error('This network rescue is no longer accepting workers.'),{status:409});
 const existing=await db.prepare('SELECT slot_id,submitted_at FROM worker_claims WHERE rescue_id=? AND agent_id=?').bind(rescueId,agent.id).first<{slot_id:string;submitted_at:number|null}>();
 if(existing) {if(existing.submitted_at) throw Object.assign(new Error('This worker already submitted a repair.'),{status:409});await db.prepare('UPDATE worker_claims SET lease_expires_at=? WHERE rescue_id=? AND agent_id=?').bind(Date.now()+60000,rescueId,agent.id).run();return {rescueId,slotId:existing.slot_id,challenge:rescue.challenge};}
 for(const slot of ['patch','trace','forge']) {
  const now=Date.now();
  const r=await db.prepare("INSERT INTO worker_claims(rescue_id,slot_id,agent_id,lease_expires_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM rescues WHERE id=? AND status='racing') AND NOT EXISTS(SELECT 1 FROM worker_claims WHERE rescue_id=? AND agent_id=?) ON CONFLICT(rescue_id,slot_id) DO UPDATE SET agent_id=excluded.agent_id,lease_expires_at=excluded.lease_expires_at WHERE worker_claims.lease_expires_at<? AND worker_claims.submitted_at IS NULL").bind(rescueId,slot,agent.id,now+60000,rescueId,rescueId,agent.id,now).run();
  if(r.meta.changes) {const w=rescue.workers.find(w=>w.id===slot)!;await s.worker(rescueId,{...w,name:agent.name,role:'Connected rescue agent',status:'working'});await s.event(rescueId,agent.name,'working','External agent claimed a repair slot over the worker API.');return {rescueId,slotId:slot,challenge:rescue.challenge};}
 }
 throw Object.assign(new Error('All three rescue slots are currently claimed.'),{status:409});
}
export async function submitRepair(db:D1Database,agent:ConnectedAgent,input:{rescueId:string;code:string;explanation?:string;model?:string}) {
 const s=store(db),hash=await sha256(input.code);
 const claim=await db.prepare('SELECT slot_id,lease_expires_at,submitted_at,submission_hash,result FROM worker_claims WHERE rescue_id=? AND agent_id=?').bind(input.rescueId,agent.id).first<{slot_id:string;lease_expires_at:number;submitted_at:number|null;submission_hash:string|null;result:string|null}>();
 if(claim?.result&&claim.submission_hash===hash)return {...JSON.parse(claim.result),replayed:true};
 const rescue=await s.get(input.rescueId);
 if(claim?.submitted_at&&claim.submission_hash!==hash)throw Object.assign(new Error('This slot already received a different patch.'),{status:409});
 if(!rescue||rescue.mode!=='network')throw Object.assign(new Error('Network rescue not found.'),{status:404});
 if(rescue.status!=='racing'){
  const worker=rescue.workers.find(w=>w.id===claim?.slot_id);
  if(claim?.submission_hash===hash&&worker?.report)return {won:rescue.winnerId===claim.slot_id,verification:worker.report,rescueId:rescue.id,replayed:true};
  throw Object.assign(new Error('This rescue is already closed.'),{status:409});
 }
 if(!claim||(!claim.submitted_at&&claim.lease_expires_at<Date.now()))throw Object.assign(new Error('Claim an available slot before submitting. Claims expire after 60 seconds.'),{status:409});
 const processingAt=Date.now();
 if(claim.submitted_at){if(processingAt-claim.submitted_at<10000)throw Object.assign(new Error('This patch is being processed. Retry the same patch shortly.'),{status:409});const renewed=await db.prepare('UPDATE worker_claims SET submitted_at=? WHERE rescue_id=? AND agent_id=? AND submitted_at=? AND submission_hash=? AND result IS NULL').bind(processingAt,rescue.id,agent.id,claim.submitted_at,hash).run();if(!renewed.meta.changes)throw Object.assign(new Error('This patch is being processed. Retry the same patch shortly.'),{status:409});}
 else {const reserved=await db.prepare('UPDATE worker_claims SET submitted_at=?,submission_hash=? WHERE rescue_id=? AND agent_id=? AND submitted_at IS NULL AND lease_expires_at>=?').bind(processingAt,hash,rescue.id,agent.id,processingAt).run();if(!reserved.meta.changes)throw Object.assign(new Error('This patch is being processed. Retry the same patch shortly.'),{status:409});}
 const module=await getSandbox();const report=verify(module,input.code,rescue.challenge.tests);
 const worker:RescueWorker={...rescue.workers.find(w=>w.id===claim.slot_id)!,agentId:agent.id,name:agent.name,role:'Connected rescue agent',status:report.passed?'verified':'rejected',code:input.code,explanation:input.explanation??'External agent submitted a repair.',report,elapsedMs:Date.now()-rescue.createdAt,model:input.model??'external worker'};
 const saved=await db.prepare("UPDATE rescue_workers SET payload=? WHERE rescue_id=? AND worker_id=? AND EXISTS(SELECT 1 FROM worker_claims WHERE rescue_id=? AND agent_id=? AND submitted_at=?) AND EXISTS(SELECT 1 FROM rescues WHERE id=? AND status='racing')").bind(JSON.stringify(worker),rescue.id,claim.slot_id,rescue.id,agent.id,processingAt,rescue.id).run();
 if(!saved.meta.changes){const current=await s.get(rescue.id);return {won:current?.winnerId===claim.slot_id,verification:report,rescueId:rescue.id,replayed:true};}
 await s.event(rescue.id,agent.name,report.passed?'passed':'rejected',`External repair checked: ${report.passedCount}/${report.total} tests passed.`);
 let won=false;
 if(report.passed) {
  const continued=runCase(module,input.code,{name:'Resume original task',args:rescue.challenge.continuation,expected:null});
  if(!continued.error) {
   const receipt=await sha256(JSON.stringify({rescueId:rescue.id,code:input.code,tests:rescue.challenge.tests,result:continued.actual}));
   won=await s.finish(rescue.id,{status:'resumed',winnerId:claim.slot_id,patch:input.code,result:continued.actual,receipt,completedAt:Date.now()});
   if(won){worker.status='winner';await s.worker(rescue.id,worker);await s.event(rescue.id,'VERIFIER','winner',`${agent.name} wins. Verified repair available to the calling agent.`);await s.event(rescue.id,'BUILDER','resumed',`Repaired continuation executed. Output: ${JSON.stringify(continued.actual).slice(0,300)}`);}
  }else {worker.status='rejected';worker.error=continued.error;await s.worker(rescue.id,worker);await s.event(rescue.id,agent.name,'error','Patch passed the supplied tests, but could not execute the continuation.');}
 }
 const all=await db.prepare('SELECT COUNT(*) AS count FROM worker_claims WHERE rescue_id=? AND submitted_at IS NOT NULL').bind(rescue.id).first<{count:number}>();
 const current=await s.get(rescue.id);
 if(all?.count===3&&current?.status==='racing'&&current.workers.every(w=>['rejected','error'].includes(w.status))) {await s.finish(rescue.id,{status:'failed',completedAt:Date.now(),error:'All three connected workers submitted repairs, but none passed verification and continuation.'});}
 const result={won,verification:report,rescueId:rescue.id};
 await db.prepare('UPDATE worker_claims SET result=? WHERE rescue_id=? AND agent_id=? AND submitted_at=?').bind(JSON.stringify(result),rescue.id,agent.id,processingAt).run();
 return result;
}
