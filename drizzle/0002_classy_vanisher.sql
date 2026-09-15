CREATE TABLE `api_rate_limits` (
	`subject_hash` text PRIMARY KEY NOT NULL,
	`window_started_at_ms` integer NOT NULL,
	`request_count` integer NOT NULL,
	`expires_at_ms` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_api_rate_limits_expiry` ON `api_rate_limits` (`expires_at_ms`);