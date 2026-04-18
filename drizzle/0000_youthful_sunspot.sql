CREATE TABLE `ai_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`system_prompt` text NOT NULL,
	`preferences` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ai_prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`name` text NOT NULL,
	`template` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`recipe_id` text,
	`profile_id` text,
	`prompt_id` text,
	`request_hash` text NOT NULL,
	`response_json` text NOT NULL,
	`tokens_in` integer DEFAULT 0 NOT NULL,
	`tokens_out` integer DEFAULT 0 NOT NULL,
	`neuron_count` integer DEFAULT 0 NOT NULL,
	`usd_cents` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`profile_id`) REFERENCES `ai_profiles`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`prompt_id`) REFERENCES `ai_prompts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ai_runs_user_id_idx` ON `ai_runs` (`user_id`);--> statement-breakpoint
CREATE TABLE `ai_usage_daily` (
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`neuron_count` integer DEFAULT 0 NOT NULL,
	`usd_cents` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `day`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `collection_recipes` (
	`collection_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`collection_id`, `recipe_id`),
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `cookbook_recipes` (
	`cookbook_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`cookbook_id`, `recipe_id`),
	FOREIGN KEY (`cookbook_id`) REFERENCES `cookbooks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `cookbooks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `cooking_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`recipe_id` text,
	`cooked_at` integer NOT NULL,
	`rating` integer,
	`notes` text,
	`modifications` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `cooking_log_user_id_idx` ON `cooking_log` (`user_id`);--> statement-breakpoint
CREATE INDEX `cooking_log_recipe_id_idx` ON `cooking_log` (`recipe_id`);--> statement-breakpoint
CREATE TABLE `cooking_log_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`log_id` text NOT NULL,
	`image_key` text NOT NULL,
	`caption` text,
	FOREIGN KEY (`log_id`) REFERENCES `cooking_log`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `import_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`source_type` text NOT NULL,
	`file_r2_key` text,
	`recipe_count_expected` integer,
	`recipe_count_imported` integer DEFAULT 0 NOT NULL,
	`error_log_json` text,
	`started_at` integer,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	`group_name` text,
	`quantity_raw` text,
	`quantity_decimal` real,
	`unit_raw` text,
	`unit_canonical` text,
	`name` text NOT NULL,
	`notes` text,
	`weight_g` real,
	`footnote_ref` text,
	`is_group_header` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ingredients_recipe_id_idx` ON `ingredients` (`recipe_id`);--> statement-breakpoint
CREATE TABLE `meal_plan_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`meal_slot` text,
	`recipe_id` text,
	`servings_override` real,
	`notes` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `pantry_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`quantity` real,
	`unit` text,
	`expires_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recipe_tags` (
	`recipe_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`recipe_id`, `tag_id`),
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recipe_tags_tag_id_idx` ON `recipe_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`source_url` text,
	`source_type` text NOT NULL,
	`prep_time_min` integer,
	`active_time_min` integer,
	`total_time_min` integer,
	`time_notes` text,
	`servings` real,
	`servings_unit` text,
	`difficulty` text,
	`directions_text` text DEFAULT '' NOT NULL,
	`notes` text,
	`image_key` text,
	`image_source_url` text,
	`image_attribution` text,
	`image_alt` text,
	`rating` integer,
	`parent_recipe_id` text,
	`variant_type` text,
	`variant_profile_id` text,
	`content_hash` text,
	`source_hash` text,
	`paprika_original_id` text,
	`imported_at` integer,
	`import_job_id` text,
	`visibility` text DEFAULT 'private' NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`variant_profile_id`) REFERENCES `ai_profiles`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`import_job_id`) REFERENCES `import_jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `recipes_user_id_idx` ON `recipes` (`user_id`);--> statement-breakpoint
CREATE INDEX `recipes_slug_idx` ON `recipes` (`user_id`,`slug`);--> statement-breakpoint
CREATE INDEX `recipes_content_hash_idx` ON `recipes` (`content_hash`);--> statement-breakpoint
CREATE INDEX `recipes_paprika_id_idx` ON `recipes` (`paprika_original_id`);--> statement-breakpoint
CREATE INDEX `recipes_deleted_at_idx` ON `recipes` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `shares` (
	`id` text PRIMARY KEY NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`shared_by_user_id` text NOT NULL,
	`shared_with_user_id` text,
	`signed_token` text,
	`expires_at` integer,
	FOREIGN KEY (`shared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`shared_with_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `shopping_list_items` (
	`id` text PRIMARY KEY NOT NULL,
	`shopping_list_id` text NOT NULL,
	`recipe_id` text,
	`ingredient_id` text,
	`manual_text` text,
	`quantity` text,
	`unit` text,
	`aisle` text,
	`checked_at` integer,
	FOREIGN KEY (`shopping_list_id`) REFERENCES `shopping_lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `shopping_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_user_name_idx` ON `tags` (`user_id`,`name`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);