import type { Rescue, RescueEvent, RescueWorker, RescueSummary } from './types.ts';
export function store(db: D1Database) {
 return {
  async create(rescue: Rescue) {
   const {workers, events, ...payload} = rescue;
   const results = await db.batch([
    db.prepare('INSERT INTO rescues(id,title,status,mode,created_at,payload) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM rescues WHERE status=\'racing\' AND created_at>?)<4').bind(rescue.id,rescue.title,rescue.status,rescue.mode,rescue.createdAt,JSON.stringify(payload),Date.now()-120000),
    ...workers.map(w=>db.prepare('INSERT INTO rescue_workers(rescue_id,worker_id,payload) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM rescues WHERE id=?)').bind(rescue.id,w.id,JSON.stringify(w),rescue.id)),
    ...events.map(e=>db.prepare('INSERT INTO rescue_events(id,rescue_id,at,payload) VALUES(?,?,?,?)').bind(e.id,rescue.id,e.at,JSON.stringify(e)))
   ]);
   if (!results[0].meta.changes) throw Object.assign(new Error("Four rescues are already active. Wait for one to finish."), {status:429});
  },
  async event(id: string, actor: string, kind: string, message: string) {
   const e: RescueEvent = {id:crypto.randomUUID(),at:Date.now(),actor,kind,message};
   await db.prepare('INSERT INTO rescue_events(id,rescue_id,at,payload) VALUES(?,?,?,?)').bind(e.id,id,e.at,JSON.stringify(e)).run();
   return e;
  },
  async worker(id:string, worker:RescueWorker) { await db.prepare('UPDATE rescue_workers SET payload=? WHERE rescue_id=? AND worker_id=?').bind(JSON.stringify(worker),id,worker.id).run(); },
  async finish(id:string, values: Partial<Rescue>) {
   const row = await db.prepare('SELECT payload FROM rescues WHERE id=?').bind(id).first<{payload:string}>();
   if (!row) throw new Error('Rescue not found');
   const payload = {...JSON.parse(row.payload),...values};
   const response = await db.prepare('UPDATE rescues SET status=?,completed_at=?,payload=? WHERE id=? AND status=?').bind(payload.status,payload.completedAt??Date.now(),JSON.stringify(payload),id,'racing').run();
   if(response.meta.changes&&payload.status==='failed')await db.prepare("UPDATE rescue_notifications SET status='cancelled',ciphertext='',iv='' WHERE rescue_id=? AND status='pending'").bind(id).run();
   return response.meta.changes > 0;
  },
  async get(id:string): Promise<Rescue | null> {
   const row = await db.prepare('SELECT payload FROM rescues WHERE id=?').bind(id).first<{payload:string}>();
   if (!row) return null;
   const [wr,ev] = await Promise.all([
    db.prepare('SELECT payload FROM rescue_workers WHERE rescue_id=? ORDER BY worker_id').bind(id).all<{payload:string}>(),
    db.prepare('SELECT payload FROM rescue_events WHERE rescue_id=? ORDER BY at,rowid').bind(id).all<{payload:string}>()
   ]);
   const rescue:Rescue = {...JSON.parse(row.payload),workers:wr.results.map(x=>JSON.parse(x.payload)),events:ev.results.map(x=>JSON.parse(x.payload))};
   rescue.workers.sort((a,b)=>['patch','trace','forge'].indexOf(a.id)-['patch','trace','forge'].indexOf(b.id));
   if (rescue.status === 'racing' && Date.now() - rescue.createdAt > 120000) {
    const changed = await this.finish(id,{status:'failed',completedAt:Date.now(),error:'The rescue worker was interrupted. Send a new MAYDAY to retry.'});
    if (!changed) return this.get(id);
    rescue.status='failed';rescue.error='The rescue worker was interrupted. Send a new MAYDAY to retry.';
   }
   if(rescue.mode==='network'&&rescue.status!=='racing') rescue.workers=rescue.workers.map(w=>['queued','working','testing'].includes(w.status)?{...w,status:'cancelled'}:w);
   return rescue;
  },
  async list():Promise<RescueSummary[]> {
   const {results} = await db.prepare('SELECT payload FROM rescues ORDER BY created_at DESC LIMIT 30').all<{payload:string}>();
   return results.map(x=>{const r=JSON.parse(x.payload);return {id:r.id,title:r.title,status:r.status,mode:r.mode,createdAt:r.createdAt,completedAt:r.completedAt,winnerId:r.winnerId,testsPassed:r.status==='resumed'?r.challenge.tests.length:0,testsTotal:r.challenge.tests.length}});
  },
  async activeCount() { const r=await db.prepare('SELECT COUNT(*) AS count FROM rescues WHERE status=? AND created_at>?').bind('racing',Date.now()-120000).first<{count:number}>(); return r?.count??0; }
 };
}
