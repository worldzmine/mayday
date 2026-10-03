export async function networkActivity(db:D1Database){
 const [runs,agents,leaders,counts]=await Promise.all([
  db.prepare("SELECT r.payload AS rescue,w.payload AS worker FROM rescues r JOIN rescue_workers w ON w.rescue_id=r.id AND w.worker_id=json_extract(r.payload,'$.winnerId') WHERE r.status='resumed' ORDER BY r.created_at DESC LIMIT 16").all<{rescue:string;worker:string}>(),
  db.prepare('SELECT COUNT(*) AS count FROM agents WHERE last_seen>?').bind(Date.now()-15000).first<{count:number}>(),
  db.prepare("SELECT json_extract(w.payload,'$.agentId') AS id,json_extract(w.payload,'$.name') AS name,COUNT(*) AS rescues,SUM(json_extract(w.payload,'$.report.passedCount')) AS tests,AVG(r.completed_at-r.created_at) AS averageMs FROM rescues r JOIN rescue_workers w ON w.rescue_id=r.id AND w.worker_id=json_extract(r.payload,'$.winnerId') WHERE r.status='resumed' AND r.mode='network' AND json_extract(w.payload,'$.agentId') IS NOT NULL GROUP BY id,name ORDER BY rescues DESC,averageMs LIMIT 5").all(),
  db.prepare("SELECT SUM(CASE WHEN status='resumed' AND mode!='demo' THEN 1 ELSE 0 END) AS verified,SUM(CASE WHEN status='resumed' AND mode='demo' THEN 1 ELSE 0 END) AS rehearsals FROM rescues").first<{verified:number;rehearsals:number}>(),
 ]);
 return {activity:runs.results.map(row=>{const r=JSON.parse(row.rescue),w=JSON.parse(row.worker);return {id:r.id,title:r.title,caller:'builder-01',rescuer:w.name,tests:w.report?.passedCount??0,total:r.challenge.tests.length,mode:r.mode,elapsedMs:r.completedAt-r.createdAt,completedAt:r.completedAt,explanation:w.explanation??'Verified repair returned.'};}),leaderboard:leaders.results,agentsOnDuty:agents?.count??0,verifiedRescues:counts?.verified??0,rehearsals:counts?.rehearsals??0};
}
