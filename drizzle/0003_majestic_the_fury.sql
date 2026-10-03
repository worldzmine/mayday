CREATE TABLE `request_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `worker_claims` ADD `submission_hash` text;--> statement-breakpoint
ALTER TABLE `worker_claims` ADD `result` text;