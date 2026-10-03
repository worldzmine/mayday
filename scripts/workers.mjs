import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const rehearsal=process.argv.includes('--rehearsal');
const path=fileURLToPath(new URL('./worker.mjs',import.meta.url));
const children=[0,1,2].map(i=>spawn(process.execPath,['--experimental-strip-types','--env-file-if-exists=.env',path,String(i),...(rehearsal?['--rehearsal']:[])],{stdio:'inherit'}));
let stopping=false;function stop(){if(stopping)return;stopping=true;children.forEach(c=>c.kill('SIGTERM'));}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
const codes=await Promise.all(children.map(c=>new Promise(r=>c.on('exit',code=>r(code??0)))));process.exitCode=codes.some(x=>x!==0)?1:0;
