import { writeFile, mkdir } from 'node:fs/promises';
import { MaydayClient } from '../sdk/mayday.mjs';
const client=new MaydayClient({baseUrl:process.env.MAYDAY_URL});
const network=process.argv.includes('--network');
const challenge=(await client.request('/api/challenges')).challenges[0];
console.log('BUILDER: building a checkout calculator…');
const original=await client.verify(challenge.code,challenge.tests);
console.log(`BUILDER: blocked. ${original.passedCount}/${original.total} tests passed.`);
if(!original.passed){console.log(`BUILDER: sending SOS (${network?'independent agent network':'scripted rehearsal'})…`);let last='';const rescue=await client.mayday({challengeId:'checkout',mode:network?'network':'demo'},{onProgress:r=>{const event=r.events.at(-1);if(event&&event.id!==last){last=event.id;console.log(`${event.actor}: ${event.message}`);}}});
 console.log('BUILDER: received a verified patch; applying it to my own task.');
 await mkdir('work/agent-output',{recursive:true});await writeFile('work/agent-output/checkout.js',rescue.patch+'\n');
 const total=await client.execute(rescue.patch,[[{price:10,quantity:3}],10]);
 if(total!==27)throw new Error('Fresh-input acceptance check failed.');
 await writeFile('work/agent-output/receipt.json',JSON.stringify({rescueId:rescue.id,total,patchFile:'checkout.js'},null,2));
 console.log(`BUILDER: resumed. Fresh checkout total = $${total.toFixed(2)}. Wrote checkout.js and receipt.json to work/agent-output.`);
 console.log(`Inspect the actual run: ${client.baseUrl}/?rescue=${rescue.id}`);
}
