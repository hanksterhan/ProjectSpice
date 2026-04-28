CREATE INDEX `shares_resource_idx` ON `shares` (`resource_type`,`resource_id`);--> statement-breakpoint
CREATE INDEX `shares_shared_with_idx` ON `shares` (`shared_with_user_id`);
