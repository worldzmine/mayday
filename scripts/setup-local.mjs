import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
function run(args){const r=spawnSync(args[0],args.slice(1),{stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status??1);}
run(['npm','run','build']);
mkdirSync('.sites-runtime',{recursive:true});
const stampFile='.sites-runtime/local-migrations.json';
const applied=existsSync(stampFile)?JSON.parse(readFileSync(stampFile,'utf8')):{};
for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()){
 const hash=createHash('sha256').update(readFileSync(`drizzle/${file}`)).digest('hex');
 if(applied[file]){if(applied[file]!==hash)throw new Error(`Applied migration ${file} changed. Restore it or create a new migration.`);continue;}
 run([process.execPath,'--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--file',`drizzle/${file}`]);
 applied[file]=hash;writeFileSync(stampFile,JSON.stringify(applied,null,2));
}
console.log('\nMAYDAY is ready. Start the console with npm run dev.');
