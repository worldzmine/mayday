/** MAYDAY JavaScript client. No dependencies. Works in Node 22+ and browsers. */
export class MaydayClient {
 constructor({baseUrl='http://127.0.0.1:5173',apiToken,workerToken}={}) {this.baseUrl=baseUrl.replace(/\/$/,'');this.apiToken=apiToken;this.workerToken=workerToken;}
 async request(path,body,worker=false,signal) {
  const token=worker?this.workerToken:this.apiToken;
  const response=await fetch(this.baseUrl+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'content-type':'application/json'}),...(token?{authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal});
  const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error??`MAYDAY HTTP ${response.status}`),{status:response.status});return data;
 }
 async sendSOS(job,options={}) {return this.request('/api/rescues',job,false,options.signal);}
 async getRescue(id,options={}) {return (await this.request(`/api/rescues/${id}`,undefined,false,options.signal)).rescue;}
 async mayday(job,{timeoutMs=120000,onProgress,signal}={}) {
  const {id}=await this.sendSOS(job,{signal});const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){if(signal?.aborted)throw new Error('Rescue cancelled.');const rescue=await this.getRescue(id,{signal});onProgress?.(rescue);if(rescue.status==='resumed')return rescue;if(rescue.status==='failed')throw new Error(rescue.error??'No verified repair was found.');await new Promise(r=>setTimeout(r,600));}
  throw new Error(`Rescue ${id} has not finished. Inspect it with getRescue().`);
 }
 async verify(code,tests) {return this.request('/api/verify',{code,tests});}
 /** Check a function, request rescue on failure, then execute its continuation in MAYDAY's sandbox. */
 async run(challenge,{mode='network',onProgress,timeoutMs,signal,...options}={}) {
  const original=await this.verify(challenge.code,challenge.tests);
  if(original.passed)return {rescued:false,code:challenge.code,verification:original,result:await this.execute(challenge.code,challenge.continuation??challenge.tests[0].args)};
  const rescue=await this.mayday({mode,challenge,...options},{onProgress,timeoutMs,signal});
  return {rescued:true,rescueId:rescue.id,code:rescue.patch,verification:rescue.workers.find(w=>w.id===rescue.winnerId)?.report,result:rescue.result,receipt:rescue.receipt};
 }
 async execute(code,args) {return (await this.request('/api/execute',{code,args})).result;}
 async registerWorker(name) {const worker=await this.request('/api/workers/register',{name});this.workerToken=worker.token;return worker;}
 async jobs() {return (await this.request('/api/workers/jobs',undefined,true)).jobs;}
 async claim(rescueId) {return this.request('/api/workers/claim',{rescueId},true);}
 async submit(rescueId,code,{explanation,model}={}) {return this.request('/api/workers/submit',{rescueId,code,explanation,model},true);}
 async disconnectWorker() {if(this.workerToken)await this.request('/api/workers/disconnect',{},true);}
}
