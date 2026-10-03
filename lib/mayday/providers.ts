import type { Challenge, LiveConfig } from './types.ts';
import { WORKERS } from './types.ts';
export async function propose(challenge:Challenge, workerIndex:number, config:LiveConfig, feedback?:string) {
 const strategy = WORKERS[workerIndex];
 const system=`You are ${strategy.name}, a JavaScript repair worker. ${strategy.instruction} Return ONLY a JSON object with "code" (one complete synchronous JavaScript function, no imports or exports) and "explanation" (one concise sentence). Your code will execute in an isolated QuickJS runtime with no host APIs. Use only JSON input/output. Fix the behavior described by the goal, including cases not shown. Never hardcode test inputs or expected outputs.`;
 const task=JSON.stringify({goal:challenge.goal,brokenCode:challenge.code,error:challenge.error,tests:challenge.tests,...(feedback?{previousAttemptFailed:feedback}:{})});
 const model=config.models?.[workerIndex]??config.models?.[0];
 const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),20000);
 try {
  const isAnthropic=config.provider==='anthropic';
  const response=await fetch(isAnthropic?'https://api.anthropic.com/v1/messages':'https://openrouter.ai/api/v1/chat/completions',{
   method:'POST',signal:controller.signal,
   headers:isAnthropic?{'content-type':'application/json','x-api-key':config.apiKey!,'anthropic-version':'2023-06-01'}:{'content-type':'application/json',authorization:`Bearer ${config.apiKey}`,'X-Title':'MAYDAY Agent Rescue'},
   body:JSON.stringify(isAnthropic?{model,max_tokens:2200,system,messages:[{role:'user',content:task}]}:{model,max_tokens:2200,messages:[{role:'system',content:system},{role:'user',content:task}]})
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Model provider returned HTTP ${response.status}. Check the key, model name, or account balance.`); }
  const text=await response.text(); if(text.length>100000) throw new Error('The model response exceeded the size limit.');
  const data=JSON.parse(text);
  let content=isAnthropic?data.content?.filter((x:{type:string})=>x.type==='text').map((x:{text:string})=>x.text).join('\n'):data.choices?.[0]?.message?.content;
  if (typeof content!=='string') throw new Error('The model returned no repair text.');
  content=content.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
  let patch; try {patch=JSON.parse(content);} catch { const begin=content.indexOf('{'),end=content.lastIndexOf('}'); if(begin<0||end<=begin) throw new Error('The worker did not return a JSON patch.'); patch=JSON.parse(content.slice(begin,end+1)); }
  if(typeof patch.code!=='string'||patch.code.length>16384) throw new Error('The worker returned an invalid or oversized patch.');
  return {code:patch.code,explanation:typeof patch.explanation==='string'?patch.explanation.slice(0,600):'Submitted a repair for verification.',model};
 } finally {clearTimeout(timer);}
}
