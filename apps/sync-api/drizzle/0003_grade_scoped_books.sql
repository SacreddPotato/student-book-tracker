ALTER TABLE "books" ADD COLUMN "grade_level" text;
--> statement-breakpoint
UPDATE "books"
SET "grade_level" = CASE "education_stage"
  WHEN 'kg' THEN 'kg1'
  WHEN 'primary' THEN 'primary1'
  ELSE 'preparatory1'
END
WHERE "grade_level" IS NULL;
--> statement-breakpoint
ALTER TABLE "books" ALTER COLUMN "grade_level" SET NOT NULL;
--> statement-breakpoint
DROP INDEX "books_scope_stage_name_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "books_scope_grade_name_unique"
ON "books" USING btree ("scope_id", "grade_level", "name")
WHERE "books"."deleted_at" IS NULL;
