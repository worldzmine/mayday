import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptWebhook,validateDiscordWebhook,discordReceipt } from '../lib/mayday/notifications.ts';
const webhook='https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz123456789';
test('Discord destinations cannot redirect credentials to arbitrary hosts',()=>{
 assert.equal(validateDiscordWebhook(webhook),webhook);
 for(const invalid of [webhook.replace('https:','http:'),webhook.replace('discord.com','discord.com.evil.test'),webhook+'?wait=true',webhook+'#secret',webhook.replace('discord.com','user:pass@discord.com'),'https://discord.com/api/users/123'])assert.throws(()=>validateDiscordWebhook(invalid));
});
test('webhooks are encrypted with fresh IVs and bound to their rescue',async()=>{
 const secret='a'.repeat(64),a=await encryptWebhook(webhook,secret,'rescue-a'),b=await encryptWebhook(webhook,secret,'rescue-a');
 assert.notEqual(a.ciphertext,b.ciphertext);assert(!JSON.stringify(a).includes('discord'));
 const key=await crypto.subtle.importKey('raw',new Uint8Array(32).fill(170),{name:'AES-GCM'},false,['decrypt']);
 const unhex=(s:string)=>Uint8Array.from(s.match(/../g)!,x=>parseInt(x,16));
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unhex(a.iv),additionalData:new TextEncoder().encode('rescue-a')},key,unhex(a.ciphertext));
 assert.equal(new TextDecoder().decode(plain),webhook);
 await assert.rejects(()=>crypto.subtle.decrypt({name:'AES-GCM',iv:unhex(a.iv),additionalData:new TextEncoder().encode('rescue-b')},key,unhex(a.ciphertext)));
});
test('rescue notifications contain proof and disable all mentions',()=>{
 const receipt=discordReceipt({id:'abc',title:'@everyone fix addition',winnerId:'trace',workers:[{id:'trace',name:'Codex',report:{passedCount:2},explanation:'Fixed the operator'}],challenge:{tests:[{},{}]}} as any,'https://mayday.test');
 assert.deepEqual(receipt.allowed_mentions,{parse:[]});assert.match(receipt.content,/Codex/);assert.match(receipt.content,/2\/2/);assert.match(receipt.content,/https:\/\/mayday.test\/\?rescue=abc/);assert(!receipt.content.includes('webhooks'));
});
