CREATE TABLE `alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`audit_id` text,
	`severity` text NOT NULL,
	`message` text NOT NULL,
	`acknowledged` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`audit_id` text NOT NULL,
	`url` text NOT NULL,
	`page_type` text NOT NULL,
	`device` text NOT NULL,
	`load_ok` integer DEFAULT true NOT NULL,
	`load_error` text,
	`http_status` integer,
	`screenshot_path` text,
	`lighthouse_json_path` text,
	`axe_json_path` text,
	`pa11y_json_path` text,
	`metrics` text,
	`headers` text,
	`tls` text,
	`crux` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audits` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`permission_confirmation_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`config` text NOT NULL,
	`lighthouse_version` text,
	`axe_core_version` text,
	`pa11y_version` text,
	`overall_score` real,
	`performance_score` real,
	`seo_score` real,
	`accessibility_score` real,
	`security_score` real,
	`started_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
CREATE TABLE `findings` (
	`id` text PRIMARY KEY NOT NULL,
	`audit_id` text NOT NULL,
	`group_key` text NOT NULL,
	`category` text NOT NULL,
	`engine` text NOT NULL,
	`title` text NOT NULL,
	`explanation` text NOT NULL,
	`business_impact` text NOT NULL,
	`severity` text NOT NULL,
	`effort` text NOT NULL,
	`impact` text NOT NULL,
	`wcag_criteria` text DEFAULT '[]',
	`evidence` text NOT NULL,
	`fix_suggestion` text NOT NULL,
	`affected_page_ids` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`note` text,
	`ai_rewritten` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `permission_confirmations` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`confirmed_by` text NOT NULL,
	`statement` text NOT NULL,
	`confirmed_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`tags` text DEFAULT '[]',
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`frequency` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`alert_on_score_drop_points` real DEFAULT 5 NOT NULL,
	`alert_on_cert_expiry_days` integer DEFAULT 14 NOT NULL,
	`next_run_at` text NOT NULL,
	`last_run_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sites` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`base_url` text NOT NULL,
	`label` text NOT NULL,
	`is_competitor` integer DEFAULT false NOT NULL,
	`competitor_of_site_id` text,
	`is_local_business` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
