import { sha256 } from './engine.ts';
export async function limitWrites(request:Request,db:D1Database,path:string){
 const quotas:Record<string,number>={'/api/workers/register':10,'/api/workers/claim':30,'/api/workers/submit':30,'/api/rescues':12,'/api/verify':60,'/api/execute':60};
 if(request.method!=='POST'||!quotas[path])return;
 const now=Date.now(),window=Math.floor(now/60000);
 const identity=request.headers.get('cf-connecting-ip')??'anonymous';
 const key=await sha256(`${identity}:${path}:${window}`);
 const row=await db.prepare('INSERT INTO request_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,now+120000).first<{count:number}>();
 if((row?.count??0)>quotas[path])throw Object.assign(new Error('Too many requests. Please wait a minute and try again.'),{status:429});
 await db.prepare('DELETE FROM request_limits WHERE expires_at<?').bind(now).run();
}
