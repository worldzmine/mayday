CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`last_seen` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_agents_token_hash` ON `agents` (`token_hash`);--> statement-breakpoint
CREATE TABLE `worker_claims` (
	`rescue_id` text NOT NULL,
	`slot_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`lease_expires_at` integer NOT NULL,
	`submitted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_worker_claims_rescue_slot` ON `worker_claims` (`rescue_id`,`slot_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_worker_claims_rescue_agent` ON `worker_claims` (`rescue_id`,`agent_id`);