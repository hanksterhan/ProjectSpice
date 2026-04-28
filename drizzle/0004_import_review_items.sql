CREATE TABLE `import_review_items` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`user_id` text NOT NULL,
	`recipe_id` text,
	`source_type` text NOT NULL,
	`source_uid` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`confidence_score` integer DEFAULT 0 NOT NULL,
	`confidence_level` text DEFAULT 'low' NOT NULL,
	`parsed_field_summary` text,
	`original_payload_json` text,
	`edited_payload_json` text,
	`decision_reason` text,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `import_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `import_review_items_job_idx` ON `import_review_items` (`job_id`);--> statement-breakpoint
CREATE INDEX `import_review_items_user_status_idx` ON `import_review_items` (`user_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `import_review_items_job_source_uid_idx` ON `import_review_items` (`job_id`,`source_uid`);
