import { integer, sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const rescues = sqliteTable('rescues', {
 id: text('id').primaryKey(),
 title: text('title').notNull(),
 status: text('status').notNull(),
 mode: text('mode').notNull(),
 createdAt: integer('created_at').notNull(),
 completedAt: integer('completed_at'),
 payload: text('payload').notNull(),
}, table => [index('idx_rescues_created_at').on(table.createdAt)]);
export const rescueWorkers = sqliteTable('rescue_workers', {
 rescueId: text('rescue_id').notNull(),
 workerId: text('worker_id').notNull(),
 payload: text('payload').notNull(),
}, table => [index('idx_rescue_workers_rescue_id').on(table.rescueId)]);
export const rescueEvents = sqliteTable('rescue_events', {
 id: text('id').primaryKey(),
 rescueId: text('rescue_id').notNull(),
 at: integer('at').notNull(),
 payload: text('payload').notNull(),
}, table => [index('idx_rescue_events_rescue_id_at').on(table.rescueId, table.at)]);
export const agents = sqliteTable('agents', {
 id: text('id').primaryKey(), name: text('name').notNull(), tokenHash:text('token_hash').notNull(), lastSeen:integer('last_seen').notNull(),
}, table=>[index('idx_agents_token_hash').on(table.tokenHash)]);
export const claims = sqliteTable('worker_claims', {
 rescueId:text('rescue_id').notNull(), slotId:text('slot_id').notNull(), agentId:text('agent_id').notNull(), leaseExpiresAt:integer('lease_expires_at').notNull(), submittedAt:integer('submitted_at'), submissionHash:text('submission_hash'), result:text('result'),
}, table=>[uniqueIndex('idx_worker_claims_rescue_slot').on(table.rescueId,table.slotId),uniqueIndex('idx_worker_claims_rescue_agent').on(table.rescueId,table.agentId)]);
export const notifications=sqliteTable('rescue_notifications',{
 rescueId:text('rescue_id').primaryKey(),ciphertext:text('ciphertext').notNull(),iv:text('iv').notNull(),status:text('status').notNull(),
});
export const limits=sqliteTable('request_limits',{key:text('key').primaryKey(),count:integer('count').notNull(),expiresAt:integer('expires_at').notNull()});
