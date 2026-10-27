CREATE TABLE `plan_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`version_number` integer NOT NULL,
	`source` text NOT NULL DEFAULT 'template',
	`label` text NOT NULL DEFAULT '',
	`total_inr` integer NOT NULL DEFAULT 0,
	`per_guest_inr` integer NOT NULL DEFAULT 0,
	`health_score` integer NOT NULL DEFAULT 0,
	`snapshot_json` text NOT NULL DEFAULT '{}',
	`created_at` integer NOT NULL
);
