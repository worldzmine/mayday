CREATE TABLE `rescue_notifications` (
	`rescue_id` text PRIMARY KEY NOT NULL,
	`ciphertext` text NOT NULL,
	`iv` text NOT NULL,
	`status` text NOT NULL
);
