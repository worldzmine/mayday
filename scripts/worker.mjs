import { MaydayClient } from '../sdk/mayday.mjs';
import { propose } from '../lib/mayday/providers.ts';
import { CHALLENGES } from '../lib/mayday/challenges.ts';
const index=Number(process.argv[2]??0), rehearsal=process.argv.includes('--rehearsal');
const name=['PATCH','TRACE','FORGE'][index]??`worker-${index}`;
const client=new MaydayClient({baseUrl:process.env.MAYDAY_URL,workerToken:process.env.MAYDAY_WORKER_TOKEN});
const provider=process.env.OPENROUTER_API_KEY?'openrouter':'anthropic';
const key=process.env.OPENROUTER_API_KEY||process.env.ANTHROPIC_API_KEY;
const configured=process.env.MAYDAY_MODELS?.split(',').map(x=>x.trim()).filter(Boolean);
const models=configured?.length?configured:(provider==='openrouter'?['anthropic/claude-sonnet-4.5','openai/gpt-5-mini','google/gemini-2.5-flash']:['claude-sonnet-4-5-20250929']);
if(!rehearsal&&!key){console.error('Set OPENROUTER_API_KEY or ANTHROPIC_API_KEY in .env to run live repair agents. Use npm run workers:rehearsal for the scripted transport demo.');process.exit(1);}
if(!client.workerToken)await client.registerWorker(name);
console.log(`${name} connected to ${client.baseUrl} (${rehearsal?'SCRIPTED TRANSPORT REHEARSAL':'LIVE AI AGENT'}). Waiting for SOS jobs.`);
let stopped=false;process.on('SIGINT',()=>{stopped=true;});process.on('SIGTERM',()=>{stopped=true;});
while(!stopped){
 try{
  const jobs=await client.jobs();
  for(const job of jobs){if(stopped)break;let claimed;try{claimed=await client.claim(job.id);}catch(e){if(e.status===409)continue;throw e;}
   console.log(`${name} claimed ${job.id.slice(0,8)}: ${job.title}`);
   let patch;
   if(rehearsal){const fixture=CHALLENGES.find(c=>c.id===claimed.challenge.id);if(!fixture){console.log('Rehearsal workers only repair the three supplied fixtures.');continue;}await new Promise(r=>setTimeout(r,[1700,4300,6300][index]));patch={code:fixture.demoPatches[index],explanation:fixture.demoNotes[index],model:'scripted external rehearsal'};}
   else patch=await propose(claimed.challenge,index,{provider,apiKey:key,models});
   try{const result=await client.submit(job.id,patch.code,{explanation:patch.explanation,model:patch.model});console.log(`${name}: ${result.verification.passedCount}/${result.verification.total} tests passed${result.won?' — WINNER':''}`);}catch(e){if(e.status!==409)throw e;console.log(`${name}: rescue already closed; another worker won.`);}
  }
 }catch(e){console.error(`${name}: ${e.message}`);}
 if(!stopped)await new Promise(r=>setTimeout(r,1000));
}
await client.disconnectWorker().catch(()=>{});
