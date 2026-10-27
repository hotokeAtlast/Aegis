ALTER TABLE `events` ADD COLUMN `plan_source` text DEFAULT 'template' NOT NULL;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `plan_version` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `venue_options_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `menu_json` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `tasks_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `risks_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `ai_notes_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `ai_model` text DEFAULT 'gemini-3.5-flash-lite' NOT NULL;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `generation_message` text;
--> statement-breakpoint
CREATE TABLE `app_settings` (
  `key` text PRIMARY KEY NOT NULL,
  `value` text NOT NULL,
  `updated_at` integer NOT NULL
);
