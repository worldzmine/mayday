CREATE TABLE `rescue_events` (
	`id` text PRIMARY KEY NOT NULL,
	`rescue_id` text NOT NULL,
	`at` integer NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rescue_events_rescue_id_at` ON `rescue_events` (`rescue_id`,`at`);--> statement-breakpoint
CREATE TABLE `rescue_workers` (
	`rescue_id` text NOT NULL,
	`worker_id` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rescue_workers_rescue_id` ON `rescue_workers` (`rescue_id`);--> statement-breakpoint
CREATE TABLE `rescues` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`mode` text NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rescues_created_at` ON `rescues` (`created_at`);