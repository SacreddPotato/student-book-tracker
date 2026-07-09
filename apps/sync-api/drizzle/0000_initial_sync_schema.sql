CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value_json" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "books" (
	"id" text PRIMARY KEY NOT NULL,
	"scope_id" text DEFAULT 'global' NOT NULL,
	"name" text NOT NULL,
	"education_stage" text NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text
);
--> statement-breakpoint
CREATE TABLE "inventory_transaction_items" (
	"id" text PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
	"book_id" text NOT NULL,
	"quantity_delta" integer NOT NULL,
	"quantity_after" integer NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"scope_id" text DEFAULT 'global' NOT NULL,
	"type" text NOT NULL,
	"student_id" text,
	"reversed_transaction_id" text,
	"reversed_by_transaction_id" text,
	"device_id" text,
	"command_id" text NOT NULL,
	"occurred_at" text NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "inventory_transactions_command_id_unique" UNIQUE("command_id")
);
--> statement-breakpoint
CREATE TABLE "student_books" (
	"id" text PRIMARY KEY NOT NULL,
	"scope_id" text DEFAULT 'global' NOT NULL,
	"student_id" text NOT NULL,
	"book_id" text NOT NULL,
	"issued_transaction_id" text NOT NULL,
	"created_at" text NOT NULL,
	"reversed_at" text,
	CONSTRAINT "student_books_scope_student_book_transaction_unique" UNIQUE("scope_id","student_id","book_id","issued_transaction_id")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" text PRIMARY KEY NOT NULL,
	"scope_id" text DEFAULT 'global' NOT NULL,
	"name" text NOT NULL,
	"government_id" text NOT NULL,
	"education_stage" text NOT NULL,
	"grade_level" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"deleted_at" text
);
--> statement-breakpoint
CREATE TABLE "sync_changes" (
	"sequence" bigserial PRIMARY KEY NOT NULL,
	"scope_id" text DEFAULT 'global' NOT NULL,
	"command_id" text NOT NULL,
	"entity_table" text NOT NULL,
	"entity_id" text NOT NULL,
	"payload_json" text NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "sync_changes_scope_command_entity_unique" UNIQUE("scope_id","command_id","entity_table","entity_id")
);
--> statement-breakpoint
CREATE TABLE "sync_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"command_type" text NOT NULL,
	"payload_json" text NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"id" text PRIMARY KEY NOT NULL,
	"pull_cursor" text,
	"last_synced_at" text,
	"last_error" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "books_scope_stage_name_unique" ON "books" USING btree ("scope_id","education_stage","name") WHERE "books"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "students_scope_government_id_unique" ON "students" USING btree ("scope_id","government_id") WHERE "students"."deleted_at" IS NULL;