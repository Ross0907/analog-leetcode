CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`problem_slug` text NOT NULL,
	`problem_version` integer NOT NULL,
	`status` text NOT NULL,
	`solution_json` text NOT NULL,
	`score` integer NOT NULL,
	`runtime_ms` integer NOT NULL,
	`grader_version` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_submissions_user_idempotency` ON `submissions` (`user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_submissions_user_created` ON `submissions` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_submissions_problem_score` ON `submissions` (`problem_slug`,`score`);--> statement-breakpoint
CREATE TABLE `user_problem_progress` (
	`user_id` text NOT NULL,
	`problem_slug` text NOT NULL,
	`best_score` integer DEFAULT 0 NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`solved_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `problem_slug`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_progress_problem_score` ON `user_problem_progress` (`problem_slug`,`best_score`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
PRAGMA optimize;
