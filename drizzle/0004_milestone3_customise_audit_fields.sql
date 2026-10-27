ALTER TABLE `events` ADD COLUMN `selected_venue_name` text;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `venue_confirmed` integer NOT NULL DEFAULT 0;
