TRUNCATE TABLE "inventory_transaction_items", "student_books", "inventory_transactions",
  "students", "books", "sync_outbox", "sync_state", "app_settings", "sync_changes"
  RESTART IDENTITY;
--> statement-breakpoint
CREATE TABLE "academic_years" (
	"academic_year" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"created_at" text NOT NULL,
	"archived_at" text,
	CONSTRAINT "academic_years_status_check" CHECK ("academic_years"."status" IN ('current', 'archived'))
);
--> statement-breakpoint
ALTER TABLE "student_books" DROP CONSTRAINT "student_books_scope_student_book_transaction_unique";--> statement-breakpoint
DROP INDEX "students_scope_government_id_unique";--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "first_semester_quantity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "second_semester_quantity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" ADD COLUMN "semester" text NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD COLUMN "academic_year" text NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD COLUMN "receipt_number" text;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD COLUMN "receipt_date" text;--> statement-breakpoint
ALTER TABLE "student_books" ADD COLUMN "academic_year" text NOT NULL;--> statement-breakpoint
ALTER TABLE "student_books" ADD COLUMN "semester" text NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "academic_year" text NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "previous_student_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "academic_years_single_current_unique" ON "academic_years" USING btree ("status") WHERE "academic_years"."status" = 'current';--> statement-breakpoint
CREATE UNIQUE INDEX "students_scope_year_government_id_unique" ON "students" USING btree ("scope_id","academic_year","government_id") WHERE "students"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "student_books" ADD CONSTRAINT "student_books_scope_year_student_book_semester_transaction_unique" UNIQUE("scope_id","academic_year","student_id","book_id","semester","issued_transaction_id");--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_first_semester_quantity_nonnegative" CHECK ("books"."first_semester_quantity" >= 0);--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_second_semester_quantity_nonnegative" CHECK ("books"."second_semester_quantity" >= 0);--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" ADD CONSTRAINT "inventory_transaction_items_semester_check" CHECK ("inventory_transaction_items"."semester" IN ('first', 'second'));--> statement-breakpoint
ALTER TABLE "inventory_transaction_items" ADD CONSTRAINT "inventory_transaction_items_quantity_after_nonnegative" CHECK ("inventory_transaction_items"."quantity_after" >= 0);--> statement-breakpoint
ALTER TABLE "student_books" ADD CONSTRAINT "student_books_semester_check" CHECK ("student_books"."semester" IN ('first', 'second'));
