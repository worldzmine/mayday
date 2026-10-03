import type { MaydayEnv } from './engine.ts';
import type { Rescue } from './types.ts';
import { store } from './store.ts';
export function validateDiscordWebhook(value:unknown):string {
 if(typeof value!=='string'||value.length>250)throw Object.assign(new Error('Provide a valid Discord webhook URL.'),{status:400});
 let url:URL;try{url=new URL(value);}catch{throw Object.assign(new Error('Provide a valid Discord webhook URL.'),{status:400});}
 if(url.protocol!=='https:'||url.hostname!=='discord.com'||url.port||url.username||url.password||url.search||url.hash||!/^\/api\/webhooks\/\d{15,25}\/[\w-]{20,150}$/.test(url.pathname))throw Object.assign(new Error('Use an HTTPS discord.com/api/webhooks/... URL without extra parameters.'),{status:400});
 return url.href;
}
async function encryptionKey(secret:string){if(!/^[a-f0-9]{64}$/.test(secret))throw new Error('Notification encryption is not configured.');return crypto.subtle.importKey('raw',Uint8Array.from(secret.match(/../g)!,x=>parseInt(x,16)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
const hex=(bytes:Uint8Array)=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
const unhex=(s:string)=>Uint8Array.from(s.match(/../g)??[],x=>parseInt(x,16));
export async function encryptWebhook(webhook:string,secret:string,rescueId:string){const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(rescueId)},await encryptionKey(secret),new TextEncoder().encode(webhook));return {ciphertext:hex(new Uint8Array(encrypted)),iv:hex(iv)};}
export async function saveNotification(env:MaydayEnv,rescueId:string,webhook:string){const encrypted=await encryptWebhook(webhook,env.MAYDAY_NOTIFICATION_KEY!,rescueId);await env.DB.prepare("INSERT INTO rescue_notifications(rescue_id,ciphertext,iv,status) VALUES(?,?,?,'pending')").bind(rescueId,encrypted.ciphertext,encrypted.iv).run();}
export function discordReceipt(rescue:Rescue,origin:string){const winner=rescue.workers.find(w=>w.id===rescue.winnerId);return {content:`🚨 MAYDAY → RESCUED\nYour agent was rescued by **${winner?.name??'a rescue agent'}**.\n${rescue.title}\n✅ ${winner?.report?.passedCount??0}/${rescue.challenge.tests.length} acceptance tests passed. The task continued in the sandbox.\n${winner?.explanation?.slice(0,400)??'Verified repair delivered.'}\nRescue receipt: ${origin}/?rescue=${rescue.id}`.slice(0,1800),allowed_mentions:{parse:[]}};}
export async function notifyRescued(env:MaydayEnv,rescueId:string,origin:string){
 if(!env.MAYDAY_NOTIFICATION_KEY)return;
 const row=await env.DB.prepare("SELECT ciphertext,iv FROM rescue_notifications WHERE rescue_id=? AND status='pending'").bind(rescueId).first<{ciphertext:string;iv:string}>();if(!row)return;
 const reserved=await env.DB.prepare("UPDATE rescue_notifications SET status='delivering' WHERE rescue_id=? AND status='pending'").bind(rescueId).run();if(!reserved.meta.changes)return;
 try{const rescue=await store(env.DB).get(rescueId);if(rescue?.status!=='resumed')throw new Error('Rescue is not complete.');const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unhex(row.iv),additionalData:new TextEncoder().encode(rescueId)},await encryptionKey(env.MAYDAY_NOTIFICATION_KEY),unhex(row.ciphertext));const url=new URL(validateDiscordWebhook(new TextDecoder().decode(plain)));url.searchParams.set('wait','true');const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(discordReceipt(rescue,origin)),redirect:'error',signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error('Discord delivery failed.');await response.body?.cancel();await env.DB.prepare("UPDATE rescue_notifications SET status='sent',ciphertext='',iv='' WHERE rescue_id=?").bind(rescueId).run();}
 catch{await env.DB.prepare("UPDATE rescue_notifications SET status='failed',ciphertext='',iv='' WHERE rescue_id=?").bind(rescueId).run();await store(env.DB).event(rescueId,'DISPATCH','notification','The rescue succeeded, but the Discord update could not be delivered.');}
}
