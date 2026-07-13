CREATE TABLE "applied_sync_commands" (
	"command_id" text PRIMARY KEY NOT NULL,
	"payload_hash" text NOT NULL,
	"status" text NOT NULL,
	"reason_code" text,
	"message" text,
	"applied_at" text NOT NULL
);
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS sync_api;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS sync_private;
--> statement-breakpoint
TRUNCATE TABLE
  "inventory_transaction_items",
  "student_books",
  "inventory_transactions",
  "students",
  "books",
  "academic_years",
  "sync_outbox",
  "sync_state",
  "app_settings",
  "sync_changes",
  "applied_sync_commands"
RESTART IDENTITY;
--> statement-breakpoint
DO $role$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'student_book_sync_runtime'
  ) THEN
    CREATE ROLE student_book_sync_runtime NOLOGIN
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$role$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync_private.reject(
  p_reason_code text,
  p_message text
) RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = p_reason_code,
    DETAIL = p_message;
END
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync_private.valid_academic_year(p_year text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $function$
  SELECT p_year ~ '^[0-9]{4}-[0-9]{4}$'
    AND substring(p_year, 6, 4)::integer = substring(p_year, 1, 4)::integer + 1
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync_private.next_academic_year(p_year text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $function$
  SELECT
    (substring(p_year, 1, 4)::integer + 1)::text
    || '-'
    || (substring(p_year, 6, 4)::integer + 1)::text
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync_private.grade_allowed(
  p_stage text,
  p_grade text
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $function$
  SELECT CASE p_stage
    WHEN 'kg' THEN p_grade IN ('kg1', 'kg2')
    WHEN 'primary' THEN p_grade IN (
      'primary1', 'primary2', 'primary3',
      'primary4', 'primary5', 'primary6'
    )
    WHEN 'preparatory' THEN p_grade IN (
      'preparatory1', 'preparatory2', 'preparatory3'
    )
    ELSE false
  END
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync_private.promoted_stage(p_grade text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $function$
  SELECT CASE p_grade
    WHEN 'kg1' THEN 'kg'
    WHEN 'kg2' THEN 'primary'
    WHEN 'primary1' THEN 'primary'
    WHEN 'primary2' THEN 'primary'
    WHEN 'primary3' THEN 'primary'
    WHEN 'primary4' THEN 'primary'
    WHEN 'primary5' THEN 'primary'
    WHEN 'primary6' THEN 'preparatory'
    WHEN 'preparatory1' THEN 'preparatory'
    WHEN 'preparatory2' THEN 'preparatory'
    ELSE NULL
  END
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync_private.promoted_grade(p_grade text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $function$
  SELECT CASE p_grade
    WHEN 'kg1' THEN 'kg2'
    WHEN 'kg2' THEN 'primary1'
    WHEN 'primary1' THEN 'primary2'
    WHEN 'primary2' THEN 'primary3'
    WHEN 'primary3' THEN 'primary4'
    WHEN 'primary4' THEN 'primary5'
    WHEN 'primary5' THEN 'primary6'
    WHEN 'primary6' THEN 'preparatory1'
    WHEN 'preparatory1' THEN 'preparatory2'
    WHEN 'preparatory2' THEN 'preparatory3'
    ELSE NULL
  END
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync_private.academic_year_payload(p_row academic_years)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT jsonb_build_object(
    'academicYear', p_row.academic_year,
    'status', p_row.status,
    'createdAt', p_row.created_at,
    'archivedAt', p_row.archived_at
  )
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync_private.student_payload(p_row students)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT jsonb_build_object(
    'id', p_row.id,
    'scopeId', p_row.scope_id,
    'name', p_row.name,
    'governmentId', p_row.government_id,
    'educationStage', p_row.education_stage,
    'gradeLevel', p_row.grade_level,
    'academicYear', p_row.academic_year,
    'previousStudentId', p_row.previous_student_id,
    'createdAt', p_row.created_at,
    'updatedAt', p_row.updated_at,
    'deletedAt', p_row.deleted_at
  )
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync_private.book_payload(p_row books)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT jsonb_build_object(
    'id', p_row.id,
    'scopeId', p_row.scope_id,
    'name', p_row.name,
    'educationStage', p_row.education_stage,
    'gradeLevel', p_row.grade_level,
    'firstSemesterQuantity', p_row.first_semester_quantity,
    'secondSemesterQuantity', p_row.second_semester_quantity,
    'createdAt', p_row.created_at,
    'updatedAt', p_row.updated_at,
    'deletedAt', p_row.deleted_at
  )
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync_private.transaction_payload(
  p_row inventory_transactions
) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT jsonb_build_object(
    'id', p_row.id,
    'scopeId', p_row.scope_id,
    'academicYear', p_row.academic_year,
    'type', p_row.type,
    'studentId', p_row.student_id,
    'receiptNumber', p_row.receipt_number,
    'receiptDate', p_row.receipt_date,
    'reversedTransactionId', p_row.reversed_transaction_id,
    'reversedByTransactionId', p_row.reversed_by_transaction_id,
    'deviceId', p_row.device_id,
    'commandId', p_row.command_id,
    'occurredAt', p_row.occurred_at,
    'createdAt', p_row.created_at
  )
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync_private.item_payload(
  p_row inventory_transaction_items
) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT jsonb_build_object(
    'id', p_row.id,
    'transactionId', p_row.transaction_id,
    'bookId', p_row.book_id,
    'semester', p_row.semester,
    'quantityDelta', p_row.quantity_delta,
    'quantityAfter', p_row.quantity_after,
    'createdAt', p_row.created_at
  )
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync_private.student_book_payload(p_row student_books)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT jsonb_build_object(
    'id', p_row.id,
    'scopeId', p_row.scope_id,
    'academicYear', p_row.academic_year,
    'studentId', p_row.student_id,
    'bookId', p_row.book_id,
    'semester', p_row.semester,
    'issuedTransactionId', p_row.issued_transaction_id,
    'createdAt', p_row.created_at,
    'reversedAt', p_row.reversed_at
  )
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync_private.record_change(
  p_command_id text,
  p_entity_table text,
  p_entity_id text,
  p_payload jsonb,
  p_created_at text
) RETURNS void
LANGUAGE sql
SET search_path = pg_catalog, public
AS $function$
  INSERT INTO sync_changes (
    scope_id,
    command_id,
    entity_table,
    entity_id,
    payload_json,
    created_at
  ) VALUES (
    'global',
    p_command_id,
    p_entity_table,
    p_entity_id,
    p_payload::text,
    p_created_at
  )
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync_private.assert_current_academic_year(
  p_year text
) RETURNS academic_years
LANGUAGE plpgsql
SET search_path = pg_catalog, public, sync_private
AS $function$
DECLARE
  current_year academic_years%ROWTYPE;
BEGIN
  SELECT * INTO current_year
  FROM academic_years
  WHERE status = 'current'
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM sync_private.reject(
      'ACADEMIC_YEAR_NOT_INITIALIZED',
      'Academic year is not initialized.'
    );
  END IF;
  IF current_year.academic_year <> p_year THEN
    PERFORM sync_private.reject(
      'ACADEMIC_YEAR_ARCHIVED',
      'Academic year is not current: ' || p_year
    );
  END IF;
  RETURN current_year;
END
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync_private.apply_command(p_command jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, sync_private
AS $function$
DECLARE
  v_type text := p_command->>'type';
  v_command_id text := nullif(btrim(p_command->>'id'), '');
  v_device_id text := nullif(btrim(p_command->>'deviceId'), '');
  v_occurred_at text := nullif(btrim(p_command->>'occurredAt'), '');
  v_year text;
  v_book_id text;
  v_semester text;
  v_quantity integer;
  v_quantity_after integer;
  v_count integer;
  v_snapshot jsonb;
  v_selection jsonb;
  v_current academic_years%ROWTYPE;
  v_next academic_years%ROWTYPE;
  v_student students%ROWTYPE;
  v_book books%ROWTYPE;
  v_transaction inventory_transactions%ROWTYPE;
  v_original inventory_transactions%ROWTYPE;
  v_item inventory_transaction_items%ROWTYPE;
  v_student_book student_books%ROWTYPE;
  v_source_student students%ROWTYPE;
BEGIN
  IF jsonb_typeof(p_command) <> 'object'
    OR v_command_id IS NULL
    OR v_type IS NULL
    OR v_device_id IS NULL
    OR v_occurred_at IS NULL THEN
    PERFORM sync_private.reject(
      'VALIDATION_FAILED',
      'Command id, type, deviceId, and occurredAt are required.'
    );
  END IF;

  BEGIN
    PERFORM v_occurred_at::timestamptz;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    PERFORM sync_private.reject(
      'VALIDATION_FAILED',
      'occurredAt must be an ISO date-time.'
    );
  END;

  IF v_type = 'INITIALIZE_ACADEMIC_YEAR' THEN
    v_year := p_command->>'academicYear';
    IF NOT sync_private.valid_academic_year(v_year) THEN
      PERFORM sync_private.reject(
        'VALIDATION_FAILED',
        'Academic year must use consecutive YYYY-YYYY years.'
      );
    END IF;
    PERFORM 1 FROM academic_years WHERE status = 'current' FOR UPDATE;
    IF FOUND THEN
      PERFORM sync_private.reject(
        'ACADEMIC_YEAR_ALREADY_INITIALIZED',
        'Academic year is already initialized.'
      );
    END IF;

    INSERT INTO academic_years (
      academic_year, status, created_at, archived_at
    ) VALUES (
      v_year, 'current', v_occurred_at, NULL
    )
    RETURNING * INTO v_current;

    PERFORM sync_private.record_change(
      v_command_id,
      'academic_years',
      v_current.academic_year,
      sync_private.academic_year_payload(v_current),
      v_occurred_at
    );

  ELSIF v_type = 'ADVANCE_ACADEMIC_YEAR' THEN
    v_year := p_command->>'fromYear';
    v_current := sync_private.assert_current_academic_year(v_year);
    IF NOT sync_private.valid_academic_year(p_command->>'toYear')
      OR sync_private.next_academic_year(v_year) <> p_command->>'toYear' THEN
      PERFORM sync_private.reject(
        'ACADEMIC_YEAR_MISMATCH',
        'Academic year advancement is stale or not the exact successor.'
      );
    END IF;
    IF jsonb_typeof(p_command->'promotedStudents') <> 'array' THEN
      PERFORM sync_private.reject(
        'VALIDATION_FAILED',
        'promotedStudents must be an array.'
      );
    END IF;

    SELECT count(*) INTO v_count
    FROM students
    WHERE academic_year = v_year
      AND deleted_at IS NULL
      AND sync_private.promoted_grade(grade_level) IS NOT NULL;

    IF jsonb_array_length(p_command->'promotedStudents') <> v_count
      OR (
        SELECT count(DISTINCT snapshot->>'id')
        FROM jsonb_array_elements(p_command->'promotedStudents') snapshot
      ) <> v_count
      OR (
        SELECT count(DISTINCT snapshot->>'previousStudentId')
        FROM jsonb_array_elements(p_command->'promotedStudents') snapshot
      ) <> v_count THEN
      PERFORM sync_private.reject(
        'VALIDATION_FAILED',
        'Promoted student snapshots do not match the current year.'
      );
    END IF;

    FOR v_source_student IN
      SELECT * FROM students
      WHERE academic_year = v_year
        AND deleted_at IS NULL
        AND sync_private.promoted_grade(grade_level) IS NOT NULL
      ORDER BY id
    LOOP
      SELECT snapshot INTO v_snapshot
      FROM jsonb_array_elements(p_command->'promotedStudents') snapshot
      WHERE snapshot->>'previousStudentId' = v_source_student.id;

      IF NOT FOUND
        OR nullif(btrim(v_snapshot->>'id'), '') IS NULL
        OR v_snapshot->>'name' <> v_source_student.name
        OR v_snapshot->>'governmentId' <> v_source_student.government_id
        OR v_snapshot->>'educationStage'
          <> sync_private.promoted_stage(v_source_student.grade_level)
        OR v_snapshot->>'gradeLevel'
          <> sync_private.promoted_grade(v_source_student.grade_level)
        OR v_snapshot->>'academicYear' <> p_command->>'toYear' THEN
        PERFORM sync_private.reject(
          'VALIDATION_FAILED',
          'Invalid promotion snapshot for student: ' || v_source_student.id
        );
      END IF;
    END LOOP;

    UPDATE academic_years
    SET status = 'archived', archived_at = v_occurred_at
    WHERE academic_year = v_year AND status = 'current'
    RETURNING * INTO v_current;

    INSERT INTO academic_years (
      academic_year, status, created_at, archived_at
    ) VALUES (
      p_command->>'toYear', 'current', v_occurred_at, NULL
    )
    RETURNING * INTO v_next;

    PERFORM sync_private.record_change(
      v_command_id,
      'academic_years',
      v_current.academic_year,
      sync_private.academic_year_payload(v_current),
      v_occurred_at
    );
    PERFORM sync_private.record_change(
      v_command_id,
      'academic_years',
      v_next.academic_year,
      sync_private.academic_year_payload(v_next),
      v_occurred_at
    );

    FOR v_snapshot IN
      SELECT snapshot
      FROM jsonb_array_elements(p_command->'promotedStudents') snapshot
      ORDER BY snapshot->>'id'
    LOOP
      INSERT INTO students (
        id, scope_id, name, government_id, education_stage, grade_level,
        academic_year, previous_student_id, created_at, updated_at, deleted_at
      ) VALUES (
        v_snapshot->>'id',
        'global',
        v_snapshot->>'name',
        v_snapshot->>'governmentId',
        v_snapshot->>'educationStage',
        v_snapshot->>'gradeLevel',
        v_snapshot->>'academicYear',
        v_snapshot->>'previousStudentId',
        v_occurred_at,
        v_occurred_at,
        NULL
      )
      RETURNING * INTO v_student;

      PERFORM sync_private.record_change(
        v_command_id,
        'students',
        v_student.id,
        sync_private.student_payload(v_student),
        v_occurred_at
      );
    END LOOP;

  ELSIF v_type = 'UPSERT_STUDENT' THEN
    IF jsonb_typeof(p_command->'student') <> 'object' THEN
      PERFORM sync_private.reject('VALIDATION_FAILED', 'student is required.');
    END IF;
    v_year := p_command->'student'->>'academicYear';
    v_current := sync_private.assert_current_academic_year(v_year);
    IF nullif(btrim(p_command->'student'->>'id'), '') IS NULL
      OR nullif(btrim(p_command->'student'->>'name'), '') IS NULL
      OR nullif(btrim(p_command->'student'->>'governmentId'), '') IS NULL
      OR NOT sync_private.grade_allowed(
        p_command->'student'->>'educationStage',
        p_command->'student'->>'gradeLevel'
      ) THEN
      PERFORM sync_private.reject(
        'VALIDATION_FAILED',
        'Student fields and matching education stage/grade are required.'
      );
    END IF;
    IF EXISTS (
      SELECT 1 FROM students
      WHERE scope_id = 'global'
        AND academic_year = v_year
        AND government_id = p_command->'student'->>'governmentId'
        AND id <> p_command->'student'->>'id'
        AND deleted_at IS NULL
    ) THEN
      PERFORM sync_private.reject(
        'VALIDATION_FAILED',
        'Government ID is already enrolled in this academic year.'
      );
    END IF;

    INSERT INTO students (
      id, scope_id, name, government_id, education_stage, grade_level,
      academic_year, previous_student_id, created_at, updated_at, deleted_at
    ) VALUES (
      p_command->'student'->>'id',
      'global',
      btrim(p_command->'student'->>'name'),
      btrim(p_command->'student'->>'governmentId'),
      p_command->'student'->>'educationStage',
      p_command->'student'->>'gradeLevel',
      v_year,
      p_command->'student'->>'previousStudentId',
      v_occurred_at,
      v_occurred_at,
      NULL
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      government_id = EXCLUDED.government_id,
      education_stage = EXCLUDED.education_stage,
      grade_level = EXCLUDED.grade_level,
      academic_year = EXCLUDED.academic_year,
      previous_student_id = EXCLUDED.previous_student_id,
      updated_at = EXCLUDED.updated_at,
      deleted_at = NULL
    RETURNING * INTO v_student;

    PERFORM sync_private.record_change(
      v_command_id,
      'students',
      v_student.id,
      sync_private.student_payload(v_student),
      v_occurred_at
    );

  ELSIF v_type = 'UPSERT_BOOK' THEN
    IF jsonb_typeof(p_command->'book') <> 'object'
      OR nullif(btrim(p_command->'book'->>'id'), '') IS NULL
      OR nullif(btrim(p_command->'book'->>'name'), '') IS NULL
      OR NOT sync_private.grade_allowed(
        p_command->'book'->>'educationStage',
        p_command->'book'->>'gradeLevel'
      ) THEN
      PERFORM sync_private.reject(
        'VALIDATION_FAILED',
        'Book fields and matching education stage/grade are required.'
      );
    END IF;
    IF EXISTS (
      SELECT 1 FROM books
      WHERE scope_id = 'global'
        AND grade_level = p_command->'book'->>'gradeLevel'
        AND name = btrim(p_command->'book'->>'name')
        AND id <> p_command->'book'->>'id'
        AND deleted_at IS NULL
    ) THEN
      PERFORM sync_private.reject(
        'VALIDATION_FAILED',
        'Book name already exists for this grade.'
      );
    END IF;

    INSERT INTO books (
      id, scope_id, name, education_stage, grade_level,
      first_semester_quantity, second_semester_quantity,
      created_at, updated_at, deleted_at
    ) VALUES (
      p_command->'book'->>'id',
      'global',
      btrim(p_command->'book'->>'name'),
      p_command->'book'->>'educationStage',
      p_command->'book'->>'gradeLevel',
      0,
      0,
      v_occurred_at,
      v_occurred_at,
      NULL
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      education_stage = EXCLUDED.education_stage,
      grade_level = EXCLUDED.grade_level,
      updated_at = EXCLUDED.updated_at,
      deleted_at = NULL
    RETURNING * INTO v_book;

    PERFORM sync_private.record_change(
      v_command_id,
      'books',
      v_book.id,
      sync_private.book_payload(v_book),
      v_occurred_at
    );

  ELSIF v_type = 'DELETE_STUDENT' THEN
    v_year := p_command->>'academicYear';
    v_current := sync_private.assert_current_academic_year(v_year);
    SELECT * INTO v_student
    FROM students
    WHERE id = p_command->>'studentId' AND deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
      PERFORM sync_private.reject(
        'UNKNOWN_STUDENT',
        'Unknown student: ' || coalesce(p_command->>'studentId', '')
      );
    END IF;
    IF v_student.academic_year <> v_year THEN
      PERFORM sync_private.reject(
        'ACADEMIC_YEAR_MISMATCH',
        'Student is not enrolled in the current academic year.'
      );
    END IF;

    UPDATE students
    SET deleted_at = v_occurred_at, updated_at = v_occurred_at
    WHERE id = v_student.id
    RETURNING * INTO v_student;

    PERFORM sync_private.record_change(
      v_command_id,
      'students',
      v_student.id,
      sync_private.student_payload(v_student),
      v_occurred_at
    );

  ELSIF v_type = 'DELETE_BOOK' THEN
    SELECT * INTO v_book
    FROM books
    WHERE id = p_command->>'bookId' AND deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
      PERFORM sync_private.reject(
        'UNKNOWN_BOOK',
        'Unknown book: ' || coalesce(p_command->>'bookId', '')
      );
    END IF;

    UPDATE books
    SET deleted_at = v_occurred_at, updated_at = v_occurred_at
    WHERE id = v_book.id
    RETURNING * INTO v_book;

    PERFORM sync_private.record_change(
      v_command_id,
      'books',
      v_book.id,
      sync_private.book_payload(v_book),
      v_occurred_at
    );

  ELSIF v_type = 'ADD_BOOK_STOCK' THEN
    v_year := p_command->>'academicYear';
    v_current := sync_private.assert_current_academic_year(v_year);
    v_semester := p_command->>'semester';
    IF coalesce(p_command->>'quantity', '') !~ '^[1-9][0-9]*$'
      OR v_semester NOT IN ('first', 'second')
      OR nullif(btrim(p_command->>'receiptNumber'), '') IS NULL
      OR coalesce(p_command->>'receiptDate', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      PERFORM sync_private.reject(
        'VALIDATION_FAILED',
        'Positive quantity, semester, receipt number, and receipt date are required.'
      );
    END IF;
    BEGIN
      IF to_char((p_command->>'receiptDate')::date, 'YYYY-MM-DD')
        <> p_command->>'receiptDate' THEN
        PERFORM sync_private.reject('VALIDATION_FAILED', 'Receipt date is invalid.');
      END IF;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      PERFORM sync_private.reject('VALIDATION_FAILED', 'Receipt date is invalid.');
    END;
    v_quantity := (p_command->>'quantity')::integer;
    v_book_id := p_command->>'bookId';

    SELECT * INTO v_book
    FROM books
    WHERE id = v_book_id AND deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
      PERFORM sync_private.reject('UNKNOWN_BOOK', 'Unknown book: ' || coalesce(v_book_id, ''));
    END IF;

    IF v_semester = 'first' THEN
      v_quantity_after := v_book.first_semester_quantity + v_quantity;
      UPDATE books SET
        first_semester_quantity = v_quantity_after,
        updated_at = v_occurred_at
      WHERE id = v_book.id
      RETURNING * INTO v_book;
    ELSE
      v_quantity_after := v_book.second_semester_quantity + v_quantity;
      UPDATE books SET
        second_semester_quantity = v_quantity_after,
        updated_at = v_occurred_at
      WHERE id = v_book.id
      RETURNING * INTO v_book;
    END IF;

    INSERT INTO inventory_transactions (
      id, scope_id, academic_year, type, student_id, receipt_number,
      receipt_date, reversed_transaction_id, reversed_by_transaction_id,
      device_id, command_id, occurred_at, created_at
    ) VALUES (
      v_command_id, 'global', v_year, 'stock_increase', NULL,
      btrim(p_command->>'receiptNumber'), p_command->>'receiptDate',
      NULL, NULL, v_device_id, v_command_id, v_occurred_at, v_occurred_at
    )
    RETURNING * INTO v_transaction;

    INSERT INTO inventory_transaction_items (
      id, transaction_id, book_id, semester,
      quantity_delta, quantity_after, created_at
    ) VALUES (
      v_command_id || ':item:' || v_book.id || ':' || v_semester,
      v_transaction.id,
      v_book.id,
      v_semester,
      v_quantity,
      v_quantity_after,
      v_occurred_at
    )
    RETURNING * INTO v_item;

    PERFORM sync_private.record_change(
      v_command_id, 'books', v_book.id,
      sync_private.book_payload(v_book), v_occurred_at
    );
    PERFORM sync_private.record_change(
      v_command_id, 'inventory_transactions', v_transaction.id,
      sync_private.transaction_payload(v_transaction), v_occurred_at
    );
    PERFORM sync_private.record_change(
      v_command_id, 'inventory_transaction_items', v_item.id,
      sync_private.item_payload(v_item), v_occurred_at
    );

  ELSIF v_type = 'ISSUE_BOOKS_TO_STUDENT' THEN
    v_year := p_command->>'academicYear';
    v_current := sync_private.assert_current_academic_year(v_year);
    IF jsonb_typeof(p_command->'bookSelections') <> 'array'
      OR jsonb_array_length(p_command->'bookSelections') = 0 THEN
      PERFORM sync_private.reject(
        'VALIDATION_FAILED',
        'Issue commands require book selections.'
      );
    END IF;
    SELECT count(*), count(DISTINCT (
      (selection->>'bookId') || ':' || (selection->>'semester')
    )) INTO v_count, v_quantity
    FROM jsonb_array_elements(p_command->'bookSelections') selection;
    IF v_count <> v_quantity THEN
      PERFORM sync_private.reject(
        'VALIDATION_FAILED',
        'Issue commands require unique book semester selections.'
      );
    END IF;

    SELECT * INTO v_student
    FROM students
    WHERE id = p_command->>'studentId' AND deleted_at IS NULL;
    IF NOT FOUND THEN
      PERFORM sync_private.reject(
        'UNKNOWN_STUDENT',
        'Unknown student: ' || coalesce(p_command->>'studentId', '')
      );
    END IF;
    IF v_student.academic_year <> v_year THEN
      PERFORM sync_private.reject(
        'ACADEMIC_YEAR_MISMATCH',
        'Student is not enrolled in the current academic year.'
      );
    END IF;

    PERFORM 1
    FROM books
    WHERE id IN (
      SELECT selection->>'bookId'
      FROM jsonb_array_elements(p_command->'bookSelections') selection
    )
      AND deleted_at IS NULL
    ORDER BY id
    FOR UPDATE;

    SELECT count(*) INTO v_count
    FROM books
    WHERE id IN (
      SELECT selection->>'bookId'
      FROM jsonb_array_elements(p_command->'bookSelections') selection
    )
      AND deleted_at IS NULL;
    IF v_count <> (
      SELECT count(DISTINCT selection->>'bookId')
      FROM jsonb_array_elements(p_command->'bookSelections') selection
    ) THEN
      PERFORM sync_private.reject('UNKNOWN_BOOK', 'A selected book does not exist.');
    END IF;

    FOR v_selection IN
      SELECT selection
      FROM jsonb_array_elements(p_command->'bookSelections') selection
      ORDER BY selection->>'bookId', selection->>'semester'
    LOOP
      v_semester := v_selection->>'semester';
      IF v_semester NOT IN ('first', 'second') THEN
        PERFORM sync_private.reject('VALIDATION_FAILED', 'Invalid book semester.');
      END IF;
      SELECT * INTO v_book FROM books WHERE id = v_selection->>'bookId';
      IF v_book.education_stage <> v_student.education_stage
        OR v_book.grade_level <> v_student.grade_level THEN
        PERFORM sync_private.reject(
          'VALIDATION_FAILED',
          'Books must match the student education stage and grade.'
        );
      END IF;
      IF (v_semester = 'first' AND v_book.first_semester_quantity <= 0)
        OR (v_semester = 'second' AND v_book.second_semester_quantity <= 0) THEN
        PERFORM sync_private.reject(
          'INSUFFICIENT_STOCK',
          'Insufficient stock for ' || v_book.id || ':' || v_semester
        );
      END IF;
    END LOOP;

    INSERT INTO inventory_transactions (
      id, scope_id, academic_year, type, student_id, receipt_number,
      receipt_date, reversed_transaction_id, reversed_by_transaction_id,
      device_id, command_id, occurred_at, created_at
    ) VALUES (
      v_command_id, 'global', v_year, 'student_issue', v_student.id,
      NULL, NULL, NULL, NULL, v_device_id, v_command_id,
      v_occurred_at, v_occurred_at
    )
    RETURNING * INTO v_transaction;

    PERFORM sync_private.record_change(
      v_command_id, 'inventory_transactions', v_transaction.id,
      sync_private.transaction_payload(v_transaction), v_occurred_at
    );

    FOR v_selection IN
      SELECT selection
      FROM jsonb_array_elements(p_command->'bookSelections') selection
      ORDER BY selection->>'bookId', selection->>'semester'
    LOOP
      v_book_id := v_selection->>'bookId';
      v_semester := v_selection->>'semester';
      SELECT * INTO v_book FROM books WHERE id = v_book_id;

      IF v_semester = 'first' THEN
        v_quantity_after := v_book.first_semester_quantity - 1;
        UPDATE books SET
          first_semester_quantity = v_quantity_after,
          updated_at = v_occurred_at
        WHERE id = v_book_id
        RETURNING * INTO v_book;
      ELSE
        v_quantity_after := v_book.second_semester_quantity - 1;
        UPDATE books SET
          second_semester_quantity = v_quantity_after,
          updated_at = v_occurred_at
        WHERE id = v_book_id
        RETURNING * INTO v_book;
      END IF;

      INSERT INTO inventory_transaction_items (
        id, transaction_id, book_id, semester,
        quantity_delta, quantity_after, created_at
      ) VALUES (
        v_command_id || ':item:' || v_book_id || ':' || v_semester,
        v_transaction.id,
        v_book_id,
        v_semester,
        -1,
        v_quantity_after,
        v_occurred_at
      )
      RETURNING * INTO v_item;

      INSERT INTO student_books (
        id, scope_id, academic_year, student_id, book_id, semester,
        issued_transaction_id, created_at, reversed_at
      ) VALUES (
        v_command_id || ':student-book:' || v_book_id || ':' || v_semester,
        'global',
        v_year,
        v_student.id,
        v_book_id,
        v_semester,
        v_transaction.id,
        v_occurred_at,
        NULL
      )
      RETURNING * INTO v_student_book;

      PERFORM sync_private.record_change(
        v_command_id, 'inventory_transaction_items', v_item.id,
        sync_private.item_payload(v_item), v_occurred_at
      );
      PERFORM sync_private.record_change(
        v_command_id, 'student_books', v_student_book.id,
        sync_private.student_book_payload(v_student_book), v_occurred_at
      );
    END LOOP;

    FOR v_book IN
      SELECT * FROM books
      WHERE id IN (
        SELECT selection->>'bookId'
        FROM jsonb_array_elements(p_command->'bookSelections') selection
      )
      ORDER BY id
    LOOP
      PERFORM sync_private.record_change(
        v_command_id, 'books', v_book.id,
        sync_private.book_payload(v_book), v_occurred_at
      );
    END LOOP;

  ELSIF v_type = 'REVERSE_TRANSACTION' THEN
    v_year := p_command->>'academicYear';
    v_current := sync_private.assert_current_academic_year(v_year);

    SELECT * INTO v_original
    FROM inventory_transactions
    WHERE id = p_command->>'transactionId'
      OR command_id = p_command->>'transactionId'
    ORDER BY id
    LIMIT 1
    FOR UPDATE;
    IF NOT FOUND THEN
      PERFORM sync_private.reject(
        'VALIDATION_FAILED',
        'Unknown transaction: ' || coalesce(p_command->>'transactionId', '')
      );
    END IF;
    IF v_original.academic_year <> v_year THEN
      PERFORM sync_private.reject(
        'ACADEMIC_YEAR_ARCHIVED',
        'Archived academic year transactions cannot be reversed.'
      );
    END IF;
    IF v_original.type = 'reversal'
      OR v_original.reversed_by_transaction_id IS NOT NULL THEN
      PERFORM sync_private.reject(
        'TRANSACTION_ALREADY_REVERSED',
        'Transaction has already been reversed.'
      );
    END IF;

    PERFORM 1
    FROM books
    WHERE id IN (
      SELECT book_id FROM inventory_transaction_items
      WHERE transaction_id = v_original.id
    )
      AND deleted_at IS NULL
    ORDER BY id
    FOR UPDATE;
    SELECT count(DISTINCT book_id) INTO v_count
    FROM inventory_transaction_items
    WHERE transaction_id = v_original.id;
    IF v_count <> (
      SELECT count(*) FROM books
      WHERE id IN (
        SELECT book_id FROM inventory_transaction_items
        WHERE transaction_id = v_original.id
      )
        AND deleted_at IS NULL
    ) THEN
      PERFORM sync_private.reject(
        'UNKNOWN_BOOK',
        'A referenced book no longer exists.'
      );
    END IF;

    FOR v_item IN
      SELECT * FROM inventory_transaction_items
      WHERE transaction_id = v_original.id
      ORDER BY id
    LOOP
      SELECT * INTO v_book FROM books WHERE id = v_item.book_id;
      IF v_item.semester = 'first' THEN
        v_quantity_after := v_book.first_semester_quantity - v_item.quantity_delta;
      ELSE
        v_quantity_after := v_book.second_semester_quantity - v_item.quantity_delta;
      END IF;
      IF v_quantity_after < 0 THEN
        PERFORM sync_private.reject(
          'INSUFFICIENT_STOCK',
          'Reversal would make stock negative.'
        );
      END IF;
    END LOOP;

    INSERT INTO inventory_transactions (
      id, scope_id, academic_year, type, student_id, receipt_number,
      receipt_date, reversed_transaction_id, reversed_by_transaction_id,
      device_id, command_id, occurred_at, created_at
    ) VALUES (
      v_command_id, 'global', v_year, 'reversal', v_original.student_id,
      NULL, NULL, v_original.id, NULL, v_device_id, v_command_id,
      v_occurred_at, v_occurred_at
    )
    RETURNING * INTO v_transaction;

    PERFORM sync_private.record_change(
      v_command_id, 'inventory_transactions', v_transaction.id,
      sync_private.transaction_payload(v_transaction), v_occurred_at
    );

    FOR v_item IN
      SELECT * FROM inventory_transaction_items
      WHERE transaction_id = v_original.id
      ORDER BY id
    LOOP
      SELECT * INTO v_book FROM books WHERE id = v_item.book_id;
      v_quantity_after := CASE v_item.semester
        WHEN 'first' THEN v_book.first_semester_quantity - v_item.quantity_delta
        ELSE v_book.second_semester_quantity - v_item.quantity_delta
      END;

      IF v_item.semester = 'first' THEN
        UPDATE books SET
          first_semester_quantity = v_quantity_after,
          updated_at = v_occurred_at
        WHERE id = v_book.id
        RETURNING * INTO v_book;
      ELSE
        UPDATE books SET
          second_semester_quantity = v_quantity_after,
          updated_at = v_occurred_at
        WHERE id = v_book.id
        RETURNING * INTO v_book;
      END IF;

      INSERT INTO inventory_transaction_items (
        id, transaction_id, book_id, semester,
        quantity_delta, quantity_after, created_at
      ) VALUES (
        v_command_id || ':item:' || v_item.book_id || ':' || v_item.semester,
        v_transaction.id,
        v_item.book_id,
        v_item.semester,
        -v_item.quantity_delta,
        v_quantity_after,
        v_occurred_at
      )
      RETURNING * INTO v_item;

      PERFORM sync_private.record_change(
        v_command_id, 'inventory_transaction_items', v_item.id,
        sync_private.item_payload(v_item), v_occurred_at
      );
    END LOOP;

    UPDATE inventory_transactions
    SET reversed_by_transaction_id = v_transaction.id
    WHERE id = v_original.id
    RETURNING * INTO v_original;

    PERFORM sync_private.record_change(
      v_command_id, 'inventory_transactions', v_original.id,
      sync_private.transaction_payload(v_original), v_occurred_at
    );

    IF v_original.type = 'student_issue' THEN
      FOR v_student_book IN
        UPDATE student_books
        SET reversed_at = v_occurred_at
        WHERE issued_transaction_id = v_original.id
          AND reversed_at IS NULL
        RETURNING *
      LOOP
        PERFORM sync_private.record_change(
          v_command_id, 'student_books', v_student_book.id,
          sync_private.student_book_payload(v_student_book), v_occurred_at
        );
      END LOOP;
    END IF;

    FOR v_book IN
      SELECT * FROM books
      WHERE id IN (
        SELECT book_id FROM inventory_transaction_items
        WHERE transaction_id = v_original.id
      )
      ORDER BY id
    LOOP
      PERFORM sync_private.record_change(
        v_command_id, 'books', v_book.id,
        sync_private.book_payload(v_book), v_occurred_at
      );
    END LOOP;

  ELSE
    PERFORM sync_private.reject(
      'VALIDATION_FAILED',
      'Unknown sync command type: ' || coalesce(v_type, '')
    );
  END IF;
END
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync_api.sync_push(p_commands jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, sync_private
AS $function$
DECLARE
  v_command jsonb;
  v_command_id text;
  v_payload_hash text;
  v_status text;
  v_reason_code text;
  v_message text;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_existing applied_sync_commands%ROWTYPE;
BEGIN
  IF jsonb_typeof(p_commands) <> 'array'
    OR jsonb_array_length(p_commands) = 0
    OR jsonb_array_length(p_commands) > 100 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'sync_push requires between 1 and 100 commands.';
  END IF;

  FOR v_command IN
    SELECT command
    FROM jsonb_array_elements(p_commands) WITH ORDINALITY AS input(command, position)
    ORDER BY position
  LOOP
    v_command_id := nullif(btrim(v_command->>'id'), '');
    IF v_command_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'Every sync command requires a non-empty id.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(v_command_id, 0));
    v_payload_hash := encode(digest(v_command::text, 'sha256'), 'hex');

    SELECT * INTO v_existing
    FROM applied_sync_commands
    WHERE command_id = v_command_id
    FOR UPDATE;

    IF FOUND THEN
      IF v_existing.payload_hash <> v_payload_hash THEN
        v_result := jsonb_build_object(
          'commandId', v_command_id,
          'status', 'rejected',
          'reasonCode', 'VALIDATION_FAILED',
          'message', 'Command id was reused with a different payload.'
        );
      ELSIF v_existing.status = 'accepted' THEN
        v_result := jsonb_build_object(
          'commandId', v_command_id,
          'status', 'duplicate'
        );
      ELSE
        v_result := jsonb_strip_nulls(jsonb_build_object(
          'commandId', v_command_id,
          'status', v_existing.status,
          'reasonCode', v_existing.reason_code,
          'message', v_existing.message
        ));
      END IF;
    ELSE
      v_status := 'accepted';
      v_reason_code := NULL;
      v_message := NULL;

      BEGIN
        PERFORM sync_private.apply_command(v_command);
      EXCEPTION WHEN SQLSTATE 'P0001' THEN
        GET STACKED DIAGNOSTICS
          v_reason_code = MESSAGE_TEXT,
          v_message = PG_EXCEPTION_DETAIL;
        v_status := 'rejected';
      END;

      INSERT INTO applied_sync_commands (
        command_id,
        payload_hash,
        status,
        reason_code,
        message,
        applied_at
      ) VALUES (
        v_command_id,
        v_payload_hash,
        v_status,
        v_reason_code,
        v_message,
        coalesce(v_command->>'occurredAt', clock_timestamp()::text)
      );

      v_result := jsonb_strip_nulls(jsonb_build_object(
        'commandId', v_command_id,
        'status', v_status,
        'reasonCode', v_reason_code,
        'message', v_message
      ));
    END IF;

    v_results := v_results || jsonb_build_array(v_result);
  END LOOP;

  RETURN jsonb_build_object('results', v_results);
END
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync_api.sync_pull(p_since bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, sync_private
AS $function$
DECLARE
  v_changes jsonb;
  v_next_cursor bigint;
BEGIN
  IF p_since IS NULL OR p_since < 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Pull cursor must be a nonnegative integer.';
  END IF;

  SELECT
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'sequence', page.sequence,
          'commandId', page.command_id,
          'entityTable', page.entity_table,
          'entityId', page.entity_id,
          'payloadJson', page.payload_json,
          'createdAt', page.created_at
        )
        ORDER BY page.sequence
      ),
      '[]'::jsonb
    ),
    coalesce(max(page.sequence), p_since)
  INTO v_changes, v_next_cursor
  FROM (
    SELECT
      sequence,
      command_id,
      entity_table,
      entity_id,
      payload_json,
      created_at
    FROM sync_changes
    WHERE scope_id = 'global' AND sequence > p_since
    ORDER BY sequence
    LIMIT 200
  ) page;

  RETURN jsonb_build_object(
    'changes', v_changes,
    'nextCursor', v_next_cursor::text
  );
END
$function$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public, sync_api, sync_private
TO student_book_sync_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE
  academic_years,
  students,
  books,
  student_books,
  inventory_transactions,
  inventory_transaction_items,
  sync_changes,
  applied_sync_commands
TO student_book_sync_runtime;
--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE sync_changes_sequence_seq
TO student_book_sync_runtime;
--> statement-breakpoint
DO $membership$
BEGIN
  EXECUTE format(
    'GRANT student_book_sync_runtime TO %I',
    current_user
  );
END
$membership$;
--> statement-breakpoint
ALTER FUNCTION sync_private.reject(text, text)
OWNER TO student_book_sync_runtime;
--> statement-breakpoint
ALTER FUNCTION sync_private.valid_academic_year(text)
OWNER TO student_book_sync_runtime;
--> statement-breakpoint
ALTER FUNCTION sync_private.next_academic_year(text)
OWNER TO student_book_sync_runtime;
--> statement-breakpoint
ALTER FUNCTION sync_private.grade_allowed(text, text)
OWNER TO student_book_sync_runtime;
--> statement-breakpoint
ALTER FUNCTION sync_private.promoted_stage(text)
OWNER TO student_book_sync_runtime;
--> statement-breakpoint
ALTER FUNCTION sync_private.promoted_grade(text)
OWNER TO student_book_sync_runtime;
--> statement-breakpoint
ALTER FUNCTION sync_private.academic_year_payload(academic_years)
OWNER TO student_book_sync_runtime;
--> statement-breakpoint
ALTER FUNCTION sync_private.student_payload(students)
OWNER TO student_book_sync_runtime;
--> statement-breakpoint
ALTER FUNCTION sync_private.book_payload(books)
OWNER TO student_book_sync_runtime;
--> statement-breakpoint
ALTER FUNCTION sync_private.transaction_payload(inventory_transactions)
OWNER TO student_book_sync_runtime;
--> statement-breakpoint
ALTER FUNCTION sync_private.item_payload(inventory_transaction_items)
OWNER TO student_book_sync_runtime;
--> statement-breakpoint
ALTER FUNCTION sync_private.student_book_payload(student_books)
OWNER TO student_book_sync_runtime;
--> statement-breakpoint
ALTER FUNCTION sync_private.record_change(text, text, text, jsonb, text)
OWNER TO student_book_sync_runtime;
--> statement-breakpoint
ALTER FUNCTION sync_private.assert_current_academic_year(text)
OWNER TO student_book_sync_runtime;
--> statement-breakpoint
ALTER FUNCTION sync_private.apply_command(jsonb)
OWNER TO student_book_sync_runtime;
--> statement-breakpoint
ALTER FUNCTION sync_api.sync_push(jsonb)
OWNER TO student_book_sync_runtime;
--> statement-breakpoint
ALTER FUNCTION sync_api.sync_pull(bigint)
OWNER TO student_book_sync_runtime;
--> statement-breakpoint
REVOKE ALL ON SCHEMA sync_private FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sync_private FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON SCHEMA sync_api FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION sync_api.sync_push(jsonb) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION sync_api.sync_pull(bigint) FROM PUBLIC;
--> statement-breakpoint
DO $membership$
BEGIN
  EXECUTE format(
    'REVOKE student_book_sync_runtime FROM %I',
    current_user
  );
END
$membership$;
